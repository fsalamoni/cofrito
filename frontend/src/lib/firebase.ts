/**
 * Configuração do Firebase para o cliente.
 * Use isto em qualquer lugar do frontend.
 *
 * IMPORTANTE: usamos memoryLocalCache em vez de IndexedDB
 * para evitar os 3 TypeErrors do console (create/query)
 * que vinham do firestore tentando criar IDB offline persistence
 * (alguns navegadores/abas em conflito).
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore'
import { getFunctions, type Functions } from 'firebase/functions'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

let app: FirebaseApp
if (getApps().length === 0) {
  app = initializeApp(config)
} else {
  app = getApps()[0]
}

export const firebaseApp = app
export const auth: Auth = getAuth(app)

// Firestore SEM offline persistence (memoryLocalCache).
// Evita os TypeErrors 'create'/'query'/'create' do IDB persistence
// e simplifica a UX (sempre busca dados frescos).
export const firestore: Firestore = initializeFirestore(app, {
  localCache: memoryLocalCache(),
})

export const functions: Functions = getFunctions(
  app,
  import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'southamerica-east1',
)
