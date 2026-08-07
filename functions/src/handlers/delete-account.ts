/**
 * Handler para apagar conta (LGPD).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { logger } from 'firebase-functions/v2'

export const deleteAccount = onCall(
  { cors: true },async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login.')
  }
  const userId = request.auth.uid
  const db = getFirestore()

  // 1. Soft delete
  await db.doc(`users/${userId}`).set(
    {
      status: 'deleted',
      deletedAt: Timestamp.now(),
      // Anonimiza dados pessoais
      displayName: 'Usuário removido',
      email: '[removed]',
    },
    { merge: true },
  )

  // 2. Log de auditoria
  await db.collection('audit').add({
    userId,
    action: 'account.deleted',
    resource: `users/${userId}`,
    at: Timestamp.now(),
    meta: {},
  })

  // 3. Apaga autenticação
  try {
    await getAuth().deleteUser(userId)
  } catch (err) {
    logger.error('deleteAccount.auth.error', { userId, err })
  }

  // 4. Cloud Function agendada (cleanupRetention) apaga após 90 dias

  return { ok: true }
})
