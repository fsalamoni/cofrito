/**
 * Admin Process Queue - processamento encadeado PERSISTENTE do acervo.
 *
 * Arquitetura: FIRESTORE TRIGGER PATTERN
 *
 * O processamento e' feito em ETAPAS SEQUENCIAIS, uma de cada vez:
 *   1. JSON Creating - gera textContent (JSON v1 estruturado) a partir do textOriginal
 *   2. Classifying - roda analyzer (LLM ou heuristica) para gerar classification
 *   3. Key Points - gera keyPoints (citavel + items)
 *   4. Ementa Generating - gera ementa (assunto + sintese + fundamentacao + conclusao + keywords)
 *   5. Completed
 *
 * Cada doc da fila passa por TODAS as etapas. A fila persiste no Firestore
 * em admin-config/processing-queue. O estado de cada doc fica em
 * corpus/{docId}.processingState.
 *
 * O processamento e' ENCADEADO: 1 doc por vez, 1 etapa por vez.
 *
 * Disparador: onDocumentUpdated('admin-config/processing-queue').
 *   - Toda vez que a fila muda, o trigger e' chamado.
 *   - Ele faz lock transacional, executa UMA step, libera lock e atualiza lastTickAt.
 *   - Como a step atualiza o Firestore, o trigger re-dispara para a proxima step.
 *
 * Por que NAO recursao in-process:
 *   - Cloud Functions v2 tem timeout (ate 540s configurado aqui).
 *   - Recursao dentro de uma unica execucao morre quando o timeout bate.
 *   - Com trigger pattern, cada step e' uma invocacao Cloud Function independente.
 *
 * Garantias:
 *   - Se o user atualizar a pagina, o processamento continua (Firestore persiste)
 *   - Se o user sair, o processamento continua
 *   - Cada etapa tem status visivel (modal no frontend)
 *   - Erro em 1 doc NAO para a fila (vai para o proximo, registra erro)
 *   - Lock transacional impede 2 execucoes simultaneas
 *   - Throttle impede loop infinito do trigger
 */
import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getFirestore } from '../services/firestore'
import { assertAdminMaster } from '../middleware/auth'
import { textToStructuredJson, serializeStructuredJson } from '../services/document-json-converter'
import {
  analyzeAcervoDoc,
  getHeuristicAnalysis,
  type Classification,
  type Ementa,
  type KeyPoints,
} from '../services/acervo-analyzer'
import { resolveLLMConfigForAnalysis } from './admin-documents'
import type { LLMConfigLike } from '../services/llm-providers'

// ── Tipos ──────────────────────────────────────────────────────────────

export type ProcessingStep =
  | 'idle'
  | 'queued'
  | 'json_creating'
  | 'classifying'
  | 'key_points_extracting'
  | 'ementa_generating'
  | 'completed'
  | 'error'

const STEP_LABELS: Record<ProcessingStep, string> = {
  idle: 'Aguardando',
  queued: 'Na fila',
  json_creating: '1/4 Criando JSON estruturado',
  classifying: '2/4 Identificando classificação',
  key_points_extracting: '3/4 Extraindo pontos relevantes',
  ementa_generating: '4/4 Elaborando ementa',
  completed: 'Concluído',
  error: 'Erro',
}

const STEP_ORDER: ProcessingStep[] = [
  'queued',
  'json_creating',
  'classifying',
  'key_points_extracting',
  'ementa_generating',
  'completed',
]

interface ProcessingState {
  step: ProcessingStep
  stepLabel: string
  stepStartedAt?: TimeLike
  error?: string | null
  /** step que falhou */
  failedStep?: ProcessingStep | null
  /** numero de tentativas */
  retryCount?: number
  /** quando entrou na fila */
  queuedAt?: TimeLike
  /** quando completou */
  completedAt?: TimeLike
}

type TimeLike = FirebaseFirestore.Timestamp | Date | string | { _methodName: string }

interface QueueState {
  docIds: string[]
  currentDocId: string | null
  currentStep: ProcessingStep | null
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error'
  startedAt: TimeLike | null
  finishedAt: TimeLike | null
  lastTickAt: TimeLike | null
  totalDocs: number
  doneCount: number
  errorCount: number
  // Lock: true quando uma execucao do trigger ja' esta' processando
  processing?: boolean
  // Nome do user que iniciou (para auditoria)
  startedBy?: string | null
}

