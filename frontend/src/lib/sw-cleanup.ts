/**
 * Limpeza agressiva de service workers e caches antigos.
 * Resolve o problema classico de "deploy passou mas o navegador mostra bundle velho".
 *
 * Executa:
 *  1. Remove todas as Service Worker registrations (nao importa versao)
 *     O SW pode estar servindo bundle antigo mesmo apos hard refresh
 *  2. Limpa todos os caches (exceto o atual)
 *  3. Recarrega a pagina se removeu algum SW (para o proximo carregamento
 *     ser sem SW)
 */
const SW_VERSION = 'v23' // bump a cada release crítica

export async function nukeAllCaches(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  let removed = false

  try {
    // 1. Service Workers - desregistrar TODOS os antigos
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const reg of regs) {
        const sw = reg.active || reg.installing || reg.waiting
        if (sw) {
          const url = sw.scriptURL || ''
          // Mantem apenas SWs novos (com versao no URL ou firebase messaging SW)
          if (!url.includes(`sw=${SW_VERSION}`) && !url.includes('firebase-messaging')) {
            console.warn('[Cofrito] Desregistrando SW:', url)
            try { await reg.unregister() } catch { /* ignora */ }
            removed = true
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Cofrito] Erro limpando SWs:', err)
  }

  try {
    // 2. Limpar TODOS os caches antigos (mantem so o atual)
    if ('caches' in window) {
      const keys = await caches.keys()
      for (const key of keys) {
        if (key !== `cofrito-static-${SW_VERSION}` && key !== `cofrito-runtime-${SW_VERSION}`) {
          console.warn('[Cofrito] Removendo cache:', key)
          try { await caches.delete(key) } catch { /* ignora */ }
          removed = true
        }
      }
    }
  } catch (err) {
    console.warn('[Cofrito] Erro limpando caches:', err)
  }

  return removed
}
