/**
 * IDB Killer - patch que quebra o IndexedDB ANTES do Firestore ser carregado.
 *
 * Alguns bundles antigos do Firestore (cacheados pelo navegador do user)
 * tentam ativar IndexedDbPersistence automaticamente, o que causa 3
 * TypeErrors no console ("reading 'query'", "reading 'create'").
 *
 * Este patch NAO desabilita o IDB completamente (firebase-auth precisa),
 * mas simula que o firestore "acha" que ja tem owner lock, fazendo o
 * firestore desistir do IDB.
 *
 * Eh executado ANTES de qualquer import do firebase/firestore.
 */
if (typeof window !== 'undefined') {
  const w = window as unknown as { __idbKilled?: boolean }
  if (!w.__idbKilled) {
    w.__idbKilled = true

    // 1. Monkey-patch indexedDB.open para retornar um lock "already taken"
    //    (faz o firestore acreditar que outra tab ja tem ownership)
    try {
      const OriginalOpen = window.indexedDB.open.bind(window.indexedDB)
      window.indexedDB.open = function (name: string, version?: number) {
        // Para o firestore-specific databases, simular que ja esta com owner
        if (
          typeof name === 'string' &&
          (name.includes('firestore') ||
           name.includes('firebase-heartbeat') ||
           name.includes('firebaseLocalStorage'))
        ) {
          // Retornar request com erro "already taken" para forcar fallback
          const request = OriginalOpen('__idb_blocked__', 1)
          // Forcar erro
          setTimeout(() => {
            const event = new Event('error')
            Object.defineProperty(request, 'error', {
              value: { name: 'VersionError', message: 'IDB blocked by idb-killer' },
            })
            request.dispatchEvent(event)
          }, 0)
          return request
        }
        return OriginalOpen(name, version)
      } as IDBFactory['open']
    } catch {
      // best effort
    }
  }
}