const QUEUE_DOC_PATH = 'admin-config/processing-queue'
const MAX_RETRIES_PER_STEP = 1   // 1 retry (evita gastar minutos em docs deterministicamente ruins)
const STEP_TIMEOUT_MS = 90_000   // 90s por step (anti-hang; alinhado ao timeout do LLM)
/**
 * Se o lock (processing:true) ficar parado por mais que isso sem avancar, a
 * invocacao anterior provavelmente morreu (timeout/crash). Permitimos "roubar"
 * o lock para destravar a fila — evita ficar preso para sempre.
 */
const STALE_LOCK_MS = 150_000    // 2,5 min

// ── 1) Trigger: reage a atualizacoes do queue doc ──────────────────────

/**
 * Trigger reativo: cada vez que o doc admin-config/processing-queue e'
 * atualizado, verifica se precisa processar e (se sim) executa UMA step.
 *
 * Apos executar a step, atualiza o Firestore (set lastTickAt, libera lock,
 * atualiza currentStep). Esse update re-dispara este trigger, que fara'
 * a proxima step. E' assim que o encadeamento acontece, sem recursao.
 */
export const onProcessingQueueUpdated = onDocumentUpdated(
  {
    document: 'admin-config/processing-queue',
    region: 'southamerica-east1',
    timeoutSeconds: 540,
    memory: '1GiB',
    cpu: 1,
  },
  async (event) => {
    const after = event.data?.after.data() as QueueState | undefined
    if (!after) return

    // SÓ age se a fila estiver "running"
    if (after.status !== 'running') return

    // Se ha um lock ATIVO e recente, deixa a invocacao dona continuar (ela
    // processa varias steps em loop). Só intervimos se o lock estiver "stale"
    // (invocacao anterior morreu).
    if (after.processing === true && !isStaleLock(after.lastTickAt)) return

    // Drena a fila em loop (varias steps/docs numa mesma invocacao) ate acabar
    // ou ate o orcamento de tempo do trigger. Isso torna o encadeamento
    // confiavel (NAO depende de re-disparo do trigger a cada step).
    const budgetMs = 500_000  // ~8,3 min (timeout do trigger e' 540s)
    try {
      const result = await drainQueue(budgetMs)
      logger.info('onProcessingQueueUpdated.drain', result)
    } catch (err) {
      logger.error('onProcessingQueueUpdated.error', { err: String(err), stack: (err as Error).stack })
      const db = getFirestore()
      await db.doc(QUEUE_DOC_PATH).set({ processing: false, lastTickAt: FieldValue.serverTimestamp() }, { merge: true })
    }
  },
)

// ── 1b) Driver AGENDADO: garante avanço mesmo sem updates/frontend ──────

/**
 * Roda a cada 1 minuto. Se a fila estiver 'running', DRENA (processa) — mesmo
 * que o trigger nao tenha disparado (ex: fila parada ha' horas) e mesmo com o
 * navegador fechado. Recupera locks travados. Esta e' a rede de seguranca
 * DEFINITIVA: o processamento NUNCA fica preso para sempre.
 */
export const scheduledQueueDriver = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: 'southamerica-east1',
    timeoutSeconds: 300,
    memory: '1GiB',
    cpu: 1,
  },
  async () => {
    const db = getFirestore()
    const snap = await db.doc(QUEUE_DOC_PATH).get()
    if (!snap.exists) return
    const q = snap.data() as QueueState
    if (q.status !== 'running') return
    // Se ha um drain ATIVO e recente, deixa ele continuar.
    if (q.processing === true && !isStaleLock(q.lastTickAt)) {
      logger.debug('scheduledQueueDriver: drain em andamento, skip')
      return
    }
    const result = await drainQueue(280_000)
    logger.info('scheduledQueueDriver.done', result)
  },
)

// ── 2) Helper compartilhado: enfileirar docs para processamento ─────────

