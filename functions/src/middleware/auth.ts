/**
 * Middleware de auth — verifica se usuário é admin.
 */

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'

export async function assertAdmin(uid: string): Promise<void> {
  const db = getFirestore()
  const adminDoc = await db.doc(`admins/${uid}`).get()
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'Operação restrita a administradores.')
  }
}
