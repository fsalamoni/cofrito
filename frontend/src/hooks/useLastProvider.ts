/**
 * useLastProvider — persiste o último provider selecionado em localStorage.
 *
 *  - `provider`: o último provider selecionado (ou o default 'openrouter' se nunca foi)
 *  - `setProvider(p)`: atualiza o estado E grava em localStorage
 *  - `clear()`: limpa o storage
 *
 * Usado por LLMSettings e AdminSettings para que o provider escolhido
 * persista entre refreshs / navegações.
 */

import { useState, useCallback } from 'react'
import type { LLMProvider } from '@/types'

const STORAGE_KEY = 'cofrito:lastProvider'
const DEFAULT: LLMProvider = 'openrouter'

function readFromStorage(): LLMProvider {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT
    return raw as LLMProvider
  } catch {
    return DEFAULT
  }
}

function writeToStorage(provider: LLMProvider): void {
  try {
    localStorage.setItem(STORAGE_KEY, provider)
  } catch {
    // localStorage indisponível — silencioso
  }
}

export function useLastProvider(initial?: LLMProvider): {
  provider: LLMProvider
  setProvider: (p: LLMProvider) => void
  clear: () => void
} {
  const [provider, setProviderState] = useState<LLMProvider>(() => initial ?? readFromStorage())

  const setProvider = useCallback((p: LLMProvider) => {
    setProviderState(p)
    writeToStorage(p)
  }, [])

  const clear = useCallback(() => {
    setProviderState(DEFAULT)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // silencioso
    }
  }, [])

  return { provider, setProvider, clear }
}
