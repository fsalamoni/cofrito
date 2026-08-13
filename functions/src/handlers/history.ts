/**
 * Handler para listar histórico de conversas.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getConversations } from '../services/history'

export const getHistory = onCall(
  { cors: true, enforceAppCheck: false },async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login.')
  }
  const convs = await getConversations(request.auth.uid)
  return convs.map((c) => ({
    id: c.id,
    uid: c.uid,
    title: c.title,
    status: c.status,
    createdAt: c.createdAt,
    lastActivityAt: c.lastActivityAt,
    messageCount: c.messageCount,
  }))
})
