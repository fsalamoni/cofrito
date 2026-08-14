/**
 * useLLMConfig — gerencia a config de LLM do usuário e do master admin.
 *
 * Storage:
 *  - user: campo `llmConfig` em `users/{uid}` (1 doc, evita subcollection)
 *  - global: doc `admin-config/llm`
 *
 * Quando global está setado, esconde a config do user (admin decide por todos).
 */
import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc, deleteField } from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { useIsAdminMaster } from '@/hooks/useAdminStatus'
import { api } from '@/lib/api'
import type { LLMConfig, LLMProvider, LLMModelInfo } from '@/types'
import { getProviderInfo } from '@/lib/providers'

interface UseLLMConfig {
  userConfig: LLMConfig | null
  globalConfig: LLMConfig | null
  globalForcesConfig: boolean
  effectiveConfig: LLMConfig | null
  loading: boolean
  error: string | null
  saveUserConfig: (config: LLMConfig) => Promise<void>
  deleteUserConfig: () => Promise<void>
  saveGlobalConfig: (config: LLMConfig | null) => Promise<void>
  listModels: (provider: LLMProvider, apiKey: string, baseUrl?: string) => Promise<LLMModelInfo[]>
}

export function useLLMConfig(): UseLLMConfig {
  const { user } = useAuth()
  const isAdminMaster = useIsAdminMaster()
  const [userConfig, setUserConfig] = useState<LLMConfig | null>(null)
  const [globalConfig, setGlobalConfig] = useState<LLMConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Subscrever config pessoal via campo do user doc
  useEffect(() => {
    if (!user) {
      setUserConfig(null)
      setLoading(false)
      return
    }
    const ref = doc(firestore, 'users', user.uid)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as any
          const cfg = data.llmConfig
          if (cfg) {
            setUserConfig({
              provider: cfg.provider,
              model: cfg.model,
              apiKey: cfg.apiKey ?? '',
              baseUrl: cfg.baseUrl,
              temperature: cfg.temperature,
              maxTokens: cfg.maxTokens,
              scope: 'user',
              updatedAt: cfg.updatedAt?.toDate?.()?.toISOString() ?? cfg.updatedAt,
            } as LLMConfig)
          } else {
            setUserConfig(null)
          }
        } else {
          setUserConfig(null)
        }
        setLoading(false)
      },
      (err) => {
        console.warn('Erro ao ler llmConfig do user:', err)
        setError(err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [user])

  // Subscrever config global
  useEffect(() => {
    const ref = doc(firestore, 'admin-config', 'llm')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const raw = snap.data() as any
          // O doc é gravado com envelope de auditoria { data: {...}, version, updatedAt }.
          // Suportamos tambem o formato legado (campos na raiz).
          const d = raw && typeof raw.data === 'object' && raw.data !== null ? raw.data : raw
          if (d && (d.provider || d.model)) {
            setGlobalConfig({
              provider: d.provider,
              model: d.model,
              apiKey: d.apiKey ?? '',
              baseUrl: d.baseUrl,
              temperature: d.temperature,
              maxTokens: d.maxTokens,
              scope: 'global',
              updatedAt:
                raw.updatedAt?.toDate?.()?.toISOString?.() ??
                raw.updatedAt ??
                d.updatedAt,
            } as LLMConfig)
          } else {
            setGlobalConfig(null)
          }
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
      // Tenta via Cloud Function (que vai fazer merge seguro)
      await api.setLLMConfig(config)
    } catch (err) {
      console.warn('Backend setLLMConfig falhou, gravando direto:', err)
      // Fallback: grava direto no campo do user doc
      await setDoc(
        doc(firestore, 'users', user.uid),
        {
          llmConfig: {
            ...config,
            scope: 'user',
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true },
      )
    }
  }

  async function deleteUserConfig() {
    if (!user) return
    try {
      await api.deleteLLMConfig()
    } catch {
      await setDoc(
        doc(firestore, 'users', user.uid),
        { llmConfig: deleteField() },
        { merge: true },
      )
    }
  }

  async function saveGlobalConfig(config: LLMConfig | null) {
    if (!isAdminMaster) throw new Error('Apenas admin master pode setar config global')
    try {
      await api.adminSetGlobalLLM(config)
    } catch (err) {
      console.warn('Backend adminSetGlobalLLM falhou:', err)
      if (config === null) {
        await setDoc(doc(firestore, 'admin-config', 'llm'), {}, { merge: false })
      } else {
        await setDoc(
          doc(firestore, 'admin-config', 'llm'),
          {
            ...config,
            scope: 'global',
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        )
      }
    }
  }

  async function listModels(provider: LLMProvider, apiKey: string, baseUrl?: string): Promise<LLMModelInfo[]> {
    const info = getProviderInfo(provider)
    if (!info) throw new Error('Provider desconhecido')

    try {
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
