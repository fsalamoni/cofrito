import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

// ── Limpeza AGRESSIVA de Service Workers e caches antigos ─────────────────
// Resolve o problema de "deploy passou mas o navegador mostra bundle velho"
async function nukeOldCaches() {
  if (typeof window === 'undefined') return
  const SW_VERSION = 'v15' // bump a cada release crítica

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const reg of regs) {
        const sw = reg.active || reg.installing || reg.waiting
        if (sw) {
          const url = sw.scriptURL || ''
          if (!url.includes(`sw=${SW_VERSION}`)) {
            console.warn('[Cofrito] Desregistrando SW velho:', url)
            await reg.unregister()
          }
        }
      }
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      for (const key of keys) {
        if (key !== `cofrito-static-${SW_VERSION}` && key !== `cofrito-runtime-${SW_VERSION}`) {
          console.warn('[Cofrito] Removendo cache velho:', key)
          await caches.delete(key)
        }
      }
    }
  } catch (err) {
    console.warn('[Cofrito] Erro limpando caches:', err)
  }
}

nukeOldCaches()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
