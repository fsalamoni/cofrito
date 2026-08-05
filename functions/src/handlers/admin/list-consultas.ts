/**
 * Admin: lista consultas formais.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { assertAdmin } from '../../middleware/auth'

export const adminListConsultas = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  await assertAdmin(request.auth.uid)
  const db = getFirestore()
  const snap = await db.collection('consultas-formais').orderBy('createdAt', 'desc').limit(200).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
})
