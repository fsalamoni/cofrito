/**
 * Admin Fix - ferramentas de correcao em massa.
 *
 * - adminFixAcervoStatus: para cada doc com status=erro_analise MAS
 *   que tem classification OU ementa OU keyPoints, mudar para status=analisado.
 *   Resolve o problema onde analyzer rodou (mesmo via heuristica) mas
 *   o status ficou errado por erro posterior no pipeline.
 *
 * - adminFixAcervoAll: forca re-analise de TODOS os docs (mesmo os com status
 *   'analisado' ou 'analise_pendente' ou 'erro_analise').
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirestore } from '../services/firestore'
import { assertAdminMaster } from '../middleware/auth'

/**
 * Corrige docs com status errado (tem dados mas esta' como erro_analise).
 * Chama como admin master.
 */
export const adminFixAcervoStatus = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)

    const db = getFirestore()
    const snap = await db.collection('corpus').limit(500).get()

    const fixed: string[] = []
    const skipped: string[] = []
    const errors: Array<{ docId: string; err: string }> = []

    for (const docSnap of snap.docs) {
      const data = docSnap.data()
      const status = data.status
      // Se ja' esta' OK, pula
      if (status === 'analisado') {
        skipped.push(docSnap.id)
        continue
      }
      // Se NAO tem dados E esta' como erro, NAO mexer (deixar o user re-analisar)
      const hasData = !!(data.classification || data.ementa || data.keyPoints)
      if (!hasData) {
        skipped.push(docSnap.id)
        continue
      }
      // FIX: tem dados mas status errado -> mudar para 'analisado'
      try {
        await docSnap.ref.set(
          {
            status: 'analisado',
            analysisError: null,  // limpar erro antigo
            fixedAt: FieldValue.serverTimestamp(),
            fixedBy: request.auth.uid,
            fixReason: 'status estava errado apesar de ter dados (correção manual em massa)',
          },
          { merge: true },
        )
        fixed.push(docSnap.id)
        logger.info('adminFixAcervoStatus.fixed', { docId: docSnap.id, oldStatus: status })
      } catch (err) {
        errors.push({ docId: docSnap.id, err: (err as Error).message })
      }
    }

    return {
      ok: true,
      totalChecked: snap.docs.length,
      fixedCount: fixed.length,
      skippedCount: skipped.length,
      errorCount: errors.length,
      fixedIds: fixed,
      skippedIds: skipped.slice(0, 20),  // amostra
      errors,
    }
  },
)
