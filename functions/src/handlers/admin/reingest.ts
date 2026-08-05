/**
 * Admin: re-ingerir corpus.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore } from 'firebase-admin/firestore'
import { runIngestion } from '../../services/ingestion'
import { assertAdmin } from '../../middleware/auth'

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')

export const adminReingest = onCall(
  { secrets: [GEMINI_API_KEY], cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdmin(request.auth.uid)
    const result = await runIngestion({ apiKey: GEMINI_API_KEY.value(), source: 'admin' })
    return result
  },
)
