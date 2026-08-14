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
const MAX_RETRIES_PER_STEP = 2
const STEP_TIMEOUT_MS = 120_000  // 2 min por step (anti-hang)
const TICK_THROTTLE_MS = 800     // anti-loop do trigger (ms)

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
    if (!after) {
      logger.debug('onProcessingQueueUpdated: no data')
      return
    }

    // SÓ age se a fila estiver em estado "running"
    if (after.status !== 'running') {
      logger.debug('onProcessingQueueUpdated: status != running, skip', { status: after.status })
      return
    }

    // SÓ age se nao houver execucao em andamento (lock)
    if (after.processing === true) {
      logger.debug('onProcessingQueueUpdated: lock ativo, skip')
      return
    }

    // THROTTLE: se a ultima tick foi muito recente, ignora (anti-loop)
    const lastTickMs = toMillis(after.lastTickAt)
    if (lastTickMs > 0) {
      const sinceLastTick = Date.now() - lastTickMs
      if (sinceLastTick < TICK_THROTTLE_MS) {
        logger.debug('onProcessingQueueUpdated: throttled', { sinceLastTick })
        return
      }
    }

    // Tentar adquirir lock transacionalmente
    const db = getFirestore()
    const queueRef = db.doc(QUEUE_DOC_PATH)
    let acquired = false
    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(queueRef)
        if (!fresh.exists) return
        const freshData = fresh.data() as QueueState
        if (freshData.status !== 'running') return
        if (freshData.processing === true) return
        // verificar throttle tambem dentro da transacao
        const lastMs = toMillis(freshData.lastTickAt)
        if (lastMs > 0 && (Date.now() - lastMs) < TICK_THROTTLE_MS) return
        acquired = true
        tx.update(queueRef, { processing: true })
      })
    } catch (err) {
      logger.error('onProcessingQueueUpdated.lockError', { err: String(err) })
      return
    }

    if (!acquired) {
      logger.debug('onProcessingQueueUpdated: lock nao adquirido')
      return
    }

    // Processar UMA step
    try {
      const result = await processSingleStep()
      logger.info('onProcessingQueueUpdated.tick', result)
    } catch (err) {
      logger.error('onProcessingQueueUpdated.error', { err: String(err), stack: (err as Error).stack })
      // Liberar lock mesmo em erro
      await queueRef.set({ processing: false, lastTickAt: FieldValue.serverTimestamp() }, { merge: true })
    }
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
 * FALLBACK: chama processSingleStep manualmente. Usado quando o trigger
 * nao esta' disparando (ex: em emergencias ou para retomar fila travada).
 */
export const adminProcessQueueTick = onRequest(
  { cors: true, region: 'southamerica-east1', timeoutSeconds: 540, memory: '1GiB' },
  async (_req, res) => {
    try {
      const result = await processSingleStep()
      res.json({ ok: true, ...result })
    } catch (err) {
      logger.error('adminProcessQueueTick.error', { err: String(err) })
      res.status(500).json({ ok: false, error: String((err as Error).message) })
    }
  },
)

// ── 6) Public endpoint para o user forcar tick (onCall) ───────────────

export const adminForceQueueTick = onCall(
  { cors: true, enforceAppCheck: false, timeoutSeconds: 540, memory: '1GiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)

    const result = await processSingleStep()
    return { ok: true, ...result }
  },
)

// ── Core: processSingleStep (UMA step, sem recursao) ──────────────────

/**
 * Processa UMA unica step do doc atual, depois RETORNA.
 * Quem chamou (trigger ou admin) decide se chama de novo.
 *
 * IMPORTANTE: esta funcao NAO chama a si mesma. O encadeamento acontece
 * via trigger onDocumentUpdated, que re-dispara cada vez que a fila muda.
 */
