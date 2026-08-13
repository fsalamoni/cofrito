/**
 * Admin Fix TextContent - reconstroi o JSON estruturado para docs antigos
 * que tem apenas textOriginal mas nao tem textContent.
 *
 * - adminRebuildTextContent: para cada doc, se tem textOriginal mas nao textContent,
 *   gera o JSON via textToStructuredJson() e salva.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirestore } from '../services/firestore'
import { assertAdminMaster } from '../middleware/auth'
import { textToStructuredJson, serializeStructuredJson } from '../services/document-json-converter'

const MAX_TEXT_LENGTH = 900_000

export const adminRebuildTextContent = onCall(
  { cors: true, enforceAppCheck: false, timeoutSeconds: 540, memory: '1GiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)

    const db = getFirestore()
    const snap = await db.collection('corpus').limit(500).get()

    const rebuilt: string[] = []
    const skipped: string[] = []
    const errors: { docId: string; err: string }[] = []

    for (const docSnap of snap.docs) {
      const data = docSnap.data()
      // Se ja' tem textContent, pula
      if (data.textContent && (data.textContent as string).length > 0) {
        skipped.push(docSnap.id)
        continue
      }
      // Se NAO tem textOriginal, pula
      const textOriginal = (data.textOriginal as string) || ''
      if (!textOriginal || textOriginal.length < 10) {
        skipped.push(docSnap.id)
        continue
      }
      const fileName = (data.fileName as string) || 'documento'
      const pageCount = data.meta?.pages
      try {
        const text = textOriginal.slice(0, MAX_TEXT_LENGTH)
        const structured = textToStructuredJson(text, fileName, pageCount)
        const textContentJson = serializeStructuredJson(structured)
        await docSnap.ref.set(
          {
            textContent: textContentJson,
            storageFormat: 'json-v1',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        rebuilt.push(docSnap.id)
        logger.info('adminRebuildTextContent.ok', { docId: docSnap.id, length: textContentJson.length })
      } catch (err) {
        errors.push({ docId: docSnap.id, err: (err as Error).message })
        logger.error('adminRebuildTextContent.failed', { docId: docSnap.id, err: (err as Error).message })
      }
    }

    return {
      ok: true,
      totalChecked: snap.docs.length,
      rebuiltCount: rebuilt.length,
      skippedCount: skipped.length,
      errorCount: errors.length,
      rebuiltIds: rebuilt,
      skippedIds: skipped.slice(0, 20),
      errors,
    }
  },
)
