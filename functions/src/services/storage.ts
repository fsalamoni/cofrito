/**
 * Compat shim para Firebase Storage em Cloud Functions Gen 2.
 *
 * PROBLEMA: O mesmo do firestore.ts - a app admin tem nome custom
 * ("__FIREBASE_FUNCTIONS_SDK__"), mas getStorage() SEM nome procura
 * "[DEFAULT]" e falha com "The default Firebase app does not exist".
 *
 * SOLUÇÃO: usar getStorage(app) passando a app correta.
 */
import { getStorage as adminGetStorage, type Storage } from 'firebase-admin/storage'
import { getOrCreateApp } from './firestore'

let _storage: Storage | undefined

export function getStorage(): Storage {
  if (_storage) return _storage
  const app = getOrCreateApp()
  _storage = adminGetStorage(app)
  return _storage
}

export function getBucket(name?: string) {
  const storage = getStorage()
  return name ? storage.bucket(name) : storage.bucket()
}
