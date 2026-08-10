/**
 * useOpenRouterPricing — busca preços REAIS do OpenRouter via API pública.
 *
 * A API https://openrouter.ai/api/v1/models é PÚBLICA (não exige auth) e
 * retorna `pricing.prompt` e `pricing.completion` em USD/1M tokens.
 *
 * Cache em localStorage por 24h para evitar requests repetidos.
 *
 * Retorna:
 *  - pricingMap: Map<modelId, { prompt: number, completion: number, modality?: string, context?: number }>
 *  - loading: boolean
 *  - error: Error | null
 *  - lastUpdated: Date | null
 *  - refresh(): força novo fetch
 */

import { useState, useEffect, useCallback, useRef } from 'react'

export interface OpenRouterPricingEntry {
  /** USD por 1M tokens de input */
  prompt: number
  /** USD por 1M tokens de output */
  completion: number
  /** Modalidade ("text+image->text", "text->text", etc.) */
  modality?: string
  /** Context window (do top_provider ou root) */
  context?: number
  /** Label amigável */
  name?: string
}

const CACHE_KEY = 'cofrito:openrouter:pricing:v1'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h

interface CachedPricing {
  fetchedAt: number
  data: Record<string, OpenRouterPricingEntry>
}

interface UseOpenRouterPricingResult {
  pricingMap: Map<string, OpenRouterPricingEntry>
  loading: boolean
  error: Error | null
  lastUpdated: Date | null
  refresh: () => Promise<void>
}

function readCache(): CachedPricing | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedPricing
    if (!parsed.fetchedAt || Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(data: Record<string, OpenRouterPricingEntry>): void {
  try {
    const payload: CachedPricing = { fetchedAt: Date.now(), data }
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    // localStorage cheio ou desabilitado — silencioso
  }
}

export function useOpenRouterPricing(autoFetch = true): UseOpenRouterPricingResult {
  const [pricingMap, setPricingMap] = useState<Map<string, OpenRouterPricingEntry>>(() => {
    const cached = readCache()
    if (cached) return new Map(Object.entries(cached.data))
    return new Map()
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => {
    const cached = readCache()
    return cached ? new Date(cached.fetchedAt) : null
  })
  const inflight = useRef(false)

  const fetchPricing = useCallback(async (force = false) => {
    if (inflight.current) return
    inflight.current = true
    setLoading(true)
    setError(null)
    try {
      // Cache válido e não forçado? usa direto
      if (!force) {
        const cached = readCache()
        if (cached) {
          setPricingMap(new Map(Object.entries(cached.data)))
          setLastUpdated(new Date(cached.fetchedAt))
          setLoading(false)
          inflight.current = false
          return
        }
      }
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'HTTP-Referer': 'https://cofrito.web.app', 'X-Title': 'Cofrito' },
      })
      if (!res.ok) throw new Error(`OpenRouter API ${res.status}`)
      const json = (await res.json()) as { data?: Array<{
        id: string
        name?: string
        pricing?: { prompt?: string; completion?: string }
        context_length?: number
        top_provider?: { context_length?: number }
        architecture?: { modality?: string }
      }> }
      const data: Record<string, OpenRouterPricingEntry> = {}
      for (const m of json.data ?? []) {
        // OpenRouter devolve pricing em USD/token (não /1M). Multiplicar por 1_000_000.
        const prompt = parseFloat(m.pricing?.prompt ?? '0') * 1_000_000
        const completion = parseFloat(m.pricing?.completion ?? '0') * 1_000_000
        if (!Number.isFinite(prompt) || !Number.isFinite(completion)) continue
        data[m.id] = {
          prompt,
          completion,
          modality: m.architecture?.modality,
          context: m.top_provider?.context_length ?? m.context_length,
          name: m.name,
        }
      }
      writeCache(data)
      setPricingMap(new Map(Object.entries(data)))
      setLastUpdated(new Date())
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
      inflight.current = false
    }
  }, [])

  useEffect(() => {
    if (autoFetch && pricingMap.size === 0) {
      fetchPricing()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch])

  return {
    pricingMap,
    loading,
    error,
    lastUpdated,
    refresh: () => fetchPricing(true),
  }
}
