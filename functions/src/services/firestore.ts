/**
 * Compat shim DEFINITIVO para Cloud Functions Gen 2.
 *
 * PROBLEMA: Em Cloud Functions Gen 2, o firebase-functions cria
 * uma app admin com nome "__FIREBASE_FUNCTIONS_SDK__" (NÃO "[DEFAULT]").
 * getFirestore() do firebase-admin SEM nome procura "[DEFAULT]" e falha.
 *
 * SOLUÇÃO: Usar o getApp() do firebase-functions/common/app (a app que
 * ele criou) e chamar getFirestore(app) passando explicitamente.
 *
 * O getApp() do firebase-functions/common/app:
 *  1. Tenta getApp('[DEFAULT]')
 *  2. Se nao existir, inicializa com applicationDefault() e nome custom
 *  3. Retorna a app correta
 */
import * as adminApp from 'firebase-admin/app'
import { getFirestore as adminGetFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { getAuth as adminGetAuth, type Auth } from 'firebase-admin/auth'

const APP_NAME = '__FIREBASE_FUNCTIONS_SDK__'

let _app: adminApp.App | undefined

export function getOrCreateApp(): adminApp.App {
  if (_app) return _app
  // Tenta pegar a app default primeiro
  try {
    _app = adminApp.getApp()
    return _app
  } catch {
    // Nao ha app default. Tenta a do firebase-functions
    try {
      _app = adminApp.getApp(APP_NAME)
      return _app
    } catch {
      // Nao ha app custom. Cria a default
      _app = adminApp.initializeApp({ credential: adminApp.applicationDefault() })
      return _app
    }
  }
}

export function getFirestore(): Firestore {
  const app = getOrCreateApp()
  return adminGetFirestore(app)
}

export function getAuthInstance(): Auth {
  const app = getOrCreateApp()
  return adminGetAuth(app)
}

export { FieldValue, Timestamp, type Firestore }
