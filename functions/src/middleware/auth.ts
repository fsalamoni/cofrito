/**
 * Middleware de auth — verifica roles admin/master.
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

export async function assertAdminMaster(uid: string): Promise<void> {
  const db = getFirestore()
  const adminDoc = await db.doc(`admins/${uid}`).get()
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'Operação restrita a administradores.')
  }
  const data = adminDoc.data() as { role?: string; active?: boolean }
  if (data.active === false) {
    throw new HttpsError('permission-denied', 'Acesso revogado.')
  }
  if (data.role !== 'master') {
    throw new HttpsError('permission-denied', 'Operação restrita ao master admin.')
  }
}

export async function getAdminRole(uid: string): Promise<'master' | 'admin' | null> {
  const db = getFirestore()
  const adminDoc = await db.doc(`admins/${uid}`).get()
  if (!adminDoc.exists) return null
  const data = adminDoc.data() as { role?: string; active?: boolean }
  if (data.active === false) return null
  return data.role === 'master' ? 'master' : data.role === 'admin' ? 'admin' : null
}
