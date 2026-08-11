/**
 * Lazy admin SDK init para Cloud Functions Gen 2 onRequest.
 *
 * Em Gen 2 onRequest, em alguns deploys, o admin SDK nao vem
 * inicializado automaticamente. Esta funcao garante que a app
 * default exista antes de chamar getFirestore()/getAuth().
 */
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore as adminGetFirestore, type Firestore } from 'firebase-admin/firestore'
import { getAuth as adminGetAuth, type Auth } from 'firebase-admin/auth'

let _initialized = false

function ensureAdminApp(): void {
  if (_initialized) return
  if (getApps().length === 0) {
    try {
      initializeApp({ credential: applicationDefault() })
      _initialized = true
    } catch {
      // Ja inicializado por outro modulo
      _initialized = true
    }
  } else {
    _initialized = true
  }
}

export function getDb(): Firestore {
  ensureAdminApp()
  return adminGetFirestore()
}

export function getAuthInstance(): Auth {
  ensureAdminApp()
  return adminGetAuth()
}
