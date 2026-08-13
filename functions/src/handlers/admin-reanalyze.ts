/**
 * Admin Re-analyze Batch + Page Size Config.
 *
 * - adminReanalyzeBatch: refaz a analise (classification + ementa + keyPoints)
 *   de N documentos selecionados OU todos.
 *   Usa o LLM config global do admin (mesmo do upload).
 *   Processa em background com mutex por docId (evita duplicacao).
 *
 * - adminSetPageSize / adminGetPageSize: configura o tamanho da pagina
 *   do DocumentCatalog (20, 50 ou 100).
 *   Stored em: admin-config/acervo-pagination
 *
 *  IMPORTANTE: este handler eh a unica fonte oficial de "refazer analise"
 *  do acervo. Nao duplicar essa logica em outros lugares.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirestore } from '../services/firestore'
import { assertAdminMaster } from '../middleware/auth'
import { runAnalysisInBackground } from './admin-documents'
import { loadConfigDoc, saveConfigDoc } from '../services/config-store'

const DEFAULT_PAGE_SIZE = 20
const VALID_PAGE_SIZES = [20, 50, 100]

/**
 * Refaz a analise (classification + ementa + keyPoints) de N documentos.
 *  - docIds: array de IDs (se vazio + selectAll=true, refaz todos os ativos)
 *  - selectAll: se true, processa todos os docs ativos
 *
 * Retorna: lista de docIds que foram enfileirados.
 * Cada doc eh processado em background (nao bloqueia a response).
 */
export const adminReanalyzeBatch = onCall(
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
      throw new HttpsError('invalid-argument', 'Máximo 500 docs por batch (use múltiplos batches)')
    }

    const db = getFirestore()
    let docsToProcess: { docId: string; docRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData> }[] = []

    if (selectAll) {
      // Buscar todos os docs ativos (limit 500 — se tiver mais, o admin precisa filtrar)
      // Pega TODOS os docs (qualquer status). Se tiver mais que 500, trunca.
      // (nao filtra por status porque o acervo tem docs antigos com status 'ativo' ou outros)
      const snap = await db.collection('corpus')
        .limit(500)
        .get()
      docsToProcess = snap.docs.map(d => ({ docId: d.id, docRef: d.ref }))
      logger.info('adminReanalyzeBatch.selectAll', { count: docsToProcess.length, uid: request.auth.uid })
    } else {
      // Validar que cada docId existe
      for (const docId of docIds!) {
        const docRef = db.doc(`corpus/${docId}`)
        const snap = await docRef.get()
        if (!snap.exists) {
          logger.warn('adminReanalyzeBatch.doc-not-found', { docId, uid: request.auth.uid })
          continue
        }
        docsToProcess.push({ docId, docRef })
      }
      logger.info('adminReanalyzeBatch.specific', { count: docsToProcess.length, uid: request.auth.uid })
    }

    if (docsToProcess.length === 0) {
      return { ok: true, queued: 0, message: 'Nenhum documento encontrado para re-analisar' }
    }

    // Para cada doc: marcar como analise_processando + disparar runAnalysisInBackground
    const queued: string[] = []
    const failed: { docId: string; reason: string }[] = []
    for (const { docId, docRef } of docsToProcess) {
      try {
        const snap = await docRef.get()
        const data = snap.data() || {}
        const text = (data.textOriginal as string) || (data.textContent as string) || ''
        if (!text) {
          failed.push({ docId, reason: 'sem texto (textOriginal/textContent vazio)' })
          continue
        }
        // Marcar como processando
        await docRef.set(
          { status: 'analise_processando', analysisStartedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
        // Disparar em background
        void runAnalysisInBackground({
          uid: request.auth.uid,
          docId,
          fileName: (data.fileName as string) || docId,
          text: text.slice(0, 50_000),
          docRef,
        })
        queued.push(docId)
      } catch (err) {
        logger.error('adminReanalyzeBatch.queue-failed', { docId, err: (err as Error).message })
        failed.push({ docId, reason: (err as Error).message })
      }
    }

    logger.info('adminReanalyzeBatch.done', {
      queued: queued.length,
      failed: failed.length,
      uid: request.auth.uid,
    })

    return {
      ok: true,
      queued: queued.length,
      failed: failed.length,
      queuedIds: queued,
      failures: failed,
      message: `${queued.length} documento(s) enfileirado(s) para re-análise em background`,
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
