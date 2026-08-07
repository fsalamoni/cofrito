/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * bootstrapAdminMaster — torna o user atual master admin SE não existir nenhum.
 *
 * Uso único: o primeiro user que chamar isso se torna master.
 * Útil para o owner inicial configurar o primeiro admin.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

export const bootstrapAdminMaster = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  const db = getFirestore()
  const uid = request.auth.uid

  // Verificar se já existe algum master
  const existing = await db.collection('admins').where('role', '==', 'master').where('active', '==', true).limit(1).get()
  if (!existing.empty) {
    throw new HttpsError('failed-precondition', 'Já existe um master admin. Peça para ele te conceder acesso.')
  }

  // Buscar info do user
  const userDoc = await db.doc(`users/${uid}`).get()
  const userData = userDoc.data() as any

  // Criar doc admin
  await db.doc(`admins/${uid}`).set(
    {
      uid,
      email: userData?.email ?? request.auth.token?.email ?? '',
      displayName: userData?.displayName ?? '',
      role: 'master',
      active: true,
      grantedAt: FieldValue.serverTimestamp(),
      grantedBy: 'bootstrap',
    },
    { merge: true },
  )

  return { ok: true, message: 'Você agora é master admin.' }
})