/**
 * Adiciona docIds a fila de processamento encadeado (1-por-1, 1-step-por-vez).
 *
 * Comportamento:
 *  - Reseta o processingState de cada doc para 'queued'
 *  - Atualiza admin-config/processing-queue com status='running' e docIds[]
 *  - Limpa lock + seta lastTickAt=now para forcar o trigger a rodar
 *  - NAO processa nada diretamente: o trigger onProcessingQueueUpdated pega
 *
 * Esta funcao e' compartilhada entre:
 *  - adminStartQueue (onCall - endpoint publico)
 *  - adminReanalyzeBatch (onCall)
 *  - adminReanalyzeDocument (onCall)
 *  - adminUploadDocument (apos upload, para ja' entrar na fila)
 */
export async function enqueueDocsForProcessing(
  docIds: string[],
  uid: string,
): Promise<{ queued: number; totalInQueue: number; docIdsAdded: string[] }> {
  if (docIds.length === 0) {
    return { queued: 0, totalInQueue: 0, docIdsAdded: [] }
  }

  const db = getFirestore()

  // Resetar estado dos docs para 'queued'
  const batch = db.batch()
  for (const docId of docIds) {
    const docRef = db.doc(`corpus/${docId}`)
    batch.set(
      docRef,
      {
        status: 'analise_pendente',  // visivel ao usuario; vira 'analise_processando' quando o trigger pegar
        processingState: {
          step: 'queued' as ProcessingStep,
          stepLabel: STEP_LABELS.queued,
          queuedAt: FieldValue.serverTimestamp() as FirebaseFirestore.FieldValue,
          error: null,
          failedStep: null,
          retryCount: 0,
        } as unknown as ProcessingState,
      },
      { merge: true },
    )
  }
  await batch.commit()

  // Atualizar fila
  const queueRef = db.doc(QUEUE_DOC_PATH)
  const queueSnap = await queueRef.get()
  const existing = queueSnap.exists ? (queueSnap.data() as QueueState) : null
  const existingIds = existing?.docIds || []
  const newDocIds = Array.from(new Set([...existingIds, ...docIds]))

  const newQueue: Partial<QueueState> = {
    docIds: newDocIds,
    currentDocId: existing?.currentDocId || docIds[0],
    currentStep: existing?.currentStep || 'queued',
    status: 'running',
    finishedAt: null,
    lastTickAt: new Date(),  // garante que o trigger pegue IMEDIATAMENTE
    processing: false,
    totalDocs: (existing?.totalDocs || 0) + docIds.length,
    doneCount: existing?.doneCount || 0,
    errorCount: existing?.errorCount || 0,
    startedBy: uid,
  }
  if (!existing?.startedAt) {
    newQueue.startedAt = new Date()
  }
  await queueRef.set(newQueue, { merge: true })

  logger.info('enqueueDocsForProcessing.queued', {
    added: docIds.length,
    totalInQueue: newDocIds.length,
    uid,
  })

  return {
    queued: docIds.length,
    totalInQueue: newDocIds.length,
    docIdsAdded: docIds,
  }
}

// ── 3) Start: endpoint publico para enfileirar docs ─────────────────────

/**
 * Apenas enfileira os docs e marca status='running'.
 * O trigger onProcessingQueueUpdated pega a partir daqui.
 */
export const adminStartQueue = onCall(
  { cors: true, enforceAppCheck: false, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)

    const { docIds, selectAll } = (request.data || {}) as {
      docIds?: string[]
      selectAll?: boolean
    }

    if (!Array.isArray(docIds) && !selectAll) {
      throw new HttpsError('invalid-argument', 'docIds (array) ou selectAll=true é obrigatório')
    }
    if (Array.isArray(docIds) && docIds.length > 500) {
      throw new HttpsError('invalid-argument', 'Máximo 500 docs por batch')
    }

    const db = getFirestore()

    // Coletar docIds
    let targetDocIds: string[] = []
    if (selectAll) {
      const snap = await db.collection('corpus').limit(500).get()
      targetDocIds = snap.docs.map(d => d.id)
    } else {
      for (const docId of docIds!) {
        const snap = await db.doc(`corpus/${docId}`).get()
        if (snap.exists) targetDocIds.push(docId)
      }
    }

    if (targetDocIds.length === 0) {
      return { ok: true, queued: 0, message: 'Nenhum documento encontrado' }
    }

    const result = await enqueueDocsForProcessing(targetDocIds, request.auth.uid)

    return {
      ok: true,
      queued: result.queued,
      totalInQueue: result.totalInQueue,
      message: `${result.queued} documento(s) adicionado(s) à fila de processamento`,
    }
  },
)

