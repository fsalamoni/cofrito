/**
 * Deep Search — skill de pesquisa web profunda com raciocínio.
 *
 * Fluxo:
 *  1. Orquestrador detecta que precisa de pesquisa externa
 *  2. Invoca esta skill passando o LLM config JÁ CARREGADO (sem novo load)
 *  3. A skill gera queries de busca baseadas na pergunta do usuário
 *  4. Faz N buscas via web search provider (Tavily/Serper/etc)
 *  5. Coleta snippets
 *  6. Usa o LLM (mesmo config carregado) para sintetizar resposta fundamentada
 *  7. Retorna resultado estruturado para o orquestrador
 *
 * Decisão owner (2026-08-11):
 *  - Se useGlobalModel=true, o orquestrador passa o configToUse já carregado
 *  - A skill NAO recarrega o modelo — usa direto
 */
import type { LLMConfigLike } from '../../services/llm-providers'
import type { DeepSearchConfig, WebSearchConfig } from '../types'

export interface DeepSearchInput {
  /** Pergunta original do usuário */
  question: string
  /** LLM config JÁ CARREGADO pelo orquestrador */
  llmConfig: LLMConfigLike
  /** Config de deep search (provider, maxTokens, etc) */
  deepSearchConfig: DeepSearchConfig
  /** Config de web search (qual provider usar para buscar) */
  webSearchConfig: WebSearchConfig
  /** Logger */
  logger: {
    info: (m: string, x?: unknown) => void
    warn: (m: string, x?: unknown) => void
    error: (m: string, x?: unknown) => void
  }
}

export interface DeepSearchResult {
  /** Texto sintetizado pelo LLM com base nos resultados */
  synthesizedAnswer: string
  /** Fontes coletadas (URLs + snippets) */
  sources: Array<{ url: string; title: string; snippet: string; relevance: number }>
  /** Queries geradas */
  queries: string[]
  /** Latência total */
  latencyMs: number
  /** Custo estimado (se o LLM retornar) */
  costUsd?: number
}

/**
 * Roteamento: se useGlobalModel=true, usa llmConfig (já carregado).
 * Se false, usa o model/apiKey dedicados.
 */
function resolveLlmConfig(input: DeepSearchInput): LLMConfigLike {
  if (input.deepSearchConfig.useGlobalModel) {
    input.logger.info('deep-search.useGlobalModel', { provider: input.llmConfig.provider, model: input.llmConfig.model })
    return input.llmConfig
  }
  // Modo dedicado — usa o provider/model/apiKey do deepSearchConfig
  if (!input.deepSearchConfig.provider || !input.deepSearchConfig.model) {
    input.logger.warn('deep-search.noDedicatedConfig', { fallback: 'global' })
    return input.llmConfig
  }
  return {
    provider: input.deepSearchConfig.provider,
    model: input.deepSearchConfig.model,
    apiKey: input.deepSearchConfig.apiKey || '',
  }
}

/**
 * Roteamento: NÃO implementado aqui (delegado ao researcher-web).
 * A skill apenas EXPÕE o contrato para o orquestrador.
 * Implementação real será na Fase 2c (refatorar researcher-internal em 3 camadas).
 */
export async function runDeepSearchSkill(input: DeepSearchInput): Promise<DeepSearchResult> {
  input.logger.info('deep-search.start', {
    question: input.question.slice(0, 100),
    useGlobal: input.deepSearchConfig.useGlobalModel,
  })
  const start = Date.now()
  const llmConfig = resolveLlmConfig(input)
  input.logger.info('deep-search.llmResolved', { provider: llmConfig.provider, model: llmConfig.model })

  // Por enquanto, retorna estrutura vazia — implementação completa na Fase 2c
  return {
    synthesizedAnswer: '',
    sources: [],
    queries: [],
    latencyMs: Date.now() - start,
  }
}
