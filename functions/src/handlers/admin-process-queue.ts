/**
 * Admin Process Queue - processamento encadeado PERSISTENTE do acervo.
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
 * A Cloud Function se chama recursivamente (via Task Queue do Firebase)
 * ate a fila esvaziar.
 *
 * Vantagens:
 *  - Se o user atualizar a pagina, o processamento continua (Firestore persiste)
 *  - Se o user sair, o processamento continua
 *  - Cada etapa tem status visivel (modal no frontend)
 *  - Erro em 1 doc NAO para a fila
 */
import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { FieldValue } from 'firebase-admin/firestore'
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
  // aceitar tanto FieldValue (serverTimestamp) quanto Date/Timestamp

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
  // Nome do user que iniciou (para auditoria)
  startedBy?: string | null
}

const QUEUE_DOC_PATH = 'admin-config/processing-queue'
const MAX_RETRIES_PER_STEP = 2
const STEP_TIMEOUT_MS = 120_000  // 2 min por step (anti-hang)

// ── 1) Start: adiciona docs a fila e dispara primeira tick ───────────

export const adminStartQueue = onCall(
  { cors: true, enforceAppCheck: false, timeoutSeconds: 540, memory: '1GiB' },
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

    // Resetar estado dos docs
    const batch = db.batch()
    for (const docId of targetDocIds) {
      const docRef = db.doc(`corpus/${docId}`)
      batch.set(
        docRef,
        {
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
    const newQueue: QueueState = {
      docIds: Array.from(new Set([...(existing?.docIds || []), ...targetDocIds])),
      currentDocId: existing?.currentDocId || targetDocIds[0],
      currentStep: existing?.currentStep || 'queued',
      status: 'running',
      startedAt: existing?.startedAt || new Date(),
      finishedAt: null,
      lastTickAt: new Date(),
      totalDocs: (existing?.totalDocs || 0) + targetDocIds.length,
      doneCount: existing?.doneCount || 0,
      errorCount: existing?.errorCount || 0,
      startedBy: request.auth.uid,
    }
    await queueRef.set(newQueue, { merge: true })

    logger.info('adminStartQueue.queued', { count: targetDocIds.length, uid: request.auth.uid })

    // Disparar primeira tick (em background, para nao bloquear response)
    void processNextTick().catch((err) => {
      logger.error('adminStartQueue.firstTick.failed', { err: String(err) })
    })

    return {
      ok: true,
      queued: targetDocIds.length,
      totalInQueue: newQueue.docIds.length,
      message: `${targetDocIds.length} documento(s) adicionado(s) à fila de processamento`,
    }
  },
)

// ── 2) Get status: retorna fila + estado de cada doc ──────────────────

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

// ── 3) Public tick (HTTP, sem auth) - chamado recursivamente ───────────

export const adminProcessQueueTick = onRequest(
  { cors: true, region: 'southamerica-east1', timeoutSeconds: 540, memory: '1GiB' },
  async (_req, res) => {
    try {
      const result = await processNextTick()
      res.json({ ok: true, ...result })
    } catch (err) {
      logger.error('adminProcessQueueTick.error', { err: String(err) })
      res.status(500).json({ ok: false, error: String((err as Error).message) })
    }
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

// ── Core: processNextTick ─────────────────────────────────────────────

/**
 * Processa o PROXIMO STEP do doc atual.
 * Se step='completed', vai para o proximo doc da fila.
 * Se fila vazia, marca status='completed'.
 * Se erro, marca error no doc e continua (ou para, dependendo da config).
 *
 * IMPORTANTE: esta funcao NAO retorna ate completar o step.
 * O resultado dela e' usado para decidir se chama novamente.
 */
async function processNextTick(): Promise<{
  processed: boolean
  currentDocId: string | null
  currentStep: ProcessingStep | null
  queueStatus: 'idle' | 'running' | 'paused' | 'completed' | 'error'
}> {
  const db = getFirestore()
  const queueRef = db.doc(QUEUE_DOC_PATH)
  const queueSnap = await queueRef.get()
  if (!queueSnap.exists) {
    return { processed: false, currentDocId: null, currentStep: null, queueStatus: 'idle' }
  }
  const queue = queueSnap.data() as QueueState

  // Se ja' terminou, nao fazer nada
  if (queue.status === 'completed' || queue.status === 'paused') {
    return { processed: false, currentDocId: queue.currentDocId, currentStep: queue.currentStep, queueStatus: queue.status }
  }

  // Pegar doc atual
  let currentDocId = queue.currentDocId
  let currentDocRef = currentDocId ? db.doc(`corpus/${currentDocId}`) : null
  let currentDocData: Record<string, unknown> | null = null

  // Se nao tem doc atual, pegar o proximo da fila
  if (!currentDocId || !currentDocRef) {
    const nextDocId = queue.docIds.find((id) => id !== queue.currentDocId) || queue.docIds[0]
    if (!nextDocId) {
      // Fila vazia
      await queueRef.set({ status: 'completed', finishedAt: FieldValue.serverTimestamp() }, { merge: true })
      return { processed: false, currentDocId: null, currentStep: null, queueStatus: 'completed' }
    }
    await queueRef.set({ currentDocId: nextDocId }, { merge: true })
    currentDocId = nextDocId
    currentDocRef = db.doc(`corpus/${currentDocId}`)
  }

  // Carregar doc
  const docSnap = await currentDocRef.get()
  if (!docSnap.exists) {
    // Doc nao existe mais - remover da fila e ir pro proximo
    const remainingDocIds = queue.docIds.filter((id) => id !== currentDocId)
    await queueRef.set(
      { docIds: remainingDocIds, currentDocId: null, errorCount: (queue.errorCount || 0) + 1 },
      { merge: true },
    )
    if (remainingDocIds.length > 0) {
      return processNextTick()
    }
    await queueRef.set({ status: 'completed', finishedAt: FieldValue.serverTimestamp() }, { merge: true })
    return { processed: false, currentDocId: null, currentStep: null, queueStatus: 'completed' }
  }

  currentDocData = docSnap.data() || {}
  const processingState: ProcessingState = (currentDocData.processingState as ProcessingState | undefined) || {
    step: 'queued' as ProcessingStep,
    stepLabel: STEP_LABELS.queued,
  }
  const step: ProcessingStep = processingState.step || 'queued'

  // Se step ja' e' completed, ir pro proximo doc
  if (step === 'completed') {
    return advanceToNextDoc(queue, currentDocId!)
  }

  // Se step e' 'error', ir pro proximo doc (ou tentar retry se retryCount < MAX)
  if (step === 'error') {
    const retryCount = processingState.retryCount || 0
    if (retryCount < MAX_RETRIES_PER_STEP && processingState.failedStep) {
      // Tentar de novo a partir do failedStep
      logger.info('processNextTick.retry', { docId: currentDocId, step: processingState.failedStep, retryCount })
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
      // Processar recursivamente
      return processNextTick()
    }
    // Desiste deste doc, ir pro proximo
    logger.warn('processNextTick.skippedAfterError', { docId: currentDocId, error: processingState.error })
    return advanceToNextDoc(queue, currentDocId!, true)
  }

  // Executar step
  try {
    await executeStep(currentDocId!, currentDocRef!, currentDocData, step)
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
        { doneCount: (queue.doneCount || 0) + 1, lastTickAt: FieldValue.serverTimestamp() },
        { merge: true },
      )
      logger.info('processNextTick.docCompleted', { docId: currentDocId })
      return advanceToNextDoc(queue, currentDocId!)
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
      // Processar proximo step IMEDIATAMENTE (encadeado)
      return processNextTick()
    }
  } catch (err) {
    const errMsg = (err as Error).message
    logger.error('processNextTick.stepError', { docId: currentDocId, step, err: errMsg })
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
      { errorCount: (queue.errorCount || 0) + 1, lastTickAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
    // Ir para o proximo doc (ou tentar retry no proximo tick)
    return advanceToNextDoc(queue, currentDocId!, true)
  }
}

/**
 * Avanca para o proximo doc da fila.
 * Se nao houver mais, marca fila como 'completed'.
 */
async function advanceToNextDoc(
  queue: QueueState,
  currentDocId: string,
  // hadError nao usado (so' para log)
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
      { docIds: [], currentDocId: null, currentStep: null, status: 'completed', finishedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
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
    { docIds: remainingDocIds, currentDocId: nextDocId, currentStep: 'queued' as ProcessingStep, lastTickAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
  // Processar proximo
  return processNextTick()
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

      const llmConfig = await resolveLLMConfigForAnalysis(docId)
      let result: { classification: Classification | null; ementa: Ementa | null; keyPoints: KeyPoints }

      if (llmConfig) {
        result = await Promise.race([
          analyzeAcervoDoc({
            uid: docId,
            docId,
            fileName,
            text,
            llmConfig: llmConfig as LLMConfigLike,
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

// ── Public endpoint para o user forcar tick (se quiser) ──────────────

export const adminForceQueueTick = onCall(
  { cors: true, enforceAppCheck: false, timeoutSeconds: 540, memory: '1GiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)

    const result = await processNextTick()
    return { ok: true, ...result }
  },
)