// ── 3) Get status: retorna fila + estado de cada doc ──────────────────

export const adminGetQueueStatus = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)

    const db = getFirestore()
    const queueSnap = await db.doc(QUEUE_DOC_PATH).get()
    const queue = queueSnap.exists ? (queueSnap.data() as QueueState) : null

    if (!queue || queue.docIds.length === 0) {
      return { queue: null, docs: [] }
    }

    // Buscar estado de cada doc da fila (limite 30 para performance)
    const docRefs = queue.docIds.slice(0, 30).map((id) => db.doc(`corpus/${id}`))
    const docSnaps = await db.getAll(...docRefs)
    const docs = docSnaps.map((snap) => {
      const data = snap.data() || {}
      return {
        id: snap.id,
        fileName: data.fileName,
        processingState: data.processingState || { step: 'queued' as ProcessingStep, stepLabel: STEP_LABELS.queued },
        hasTextContent: !!data.textContent,
        hasClassification: !!data.classification,
        hasKeyPoints: !!data.keyPoints,
        hasEmenta: !!data.ementa,
      }
    })

    return { queue, docs }
  },
)

// ── 4) Limpar fila ─────────────────────────────────────────────────────

export const adminClearQueue = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)

    const db = getFirestore()
    await db.doc(QUEUE_DOC_PATH).delete()
    // Limpar processingState de todos os docs
    const snap = await db.collection('corpus').limit(500).get()
    const batch = db.batch()
    snap.docs.forEach((d) => {
      batch.set(d.ref, { processingState: FieldValue.delete() }, { merge: true })
    })
    await batch.commit()
    return { ok: true, message: 'Fila limpa' }
  },
)

// ── 5) Manual tick (HTTP, sem auth) - fallback de recuperacao ──────────

/**
 * FALLBACK: drena a fila manualmente. Usado quando o trigger nao esta'
 * disparando (ex: em emergencias ou para retomar fila travada).
 */
export const adminProcessQueueTick = onRequest(
  { cors: true, region: 'southamerica-east1', timeoutSeconds: 540, memory: '1GiB' },
  async (_req, res) => {
    try {
      const result = await drainQueue(500_000)
      res.json({ ok: true, ...result })
    } catch (err) {
      logger.error('adminProcessQueueTick.error', { err: String(err) })
      res.status(500).json({ ok: false, error: String((err as Error).message) })
    }
  },
)

// ── 6) Public endpoint para o user forcar tick (onCall) ───────────────

export const adminForceQueueTick = onCall(
  { cors: true, enforceAppCheck: false, timeoutSeconds: 120, memory: '1GiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)

    // Orcamento curto: a chamada retorna rapido e o frontend re-invoca (poll).
    // Se o trigger ja' estiver drenando (lock ativo), retorna imediatamente.
    const result = await drainQueue(45_000)
    return { ok: true, ...result }
  },
)

// ── Core: driver que DRENA a fila (varias steps por invocacao) ─────────

interface AdvanceResult {
  more: boolean
  processed: boolean
  currentDocId: string | null
  currentStep: ProcessingStep | null
  queueStatus: 'idle' | 'running' | 'paused' | 'completed' | 'error'
}

/** true se o lock (processing:true) esta' parado ha' tempo demais (invocacao morta). */
export function isStaleLock(lastTickAt: TimeLike | null | undefined): boolean {
  const ms = toMillis(lastTickAt)
  if (ms <= 0) return true
  return (Date.now() - ms) > STALE_LOCK_MS
}

/**
 * Drena a fila: adquire o lock UMA vez e processa steps/docs em LOOP ate a fila
 * acabar ou o orcamento de tempo esgotar. Cada step grava estado no Firestore,
 * entao o frontend (onSnapshot) ve o progresso ao vivo, doc por doc, etapa por etapa.
 *
 * Confiavel: NAO depende do trigger re-disparar a cada step (o loop interno faz o
 * encadeamento). O lock impede execucoes concorrentes; lock stale e' recuperado.
 */
