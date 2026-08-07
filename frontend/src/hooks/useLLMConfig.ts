/**
 * useLLMConfig — gerencia a config de LLM do usuário e do master admin.
 *
 *  - user: lê/escreve em `users/{uid}/llmConfig`
 *  - master: lê/escreve em `admin-config/llm` (global) e gerencia admins
 *  - Quando global está setado, esconde a config do user (admin decide por todos)
 */
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { useIsAdminMaster } from '@/hooks/useAdminStatus'
import { api } from '@/lib/api'
import type { LLMConfig, LLMProvider, LLMModelInfo } from '@/types'
import { getProviderInfo } from '@/lib/providers'

interface UseLLMConfig {
  /** Config pessoal do user (null se não configurou). */
  userConfig: LLMConfig | null
  /** Config global do master admin (null se não setado). */
  globalConfig: LLMConfig | null
  /** Se há config global, o user não pode escolher. */
  globalForcesConfig: boolean
  /** Config efetivamente usada (global > user). */
  effectiveConfig: LLMConfig | null
  loading: boolean
  error: string | null
  saveUserConfig: (config: LLMConfig) => Promise<void>
  deleteUserConfig: () => Promise<void>
  saveGlobalConfig: (config: LLMConfig | null) => Promise<void>
  /** Fetch lista de modelos do provider. */
  listModels: (provider: LLMProvider, apiKey: string, baseUrl?: string) => Promise<LLMModelInfo[]>
}

export function useLLMConfig(): UseLLMConfig {
  const { user } = useAuth()
  const isAdminMaster = useIsAdminMaster()
  const [userConfig, setUserConfig] = useState<LLMConfig | null>(null)
  const [globalConfig, setGlobalConfig] = useState<LLMConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Subscrever config pessoal
  useEffect(() => {
    if (!user) {
      setUserConfig(null)
      return
    }
    const ref = doc(firestore, `users/${user.uid}/llmConfig`)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as any
          setUserConfig({
            provider: data.provider,
            model: data.model,
            apiKey: data.apiKey ?? '',
            baseUrl: data.baseUrl,
            temperature: data.temperature,
            maxTokens: data.maxTokens,
            scope: 'user',
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? data.updatedAt,
          } as LLMConfig)
        } else {
          setUserConfig(null)
        }
        setLoading(false)
      },
      (err) => {
        console.warn('Erro ao ler llmConfig:', err)
        setError(err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [user])

  // Subscrever config global (todos podem ver se há global)
  useEffect(() => {
    const ref = doc(firestore, 'admin-config/llm')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as any
          setGlobalConfig({
            provider: data.provider,
            model: data.model,
            apiKey: data.apiKey ?? '',
            baseUrl: data.baseUrl,
            temperature: data.temperature,
            maxTokens: data.maxTokens,
            scope: 'global',
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? data.updatedAt,
          } as LLMConfig)
        } else {
          setGlobalConfig(null)
        }
      },
      (err) => {
        console.warn('Erro ao ler global llmConfig:', err)
      },
    )
    return unsub
  }, [])

  const effectiveConfig = globalConfig ?? userConfig

  async function saveUserConfig(config: LLMConfig) {
    if (!user) throw new Error('Não autenticado')
    try {
      await api.setLLMConfig(config)
    } catch (err: any) {
      // Fallback: gravar direto no Firestore (caso função não exista ainda)
      const { setDoc } = await import('firebase/firestore')
      await setDoc(doc(firestore, `users/${user.uid}/llmConfig`), {
        ...config,
        scope: 'user',
        updatedAt: new Date().toISOString(),
      })
    }
  }

  async function deleteUserConfig() {
    if (!user) return
    try {
      await api.deleteLLMConfig()
    } catch {
      const { deleteDoc } = await import('firebase/firestore')
      await deleteDoc(doc(firestore, `users/${user.uid}/llmConfig`))
    }
  }

  async function saveGlobalConfig(config: LLMConfig | null) {
    if (!isAdminMaster) throw new Error('Apenas admin master pode setar config global')
    if (config === null) {
      try {
        await api.adminSetGlobalLLM(null)
      } catch {
        const { deleteDoc } = await import('firebase/firestore')
        await deleteDoc(doc(firestore, 'admin-config/llm'))
      }
    } else {
      try {
        await api.adminSetGlobalLLM(config)
      } catch {
        const { setDoc } = await import('firebase/firestore')
        await setDoc(doc(firestore, 'admin-config/llm'), {
          ...config,
          scope: 'global',
          updatedAt: new Date().toISOString(),
        })
      }
    }
  }

  async function listModels(provider: LLMProvider, apiKey: string, baseUrl?: string): Promise<LLMModelInfo[]> {
    const info = getProviderInfo(provider)
    if (!info) throw new Error('Provider desconhecido')

    // Para provedores que suportam listagem, tenta via Cloud Function
    try {
      const { api } = await import('@/lib/api')
      const result = await api.listLLMModels(provider, apiKey, baseUrl)
      if (result.data && result.data.length > 0) {
        return result.data.map((m) => ({
          id: m.id,
          name: m.name ?? m.id,
          contextWindow: m.contextWindow,
        }))
      }
    } catch (err) {
      console.warn('Backend listLLMModels falhou, usando catálogo local:', err)
    }

    // Fallback: catálogo local
    return info.models
  }

  return {
    userConfig,
    globalConfig,
    globalForcesConfig: !!globalConfig,
    effectiveConfig,
    loading,
    error,
    saveUserConfig,
    deleteUserConfig,
    saveGlobalConfig,
    listModels,
  }
}
