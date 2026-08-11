/**
 * Compat shim: getFirestore() que SEMPRE funciona em Gen 2.
 * Re-exporta FieldValue, Timestamp, type Firestore do firebase-admin.
 */
import type { Firestore as FirestoreType } from 'firebase-admin/firestore'
export { FieldValue, Timestamp } from 'firebase-admin/firestore'
export type Firestore = FirestoreType
import { getDb } from './admin-firestore'

/**
 * getFirestore com lazy init do admin SDK.
 */
export function getFirestore(): FirestoreType {
  return getDb() as FirestoreType
}