async function drainQueue(budgetMs: number): Promise<AdvanceResult> {
  const db = getFirestore()
  const queueRef = db.doc(QUEUE_DOC_PATH)
  const deadline = Date.now() + budgetMs

  // Adquirir o lock (transacional; rouba lock stale)
  let acquired = false
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(queueRef)
      if (!fresh.exists) return
      const q = fresh.data() as QueueState
      if (q.status !== 'running') return
      if (q.processing === true && !isStaleLock(q.lastTickAt)) return
      acquired = true
      tx.update(queueRef, { processing: true, lastTickAt: FieldValue.serverTimestamp() })
    })
  } catch (err) {
    logger.error('drainQueue.lockError', { err: String(err) })
    return { more: false, processed: false, currentDocId: null, currentStep: null, queueStatus: 'error' }
  }
  if (!acquired) {
    // Outra invocacao ja' esta' drenando (ou fila nao esta' running).
    return { more: false, processed: false, currentDocId: null, currentStep: null, queueStatus: 'running' }
  }

  let last: AdvanceResult = { more: false, processed: false, currentDocId: null, currentStep: null, queueStatus: 'running' }
  let iterations = 0
  let lastHeartbeat = Date.now()
  try {
    while (Date.now() < deadline) {
      last = await advanceOnce()
      iterations++
      // Heartbeat NA FILA no maximo a cada 4s (mantem lastTickAt fresco p/ o
      // stale-lock e para a UI, sem escrever no doc da fila a cada etapa).
      if (Date.now() - lastHeartbeat > 4000) {
        try { await queueRef.set({ lastTickAt: FieldValue.serverTimestamp() }, { merge: true }) } catch { /* ignora */ }
        lastHeartbeat = Date.now()
      }
      if (!last.more) break
      if (iterations > 10000) { logger.warn('drainQueue.tooManyIterations'); break }
    }
  } catch (err) {
    logger.error('drainQueue.fatal', { err: String((err as Error).message), stack: (err as Error).stack })
  } finally {
    await releaseLock(queueRef)
  }
  logger.info('drainQueue.done', { iterations, queueStatus: last.queueStatus })
  return last
}

/**
 * Processa UMA unidade de trabalho (uma step OU um avanco de doc) e RETORNA.
 * NAO gerencia o lock (o drainQueue e' o dono). Retorna `more` indicando se
 * ainda ha' trabalho (o drainQueue continua o loop enquanto more=true).
 */
