/**
 * Handler de atualização de perfil.
 * Stub mínimo — expande conforme necessário.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { z } from 'zod'

import { updateInferredAreas } from '../services/profile'

const UpdateProfileRequestSchema = z.object({
  areas: z.array(z.string()).max(10).optional(),
})

export const updateProfile = onCall({ cors: true, enforceAppCheck: false }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login para atualizar o perfil.')
  }

  const parsed = UpdateProfileRequestSchema.safeParse(request.data)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Dados inválidos.', { issues: parsed.error.issues })
  }

  const userId = request.auth.uid
  const { areas } = parsed.data

  try {
    if (areas) {
      await updateInferredAreas(userId, areas)
    }
    logger.info('profile.updated', { userId, areas })
    return { success: true }
  } catch (err) {
    logger.error('profile.update.error', { userId, err })
    throw new HttpsError('internal', 'Erro ao atualizar perfil.')
  }
})
