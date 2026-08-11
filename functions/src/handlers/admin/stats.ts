/**
 * Admin: estatísticas gerais.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from '../../services/firestore'
import { assertAdmin } from '../../middleware/auth'

export const adminGetStats = onCall(
  { cors: true, enforceAppCheck: false },async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  await assertAdmin(request.auth.uid)
  const db = getFirestore()
  const [users, conversas, consultas, documents] = await Promise.all([
    db.collection('users').count().get(),
    db.collectionGroup('conversations').count().get(),
    db.collection('consultas-formais').count().get(),
    db.collection('corpus/documents').count().get(),
  ])
  return {
    users: users.data().count,
    conversations: conversas.data().count,
    consultas: consultas.data().count,
    documents: documents.data().count,
    timestamp: new Date().toISOString(),
  }
})