async function advanceOnce(): Promise<AdvanceResult> {
  const db = getFirestore()
  const queueRef = db.doc(QUEUE_DOC_PATH)

  const queueSnap = await queueRef.get()
  if (!queueSnap.exists) {
    return { more: false, processed: false, currentDocId: null, currentStep: null, queueStatus: 'idle' }
  }
  const queue = queueSnap.data() as QueueState

  if (queue.status === 'completed' || queue.status === 'paused') {
    return { more: false, processed: false, currentDocId: queue.currentDocId, currentStep: queue.currentStep, queueStatus: queue.status }
  }

  // Selecionar o doc atual (ou o proximo da fila)
  let currentDocId = queue.currentDocId
  if (!currentDocId || !queue.docIds.includes(currentDocId)) {
    currentDocId = queue.docIds[0] || null
    if (!currentDocId) {
      await markQueueCompleted(queueRef)
      return { more: false, processed: false, currentDocId: null, currentStep: null, queueStatus: 'completed' }
    }
    await queueRef.set({ currentDocId }, { merge: true })
  }
  const currentDocRef = db.doc(`corpus/${currentDocId}`)

  const docSnap = await currentDocRef.get()
  if (!docSnap.exists) {
    // Doc sumiu - remove da fila e segue
    const remaining = queue.docIds.filter((id) => id !== currentDocId)
    await queueRef.set(
      { docIds: remaining, currentDocId: null, errorCount: (queue.errorCount || 0) + 1, lastTickAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
    if (remaining.length === 0) {
      await markQueueCompleted(queueRef)
      return { more: false, processed: true, currentDocId: null, currentStep: null, queueStatus: 'completed' }
    }
    return { more: true, processed: true, currentDocId: null, currentStep: null, queueStatus: 'running' }
  }

  const docData = docSnap.data() || {}
  const processingState: ProcessingState =
    (docData.processingState as ProcessingState | undefined) || { step: 'queued' as ProcessingStep, stepLabel: STEP_LABELS.queued }
  const step: ProcessingStep = processingState.step || 'queued'

  // Marca o doc como 'analise_processando' (visivel na UI) ao entrar em execucao.
  if ((docData.status as string) !== 'analise_processando') {
    await currentDocRef.set(
      { status: 'analise_processando', analysisStartedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
  }

  // 'completed' -> proximo doc
  if (step === 'completed') {
    return await advanceToNextDoc(queue, currentDocId)
  }

  // 'queued' -> TRANSICIONA para a 1a etapa real (json_creating) SEM executar.
  // (Bug antigo: executeStep('queued') caia no default e ERRAVA todo doc.)
  if (step === 'queued') {
    const first: ProcessingStep = 'json_creating'
    // Escreve só no DOC (o progresso por-etapa vem do processingState do doc).
    // NAO escreve no doc da fila a cada etapa (evita "hot document" / DEADLINE).
    await currentDocRef.set(
      { processingState: { step: first, stepLabel: STEP_LABELS[first], stepStartedAt: FieldValue.serverTimestamp(), error: null, failedStep: null, retryCount: 0 } },
      { merge: true },
    )
    return { more: true, processed: true, currentDocId, currentStep: first, queueStatus: 'running' }
  }

  // 'error' -> retry ou pula
  if (step === 'error') {
    const retryCount = processingState.retryCount || 0
    if (retryCount < MAX_RETRIES_PER_STEP && processingState.failedStep) {
      await currentDocRef.set(
        { processingState: { step: processingState.failedStep, stepLabel: STEP_LABELS[processingState.failedStep], stepStartedAt: FieldValue.serverTimestamp(), error: null, failedStep: null, retryCount: retryCount + 1 } },
        { merge: true },
      )
      return { more: true, processed: true, currentDocId, currentStep: processingState.failedStep, queueStatus: 'running' }
    }
    logger.warn('advanceOnce.skippedAfterError', { docId: currentDocId, error: processingState.error })
    return await advanceToNextDoc(queue, currentDocId, true)
  }

  // Executar a step real
  try {
    await executeStep(currentDocId, currentDocRef, docData, step)
    const nextStep = getNextStep(step)
    if (nextStep === 'completed') {
      // Doc concluido: limpa erros antigos (analysisError) e marca analisado.
      await currentDocRef.set(
        {
          processingState: { step: 'completed', stepLabel: STEP_LABELS.completed, completedAt: FieldValue.serverTimestamp(), error: null, failedStep: null },
          status: 'analisado',
          analyzedAt: FieldValue.serverTimestamp(),
          analysisError: FieldValue.delete(),
        },
        { merge: true },
      )
      // Escrita na fila apenas por-doc (doneCount), nao por-etapa.
      await queueRef.set({ doneCount: (queue.doneCount || 0) + 1 }, { merge: true })
      logger.info('advanceOnce.docCompleted', { docId: currentDocId })
      return await advanceToNextDoc(queue, currentDocId)
    }
    // Proxima etapa do MESMO doc: escreve só no DOC (progresso ao vivo por-doc).
    await currentDocRef.set(
      { processingState: { step: nextStep, stepLabel: STEP_LABELS[nextStep], stepStartedAt: FieldValue.serverTimestamp(), error: null } },
      { merge: true },
    )
    return { more: true, processed: true, currentDocId, currentStep: nextStep, queueStatus: 'running' }
  } catch (err) {
    const errMsg = (err as Error).message
    logger.error('advanceOnce.stepError', { docId: currentDocId, step, err: errMsg })
    await currentDocRef.set(
      { processingState: { step: 'error', stepLabel: STEP_LABELS.error, error: errMsg, failedStep: step, retryCount: processingState.retryCount || 0 }, status: 'erro_analise', analysisError: `Etapa '${step}' falhou: ${errMsg}` },
      { merge: true },
    )
    await queueRef.set({ errorCount: (queue.errorCount || 0) + 1 }, { merge: true })
    return { more: true, processed: true, currentDocId, currentStep: 'error', queueStatus: 'running' }
  }
}

/** Marca a fila como concluida. */
async function markQueueCompleted(queueRef: FirebaseFirestore.DocumentReference): Promise<void> {
  await queueRef.set(
    { docIds: [], currentDocId: null, currentStep: null, status: 'completed', finishedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
}

/**
 * Libera o lock e atualiza lastTickAt. Chamado ao fim de cada drainQueue.
 */
async function releaseLock(queueRef: FirebaseFirestore.DocumentReference): Promise<void> {
  try {
    await queueRef.set({ processing: false, lastTickAt: FieldValue.serverTimestamp() }, { merge: true })
  } catch (err) {
    logger.error('releaseLock.error', { err: String(err) })
  }
}

/**
 * Avanca para o proximo doc da fila. NAO gerencia lock. Retorna more.
 */
async function advanceToNextDoc(
  queue: QueueState,
  currentDocId: string,
  _hadError = false,
): Promise<AdvanceResult> {
  const db = getFirestore()
  const queueRef = db.doc(QUEUE_DOC_PATH)

  const remainingDocIds = queue.docIds.filter((id) => id !== currentDocId)
  const nextDocId = remainingDocIds[0] || null

  if (!nextDocId) {
    await markQueueCompleted(queueRef)
    return { more: false, processed: true, currentDocId: null, currentStep: null, queueStatus: 'completed' }
  }

  const nextDocRef = db.doc(`corpus/${nextDocId}`)
  await nextDocRef.set(
    { processingState: { step: 'queued' as ProcessingStep, stepLabel: STEP_LABELS.queued, queuedAt: FieldValue.serverTimestamp(), error: null, failedStep: null, retryCount: 0 } },
    { merge: true },
  )
  // Uma escrita na fila por-doc (troca do doc atual). lastTickAt vem do heartbeat.
  await queueRef.set(
    { docIds: remainingDocIds, currentDocId: nextDocId },
    { merge: true },
  )
  return { more: true, processed: true, currentDocId: nextDocId, currentStep: 'queued', queueStatus: 'running' }
}

/**
 * Converte TimeLike para millisegundos, ou 0 se invalido.
 */
function toMillis(t: TimeLike | null | undefined): number {
  if (!t) return 0
  if (t instanceof Timestamp) return t.toMillis()
  if (t instanceof Date) return t.getTime()
  if (typeof t === 'string') {
    const ms = new Date(t).getTime()
    return Number.isFinite(ms) ? ms : 0
  }
  return 0
}

/**
 * Executa 1 step de 1 doc.
 * Step values: 'json_creating' | 'classifying' | 'key_points_extracting' | 'ementa_generating'
 */
async function executeStep(
  docId: string,
  docRef: FirebaseFirestore.DocumentReference,
  docData: Record<string, unknown>,
  step: ProcessingStep,
): Promise<void> {
  const logPrefix = `executeStep.${step}.${docId}`
  logger.info(logPrefix + '.start')

  const timeout = (ms: number, label: string) =>
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} > ${ms}ms`)), ms))

  switch (step) {
    case 'json_creating': {
      // (Re)gera textContent a partir de textOriginal. Se nao houver textOriginal
      // mas ja' existir textContent (criado no upload), mantem o existente (NAO erra).
      const textOriginal = (docData.textOriginal as string) || ''
      const existingTextContent = (docData.textContent as string) || ''
      const fileName = (docData.fileName as string) || docId
      if (!textOriginal || textOriginal.length < 10) {
        if (existingTextContent && existingTextContent.length > 10) {
          logger.info(logPrefix + '.skipped', { reason: 'sem textOriginal, mantendo textContent existente' })
          return
        }
        // Sem NENHUM texto: documento nao analisavel (PDF de imagem?). Erro claro.
        throw new Error('Documento sem texto extraivel (possivel PDF de imagem/escaneado)')
      }
      const pageCount = ((docData.meta as Record<string, unknown> | undefined)?.pages as number | undefined)
      const structured = textToStructuredJson(textOriginal.slice(0, 900_000), fileName, pageCount)
      const textContentJson = serializeStructuredJson(structured)
      await Promise.race([
        docRef.set(
          {
            textContent: textContentJson,
            storageFormat: 'json-v1',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
        timeout(STEP_TIMEOUT_MS, 'json_creating'),
      ])
      logger.info(logPrefix + '.done', { size: textContentJson.length })
      return
    }

    case 'classifying': {
      // Roda analyzer (LLM ou heuristica) - ja' gera classification
      const text = ((docData.textOriginal as string) || (docData.textContent as string) || '').slice(0, 50_000)
      if (!text || text.length < 10) {
        throw new Error('Texto vazio para classificar')
      }
      const fileName = (docData.fileName as string) || docId

      let llmConfig: LLMConfigLike | null = await resolveLLMConfigForAnalysis(docId)
      let acervoExtra = ''
      try {
        const { loadAgentsConfig, resolveAgentLLMConfig, buildAgentSkillsPrompt } = await import('../services/agents-config')
        const { loadLegalTaxonomy, buildTaxonomyPromptBlock } = await import('../services/legal-taxonomy')
        const [agentsConfig, taxonomy] = await Promise.all([loadAgentsConfig(), loadLegalTaxonomy()])
        const acervoAgent = agentsConfig.agents.acervo
        acervoExtra = [buildTaxonomyPromptBlock(taxonomy), buildAgentSkillsPrompt(acervoAgent)]
          .filter(Boolean).join('\n\n')
        const resolved = resolveAgentLLMConfig(acervoAgent, llmConfig as LLMConfigLike | null)
        if (resolved) llmConfig = resolved
      } catch (err) {
        logger.warn('process-queue: falha ao resolver agents-config/taxonomia', { err: (err as Error).message })
      }
      let result: { classification: Classification | null; ementa: Ementa | null; keyPoints: KeyPoints }
      let method: 'llm' | 'heuristic' = 'heuristic'

      if (llmConfig) {
        const r = await Promise.race([
          analyzeAcervoDoc({
            uid: docId,
            docId,
            fileName,
            text,
            llmConfig: llmConfig as LLMConfigLike,
            extraInstructions: acervoExtra,
          }),
          timeout(STEP_TIMEOUT_MS, 'classifying'),
        ])
        result = r
        method = r.method  // 'llm' se o modelo respondeu; 'heuristic' se caiu no fallback
      } else {
        // Sem LLM configurado - usa heuristica
        result = getHeuristicAnalysis(fileName, text)
        method = 'heuristic'
      }

      await docRef.set(
        {
          classification: result.classification,
          ementa: result.ementa,
          keyPoints: result.keyPoints,
          analysisMethod: method,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      logger.info(logPrefix + '.done', { hasClassification: !!result.classification, hasEmenta: !!result.ementa, method })
      return
    }

    case 'key_points_extracting': {
      // Refina os pontos relevantes (pode usar LLM separado ou ja' tem do classifying)
      // Aqui, vamos regenerar se o classification nao tiver keyPoints
      const text = ((docData.textOriginal as string) || (docData.textContent as string) || '').slice(0, 50_000)
      const fileName = (docData.fileName as string) || docId
      const existingKeyPoints = (docData.keyPoints as KeyPoints) || null
      if (existingKeyPoints && existingKeyPoints.items && existingKeyPoints.items.length > 0) {
        // Ja' tem, pular
        logger.info(logPrefix + '.skipped', { reason: 'already has keyPoints' })
        return
      }
      // Sem keyPoints - regenera via heuristica
      const heur = getHeuristicAnalysis(fileName, text)
      await docRef.set(
        {
          keyPoints: heur.keyPoints,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      logger.info(logPrefix + '.done', { count: heur.keyPoints.items.length })
      return
    }

    case 'ementa_generating': {
      // Regenera ementa se necessario
      const text = ((docData.textOriginal as string) || (docData.textContent as string) || '').slice(0, 50_000)
      const fileName = (docData.fileName as string) || docId
      const existingEmenta = (docData.ementa as Ementa) || null
      if (existingEmenta && existingEmenta.assunto && existingEmenta.sintese) {
        logger.info(logPrefix + '.skipped', { reason: 'already has ementa' })
        return
      }
      const heur = getHeuristicAnalysis(fileName, text)
      await docRef.set(
        {
          ementa: heur.ementa,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      logger.info(logPrefix + '.done', { assunto: heur.ementa.assunto })
      return
    }

    default:
      throw new Error(`Step desconhecido: ${step}`)
  }
}

export function getNextStep(currentStep: ProcessingStep): ProcessingStep {
  const idx = STEP_ORDER.indexOf(currentStep)
  if (idx === -1 || idx === STEP_ORDER.length - 1) {
    return 'completed'
  }
  return STEP_ORDER[idx + 1]
}
