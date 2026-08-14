/**
 * Admin Re-analyze Batch + Page Size Config.
 *
 * - adminReanalyzeBatch: enfileira N documentos para re-analise via
 *   FILA OFICIAL (1-por-1, 1-step-por-vez, sem paralelismo).
 *   O trigger onProcessingQueueUpdated processa cada step sequencialmente.
 *   O status do doc fica 'analise_pendente' ate o trigger pegar; depois
 *   'analise_processando' durante a execucao; 'analisado' ou 'erro_analise' no fim.
 *
 * - adminSetPageSize / adminGetPageSize: configura o tamanho da pagina
 *   do DocumentCatalog (20, 50 ou 100).
 *   Stored em: admin-config/acervo-pagination
 *
 *  IMPORTANTE: este handler usa SEMPRE a fila oficial (enqueueDocsForProcessing).
 *  Nao dispara runAnalysisInBackground em paralelo (causava todos os docs
 *  ficarem "Processando" simultaneamente).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { getFirestore } from '../services/firestore'
import { assertAdminMaster } from '../middleware/auth'
import { enqueueDocsForProcessing } from './admin-process-queue'
import { loadConfigDoc, saveConfigDoc } from '../services/config-store'

const DEFAULT_PAGE_SIZE = 20
const VALID_PAGE_SIZES = [20, 50, 100]

/**
 * Refaz a analise (json + classification + ementa + keyPoints) de N documentos
 * via FILA OFICIAL (1-por-1, sequencial).
 *
 *  - docIds: array de IDs (se vazio + selectAll=true, refaz todos os ativos)
 *  - selectAll: se true, processa todos os docs ativos
 *
 * Retorna: lista de docIds que foram enfileirados.
 * Cada doc eh processado em background pelo trigger (NAO bloqueia a response).
 */
export const adminReanalyzeBatch = onCall(
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
      throw new HttpsError('invalid-argument', 'Máximo 500 docs por batch (use múltiplos batches)')
    }

    const db = getFirestore()
    let targetDocIds: string[] = []

    if (selectAll) {
      const snap = await db.collection('corpus').limit(500).get()
      targetDocIds = snap.docs.map(d => d.id)
      logger.info('adminReanalyzeBatch.selectAll', { count: targetDocIds.length, uid: request.auth.uid })
    } else {
      for (const docId of docIds!) {
        const snap = await db.doc(`corpus/${docId}`).get()
        if (snap.exists) targetDocIds.push(docId)
      }
      logger.info('adminReanalyzeBatch.specific', { count: targetDocIds.length, uid: request.auth.uid })
    }

    if (targetDocIds.length === 0) {
      return { ok: true, queued: 0, message: 'Nenhum documento encontrado para re-analisar' }
    }

    // Enfileira na fila oficial (1-por-1, sem paralelismo).
    // O trigger onProcessingQueueUpdated processa cada doc sequencialmente.
    const result = await enqueueDocsForProcessing(targetDocIds, request.auth.uid)

    logger.info('adminReanalyzeBatch.done', {
      queued: result.queued,
      totalInQueue: result.totalInQueue,
      uid: request.auth.uid,
    })

    return {
      ok: true,
      queued: result.queued,
      failed: 0,
      queuedIds: result.docIdsAdded,
      failures: [],
      totalInQueue: result.totalInQueue,
      message: `${result.queued} documento(s) adicionado(s) à fila. O processamento é sequencial (1 por vez).`,
    }
  },
)

/**
 * Define o tamanho da página do DocumentCatalog.
 * Aceita: 20, 50 ou 100.
 */
export const adminSetPageSize = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const { pageSize } = (request.data || {}) as { pageSize: number }
    if (!VALID_PAGE_SIZES.includes(pageSize)) {
      throw new HttpsError('invalid-argument', `pageSize deve ser um de: ${VALID_PAGE_SIZES.join(', ')}`)
    }
    const config = { pageSize, updatedAt: new Date().toISOString() }
    await saveConfigDoc(config, { path: 'admin-config/acervo-pagination', tag: 'acervo-pagination', uid: request.auth.uid })
    logger.info('adminSetPageSize.done', { pageSize, uid: request.auth.uid })
    return { ok: true, pageSize }
  },
)

/**
 * Retorna a config de pagination (ou default se nao existir).
 */
export const adminGetPageSize = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    const loaded = await loadConfigDoc<{ pageSize: number }>('admin-config/acervo-pagination', 'acervo-pagination')
    return { pageSize: loaded?.data.pageSize ?? DEFAULT_PAGE_SIZE }
  },
)
