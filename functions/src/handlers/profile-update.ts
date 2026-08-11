/**
 * Handler de atualização de perfil.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { getFirestore, Timestamp } from '../services/firestore'
import { z } from 'zod'

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  unidade: z.string().max(200).optional(),
  areasAtuacao: z.array(z.string()).max(20).optional(),
  preferences: z
    .object({
      tone: z.enum(['formal', 'conversational']).optional(),
      detail: z.enum(['low', 'medium', 'high']).optional(),
    })
    .optional(),
})

export const updateProfile = onCall({ cors: true, enforceAppCheck: false }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login para atualizar o perfil.')
  }
  const userId = request.auth.uid

  const parsed = UpdateProfileSchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Dados inválidos.', { issues: parsed.error.issues })
  }

  const db = getFirestore()
  const userRef = db.doc(`users/${userId}`)

  const update: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
    lastSeen: Timestamp.now(),
  }
  if (parsed.data.displayName !== undefined) update.displayName = parsed.data.displayName
  if (parsed.data.unidade !== undefined) update.unidade = parsed.data.unidade
  if (parsed.data.areasAtuacao !== undefined) update.areasAtuacao = parsed.data.areasAtuacao
  if (parsed.data.preferences !== undefined) update.preferences = parsed.data.preferences

  await userRef.set(update, { merge: true })

  logger.info('profile.updated', { userId })

  return { ok: true, userId }
})
