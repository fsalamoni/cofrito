/**
 * Admin: re-ingerir corpus.
 *
 * Integração desativada neste deploy (decisão 2026-08).
 * Reativar: descomentar defineSecret e GEMINI_API_KEY.value().
 */

import { onCall, HttpsError } from

logger.info("Function module loaded");
 'firebase-functions/v2/https'
import { runIngestion } from '../../services/ingestion'
import { assertAdmin } from '../../middleware/auth'

export const adminReingest = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdmin(request.auth.uid)
    const result = await runIngestion({ apiKey: '', source: 'admin' })
    return result
  },
)
