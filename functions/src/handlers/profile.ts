/**
 * Handlers de perfil (redeploy 2026-08-10).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getUserProfile as getProfileFromDB } from '../services/profile'
import { z } from 'zod'

export const getProfile = onCall(
  { cors: true, enforceAppCheck: false },async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login.')
  }
  const profile = await getProfileFromDB(request.auth.uid)
  return profile
})

const UpdateProfileSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  unidade: z.string().max(200).optional(),
  areasAtuacao: z.array(z.string()).max(20).optional(),
  preferences: z
    .object({
      tone: z.enum(['formal', 'conversational']).optional(),
      detail: z.enum(['low', 'medium', 'high']).optional(),
      language: z.literal('pt-BR').optional(),
    })
    .optional(),
})

export const updateProfile = onCall(
  { cors: true, enforceAppCheck: false },async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login.')
  }
  const parsed = UpdateProfileSchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Dados inválidos.')
  }

  const db = getFirestore()
  const userId = request.auth.uid
  const userRef = db.doc(`users/${userId}`)
  const profileRef = db.doc(`users/${userId}/profile/main`)

  const userUpdates: Record<string, unknown> = { lastSeen: Timestamp.now() }
  if (parsed.data.displayName) userUpdates.displayName = parsed.data.displayName

  const profileUpdates: Record<string, unknown> = { updatedAt: Timestamp.now() }
  if (parsed.data.unidade) profileUpdates.unidade = parsed.data.unidade
  if (parsed.data.areasAtuacao) profileUpdates.areasAtuacao = parsed.data.areasAtuacao
  if (parsed.data.preferences) profileUpdates.preferences = parsed.data.preferences

  await userRef.update(userUpdates)
  await profileRef.set(profileUpdates, { merge: true })

  return await getProfileFromDB(userId)
})
// Forçado para re-deploy 2026-08-10
