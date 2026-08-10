/**
 * Handler para feedback do usuário.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const FeedbackSchema = z.object({
  messageId: z.string(),
  helpful: z.boolean(),
  comment: z.string().max(500).optional(),
})

export const submitFeedback = onCall(
  { cors: true, enforceAppCheck: false },async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login.')
  }

  const parsed = FeedbackSchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Feedback inválido.')
  }

  const db = getFirestore()
  const userId = request.auth.uid
  const feedbackId = `${userId}-${parsed.data.messageId}`

  await db.collection('feedback').doc(feedbackId).set({
    userId,
    messageId: parsed.data.messageId,
    helpful: parsed.data.helpful,
    comment: parsed.data.comment || null,
    createdAt: Timestamp.now(),
  }, { merge: true })

  return { ok: true }
})
