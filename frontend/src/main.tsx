import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { nukeAllCaches } from './lib/sw-cleanup'

// ── IDB Killer - patch que desabilita IndexedDB ANTES do Firestore ────────
// Quebra o cache offline do Firestore sem quebrar o firebase-auth.
// Resolve os 3 TypeErrors "reading query/create" que aparecem quando
// o Firestore tenta criar IDB offline persistence em um navegador que
// nao permite (modo privado, multi-tab, etc).
if (typeof window !== 'undefined') {
  const w = window as unknown as { __idbKilled?: boolean }
  if (!w.__idbKilled) {
    w.__idbKilled = true
    try {
      const OriginalOpen = window.indexedDB.open.bind(window.indexedDB)
      window.indexedDB.open = function (name: string, version?: number) {
        if (typeof name === 'string' && name.includes('firestore')) {
          // Retornar request com erro para forcar o firestore a desistir do IDB
          const request = OriginalOpen('__idb_blocked__', 1)
          setTimeout(() => {
            try {
              const event = new Event('error')
              Object.defineProperty(request, 'error', {
                value: { name: 'VersionError', message: 'IDB blocked' },
              })
              request.dispatchEvent(event)
            } catch { /* best effort */ }
          }, 0)
          return request
        }
        return OriginalOpen(name, version)
      } as IDBFactory['open']
    } catch { /* best effort */ }
  }
}

// ── Limpeza AGRESSIVA de Service Workers e caches antigos ─────────────────
async function bootstrap() {
  const removed = await nukeAllCaches()
  if (removed && typeof window !== 'undefined') {
    setTimeout(() => {
      if (!document.querySelector('input:focus, textarea:focus, [contenteditable]')) {
        const w2 = window as unknown as { __cofritoReloading?: boolean }
        if (!w2.__cofritoReloading) {
          w2.__cofritoReloading = true
          window.location.reload()
        }
      }
    }, 1500)
  }
}

void bootstrap()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