async function processSingleStep(): Promise<{
  processed: boolean
  currentDocId: string | null
  currentStep: ProcessingStep | null
  queueStatus: 'idle' | 'running' | 'paused' | 'completed' | 'error'
}> {
  const db = getFirestore()
  const queueRef = db.doc(QUEUE_DOC_PATH)

  try {
    const queueSnap = await queueRef.get()
    if (!queueSnap.exists) {
      await releaseLock(queueRef)
      return { processed: false, currentDocId: null, currentStep: null, queueStatus: 'idle' }
    }
    const queue = queueSnap.data() as QueueState

    // Se ja' terminou ou pausado, libera lock e sai
    if (queue.status === 'completed' || queue.status === 'paused') {
      await releaseLock(queueRef)
      return {
        processed: false,
        currentDocId: queue.currentDocId,
        currentStep: queue.currentStep,
        queueStatus: queue.status,
      }
    }

    // Pegar doc atual
    let currentDocId = queue.currentDocId
    let currentDocRef = currentDocId ? db.doc(`corpus/${currentDocId}`) : null

    // Se nao tem doc atual, pegar o proximo da fila
    if (!currentDocId || !currentDocRef) {
      const nextDocId = queue.docIds.find((id) => id !== queue.currentDocId) || queue.docIds[0]
      if (!nextDocId) {
        // Fila vazia
        await queueRef.set(
          { status: 'completed', finishedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
        await releaseLock(queueRef)
        return { processed: false, currentDocId: null, currentStep: null, queueStatus: 'completed' }
      }
      await queueRef.set({ currentDocId: nextDocId }, { merge: true })
      currentDocId = nextDocId
      currentDocRef = db.doc(`corpus/${currentDocId}`)
    }

    // Carregar doc
    const docSnap = await currentDocRef.get()
    if (!docSnap.exists) {
      // Doc nao existe mais - remover da fila
      const remainingDocIds = queue.docIds.filter((id) => id !== currentDocId)
      await queueRef.set(
        { docIds: remainingDocIds, currentDocId: null, errorCount: (queue.errorCount || 0) + 1 },
        { merge: true },
      )
      await releaseLock(queueRef)
      // SEM recursao. O trigger re-dispara para pegar o proximo.
      if (remainingDocIds.length === 0) {
        await queueRef.set(
          { status: 'completed', finishedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
        return { processed: false, currentDocId: null, currentStep: null, queueStatus: 'completed' }
      }
      return { processed: true, currentDocId: null, currentStep: null, queueStatus: 'running' }
    }

    const docData = docSnap.data() || {}
    const processingState: ProcessingState =
      (docData.processingState as ProcessingState | undefined) || {
        step: 'queued' as ProcessingStep,
        stepLabel: STEP_LABELS.queued,
      }
    const step: ProcessingStep = processingState.step || 'queued'

    // Marca o doc como 'analise_processando' (visivel na UI) ao entrar em execucao.
    // Garante que apenas o doc atual fica com esse status (demais ficam 'analise_pendente').
    try {
      const currentStatus = (docData.status as string) || ''
      if (currentStatus !== 'analise_processando') {
        await currentDocRef.set(
          {
            status: 'analise_processando',
            analysisStartedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      }
    } catch (err) {
      logger.warn('processSingleStep.markProcessandoFailed', { docId: currentDocId, err: String(err) })
    }

    // Se step ja' e' completed, ir pro proximo doc
    if (step === 'completed') {
      return await advanceToNextDoc(queue, currentDocId!)
    }

    // Se step e' 'error', tentar retry ou ir pro proximo
    if (step === 'error') {
      const retryCount = processingState.retryCount || 0
      if (retryCount < MAX_RETRIES_PER_STEP && processingState.failedStep) {
        // Tentar de novo a partir do failedStep
        logger.info('processSingleStep.retry', {
          docId: currentDocId,
          step: processingState.failedStep,
          retryCount,
        })
        await currentDocRef.set(
          {
            processingState: {
              step: processingState.failedStep,
              stepLabel: STEP_LABELS[processingState.failedStep],
              stepStartedAt: FieldValue.serverTimestamp(),
              error: null,
              failedStep: null,
              retryCount: retryCount + 1,
            },
          },
          { merge: true },
        )
        await releaseLock(queueRef)
        return {
          processed: true,
          currentDocId: currentDocId!,
          currentStep: processingState.failedStep,
          queueStatus: 'running',
        }
      }
      // Desiste deste doc, ir pro proximo
      logger.warn('processSingleStep.skippedAfterError', {
        docId: currentDocId,
        error: processingState.error,
      })
      return await advanceToNextDoc(queue, currentDocId!, true)
    }

    // Executar step
    try {
      await executeStep(currentDocId!, currentDocRef!, docData, step)
      // Step OK. Avancar para o proximo.
      const nextStep = getNextStep(step)
      if (nextStep === 'completed') {
        // Doc completo!
        await currentDocRef.set(
          {
            processingState: {
              step: 'completed',
              stepLabel: STEP_LABELS.completed,
              completedAt: FieldValue.serverTimestamp(),
              error: null,
            },
            status: 'analisado',
            analyzedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        await queueRef.set(
          {
            doneCount: (queue.doneCount || 0) + 1,
            lastTickAt: FieldValue.serverTimestamp(),
            currentStep: 'completed',
          },
          { merge: true },
        )
        logger.info('processSingleStep.docCompleted', { docId: currentDocId })
        // Ir para o proximo doc (sem recursao)
        return await advanceToNextDoc(queue, currentDocId!)
      } else {
        // Proximo step do mesmo doc
        await currentDocRef.set(
          {
            processingState: {
              step: nextStep,
              stepLabel: STEP_LABELS[nextStep],
              stepStartedAt: FieldValue.serverTimestamp(),
              error: null,
            },
          },
          { merge: true },
        )
        await queueRef.set(
          { lastTickAt: FieldValue.serverTimestamp(), currentStep: nextStep },
          { merge: true },
        )
        // SEM recursao. O trigger re-dispara para a proxima step.
        await releaseLock(queueRef)
        return { processed: true, currentDocId: currentDocId!, currentStep: nextStep, queueStatus: 'running' }
      }
    } catch (err) {
      const errMsg = (err as Error).message
      logger.error('processSingleStep.stepError', { docId: currentDocId, step, err: errMsg })
      await currentDocRef.set(
        {
          processingState: {
            step: 'error',
            stepLabel: STEP_LABELS.error,
            error: errMsg,
            failedStep: step,
            retryCount: processingState.retryCount || 0,
          },
          status: 'erro_analise',
          analysisError: `Step '${step}' failed: ${errMsg}`,
        },
        { merge: true },
      )
      await queueRef.set(
        {
          errorCount: (queue.errorCount || 0) + 1,
          lastTickAt: FieldValue.serverTimestamp(),
          currentStep: 'error',
        },
        { merge: true },
      )
      // Ir para o proximo doc (sem recursao)
      return await advanceToNextDoc(queue, currentDocId!, true)
    }
  } catch (err) {
    logger.error('processSingleStep.fatal', { err: String((err as Error).message) })
    await releaseLock(queueRef)
    return { processed: false, currentDocId: null, currentStep: null, queueStatus: 'error' }
  }
}

/**
 * Libera o lock e atualiza lastTickAt. SEMPRE chamado no final de cada tick.
 */
async function releaseLock(queueRef: FirebaseFirestore.DocumentReference): Promise<void> {
  try {
    await queueRef.set(
      { processing: false, lastTickAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
  } catch (err) {
    logger.error('releaseLock.error', { err: String(err) })
  }
}

/**
 * Avanca para o proximo doc da fila.
 * Se nao houver mais, marca fila como 'completed'.
 * SEM recursao: o trigger re-dispara para processar a primeira step do proximo doc.
 */
async function advanceToNextDoc(
  queue: QueueState,
  currentDocId: string,
  _hadError = false,
): Promise<{
  processed: boolean
  currentDocId: string | null
  currentStep: ProcessingStep | null
  queueStatus: 'idle' | 'running' | 'paused' | 'completed' | 'error'
}> {
  const db = getFirestore()
  const queueRef = db.doc(QUEUE_DOC_PATH)

  const remainingDocIds = queue.docIds.filter((id) => id !== currentDocId)
  const nextDocId = remainingDocIds[0] || null

  if (!nextDocId) {
    await queueRef.set(
      {
        docIds: [],
        currentDocId: null,
        currentStep: null,
        status: 'completed',
        finishedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    await releaseLock(queueRef)
    return { processed: true, currentDocId: null, currentStep: null, queueStatus: 'completed' }
  }

  // Iniciar o proximo doc
  const nextDocRef = db.doc(`corpus/${nextDocId}`)
  await nextDocRef.set(
    {
      processingState: {
        step: 'queued' as ProcessingStep,
        stepLabel: STEP_LABELS.queued,
        queuedAt: FieldValue.serverTimestamp(),
        error: null,
        failedStep: null,
        retryCount: 0,
      },
    },
    { merge: true },
  )
  await queueRef.set(
    {
      docIds: remainingDocIds,
      currentDocId: nextDocId,
      currentStep: 'queued' as ProcessingStep,
      lastTickAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  // SEM recursao. O trigger re-dispara para a primeira step do proximo doc.
  await releaseLock(queueRef)
  return { processed: true, currentDocId: nextDocId, currentStep: 'queued', queueStatus: 'running' }
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
      // Gera textContent a partir de textOriginal
      const textOriginal = (docData.textOriginal as string) || ''
      const fileName = (docData.fileName as string) || docId
      if (!textOriginal || textOriginal.length < 10) {
        throw new Error('Documento sem texto (textOriginal vazio)')
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

      if (llmConfig) {
        result = await Promise.race([
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
      } else {
        // Sem LLM - usa heuristica
        result = getHeuristicAnalysis(fileName, text)
      }

      await docRef.set(
        {
          classification: result.classification,
          ementa: result.ementa,
          keyPoints: result.keyPoints,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      logger.info(logPrefix + '.done', { hasClassification: !!result.classification, hasEmenta: !!result.ementa })
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

function getNextStep(currentStep: ProcessingStep): ProcessingStep {
  const idx = STEP_ORDER.indexOf(currentStep)
  if (idx === -1 || idx === STEP_ORDER.length - 1) {
    return 'completed'
  }
  return STEP_ORDER[idx + 1]
}
