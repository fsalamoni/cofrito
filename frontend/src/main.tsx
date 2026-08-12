import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { nukeAllCaches } from './lib/sw-cleanup'

// ── Limpeza AGRESSIVA de Service Workers e caches antigos ─────────────────
// Resolve o problema de "deploy passou mas o navegador mostra bundle velho".
// - Desregistra TODOS os Service Workers (mesmo os do Firebase Messaging)
// - Limpa TODOS os caches antigos
// - Se removeu algo, recarrega a pagina UMA vez (para o proximo load ser limpo)
async function bootstrap() {
  const removed = await nukeAllCaches()
  // Se removeu SW ou cache, forca reload APOS o React montar
  // (deferido para o user poder interagir; reload imediato pode interromper UX)
  if (removed && typeof window !== 'undefined') {
    setTimeout(() => {
      // Check se nao estamos no meio de uma acao do user
      if (!document.querySelector('input:focus, textarea:focus, [contenteditable]')) {
        // Marca no sessionStorage que precisa reload
        // O reload automatico so acontece se nao ha interacao
        const w = window as unknown as { __cofritoReloading?: boolean }
        if (!w.__cofritoReloading) {
          w.__cofritoReloading = true
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
