/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-imports */
/**
 * Tipos do pipeline multi-agente.
 *
 * O chat é processado por um pipeline de skills:
 *   1. Orchestrator       — classifica intenção, extrai pontos, decide quais skills acionar
 *   2. Researcher-Internal — busca no corpus interno (Firestore + Storage)
 *   3. Researcher-Web      — busca web externa (Tavily/Serper/Brave + MPRS intranet)
 *   4. Compiler            — extrai trechos literais, organiza por ponto, ranqueia
 *   5. Legal-Writer        — análise jurídica baseada nos documentos encontrados
 *
 * Cada skill gera um AgentRun que é logado em Firestore
 * (`conversations/{cid}/agent-runs/{rid}`) e devolvido ao frontend
 * para que o usuário veja quais skills foram executadas.
 */

export type AgentRole =
  | 'orchestrator'
  | 'researcher-internal'
  | 'researcher-web'
  | 'compiler'
  | 'legal-writer'
  | 'critic'

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  'orchestrator':        'Orquestrador',
  'researcher-internal': 'Pesquisador Interno',
  'researcher-web':      'Pesquisador Web',
  'compiler':            'Compilador',
  'legal-writer':        'Redator Jurídico',
  'critic':              'Crítico',
}

export const AGENT_ROLE_ICONS: Record<AgentRole, string> = {
  'orchestrator':        '🧭',
  'researcher-internal': '🔍',
  'researcher-web':      '🌐',
  'compiler':            '📚',
  'legal-writer':        '⚖️',
  'critic':              '🎯',
}

/** Nível de esforço do turno — inspirado em Lexio (rapido/medio/profundo) */
export type EffortLevel = 'rapido' | 'medio' | 'profundo'

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  rapido:    'Rápido',
  medio:     'Médio',
  profundo:  'Profundo',
}

export const EFFORT_DESCRIPTIONS: Record<EffortLevel, string> = {
  rapido:    'Resposta direta, sem crítico — até 3 iterações',
  medio:     'Equilibrado, crítico avalia 1 vez — até 6 iterações',
  profundo:  'Investigação completa, crítico avalia 2x — até 10 iterações',
}

export interface EffortPreset {
  maxIterations: number
  enableCritic: boolean
  criticIterations: number    // roda crítico a cada N iterações
  criticThreshold: number     // score mínimo para parar
  enableLegalWriting: boolean
  maxTotalSources: number
  maxSourcesPerPoint: number
}

export const EFFORT_PRESETS: Record<EffortLevel, EffortPreset> = {
  rapido:    { maxIterations: 3,  enableCritic: false, criticIterations: 99, criticThreshold: 70, enableLegalWriting: false, maxTotalSources: 5,  maxSourcesPerPoint: 3 },
  medio:     { maxIterations: 6,  enableCritic: true,  criticIterations: 1,  criticThreshold: 75, enableLegalWriting: false, maxTotalSources: 10, maxSourcesPerPoint: 4 },
  profundo:  { maxIterations: 10, enableCritic: true,  criticIterations: 2,  criticThreshold: 80, enableLegalWriting: true,  maxTotalSources: 20, maxSourcesPerPoint: 5 },
}

export type Intent =
  | 'document-retrieval'  // usuário quer documentos
  | 'legal-analysis'      // usuário quer análise jurídica
  | 'simple-question'     // pergunta simples, sem pesquisa
  | 'out-of-scope'        // fora do escopo do CAOCIPP
  | 'refusal'             // pergunta que o agente deve recusar (ex: criar jurisprudência)

export type SourceType =
  | 'norm'              // Provimento, Ordem de Serviço, Recomendação
  | 'legislation'       // Lei federal/estadual
  | 'jurisprudence'     // Acórdão, súmula, decisão
  | 'doctrine'          // Obra, artigo, tese
  | 'internal-document' // Documento interno (parecer, nota técnica)
  | 'external-document' // Documento externo (artigo, página)
  | 'web'               // Página web genérica
  | 'intranet'          // MPRS intranet

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  'norm':               'Ato normativo',
  'legislation':        'Legislação',
  'jurisprudence':      'Jurisprudência',
  'doctrine':           'Doutrina',
  'internal-document':  'Documento interno',
  'external-document':  'Documento externo',
  'web':                'Página web',
  'intranet':           'Intranet MPRS',
}

export interface ResearchPoint {
  id: string
  query: string                  // pergunta específica deste ponto
  keywords: string[]             // palavras-chave para busca
  priority: 'high' | 'medium' | 'low'
  expectedSourceTypes: SourceType[]
  prefersRecent: boolean         // priorizar documentos recentes
  recencyMonths?: number         // janela de recência (em meses); null = sem limite
}

export interface OrchestratorPlan {
  intent: Intent
  reasoning: string              // por que essa intenção foi escolhida
  points: ResearchPoint[]        // pontos de pesquisa identificados
  requiresWebSearch: boolean     // se precisa de researcher-web
  requiresLegalWriting: boolean  // se precisa de legal-writer
  requiresCompilation: boolean   // se precisa de compiler
  requiresInternalSearch: boolean
  detectedAreas?: string[]       // áreas de atuação detectadas
  outOfScopeReason?: string      // se intent=out-of-scope
  refusalReason?: string         // se intent=refusal
}

export interface SourceRef {
  id: string                     // chunkId ou id interno
  docId: string
  title: string
  section?: string
  url?: string                   // link interno (Storage) ou externo
  type: SourceType
  relevance: number              // 0-1
  snippet: string                // trecho literal extraído
  fullText?: string              // texto completo (se relevance >= threshold)
  date?: string                  // data do documento (ISO)
  sourcePath?: string            // caminho de origem (Storage, web, intranet)
  verified: boolean              // true = confirmado no banco
}

export interface AgentRun {
  id: string
  role: AgentRole
  startedAt: string
  finishedAt?: string
  durationMs?: number
  input: Record<string, unknown>
  output: Record<string, unknown>
  status: 'pending' | 'success' | 'error' | 'skipped'
  error?: string
  sources?: SourceRef[]
  notes?: string
}

export interface PipelineInput {
  userId: string
  conversationId: string
  question: string
  sanitizedQuestion: string
  allowExternal: boolean         // web search ativado?
  requiresLegalWriting: boolean  // análise jurídica pedida?
  effort?: EffortLevel           // default 'medio'
  userAreas?: string[]
  systemPrompt: string
  llmConfig: import('../services/llm-providers').LLMConfigLike
  geminiApiKey: string
  researchConfig: ResearchConfig
  webSearchConfig: WebSearchConfig
  intranetConfig: IntranetConfig
  /** Função de logging (Cloud Functions logger) */
  logger: {
    info: (msg: string, meta?: unknown) => void
    warn: (msg: string, meta?: unknown) => void
    error: (msg: string, meta?: unknown) => void
  }
  /** Callback para emitir trail events (chamado a cada skill executada) */
  onTrail?: (event: TrailEvent) => void
}

export type TrailEvent =
  | { type: 'agent_start'; role: AgentRole; ts: string }
  | { type: 'agent_end'; role: AgentRole; ts: string; status: 'success' | 'error' | 'skipped'; durationMs: number }
  | { type: 'iteration_start'; i: number; ts: string }
  | { type: 'critic_score'; score: number; reasons: string[]; shouldStop: boolean; ts: string }
  | { type: 'sources_found'; count: number; ts: string; source: 'internal' | 'web' | 'compiled' }
  | { type: 'plan'; plan: OrchestratorPlan; ts: string }
  | { type: 'error'; message: string; ts: string } | { type: 'final_answer'; length: number; ts: string }

export interface PipelineResult {
  orchestratorPlan: OrchestratorPlan
  agentRuns: AgentRun[]
  compiledSources: SourceRef[]
  finalAnswer: string            // resposta em markdown
  needsLegalWriting: boolean     // se o user pediu análise
  fallbackMessage?: string       // mensagem amigável em caso de não encontrar
  iterations: number             // quantas iterações foram gastas
  criticScore?: number           // score do crítico (se rodou)
  trail: TrailEvent[]            // timeline de eventos
}

// ── Configurações persistidas em admin-config ────────────────────────────

export interface ResearchConfig {
  maxSourcesPerPoint: number       // default 5
  maxTotalSources: number          // default 12
  preferRecentDays: number         // default 365 (1 ano)
  compilationMode: 'concise' | 'detailed' | 'raw'
  minRelevanceScore: number        // 0-1, default 0.5
  enableAutoLegalWriting: boolean  // se true, sempre roda legal-writer
  intradayRecencyBoost: number     // 0-1, peso extra para docs publicados nos últimos N dias
}

export const DEFAULT_RESEARCH_CONFIG: ResearchConfig = {
  maxSourcesPerPoint: 5,
  maxTotalSources: 12,
  preferRecentDays: 365,
  compilationMode: 'detailed',
  minRelevanceScore: 0.5,
  enableAutoLegalWriting: false,
  intradayRecencyBoost: 0.2,
}

export type WebSearchProvider = 'tavily' | 'serper' | 'brave' | 'perplexity' | 'mprs-intranet'

export const WEB_SEARCH_PROVIDER_LABELS: Record<WebSearchProvider, string> = {
  'tavily':         'Tavily (recomendado)',
  'serper':         'Serper (Google)',
  'brave':          'Brave Search',
  'perplexity':     'Perplexity (sonar)',
  'mprs-intranet':  'MPRS Intranet',
}

export interface WebSearchConfig {
  provider: WebSearchProvider
  apiKey?: string                   // criptografada em produção
  enabled: boolean
  maxResultsPerQuery: number        // default 5
  restrictDomains?: string[]        // limitar domínios (ex: ['mp.rs.gov.br'])
  restrictToBR?: boolean            // default true
  safeSearch: boolean               // default true
  recencyDays?: number              // priorizar resultados recentes
}

export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  provider: 'tavily',
  enabled: false,                    // admin master liga manualmente
  maxResultsPerQuery: 5,
  restrictToBR: true,
  safeSearch: true,
  recencyDays: 365,
}

export interface IntranetConfig {
  enabled: boolean
  baseUrl: string                   // ex: 'https://intranet.mp.rs.gov.br'
  authMethod: 'form' | 'basic' | 'cookie' | 'sso-redirect'
  username?: string                 // criptografado
  password?: string                 // criptografado
  loginPath?: string                // ex: '/login' ou '/auth/signin'
  searchPath?: string               // ex: '/pesquisa?q={query}'
  documentPathPrefix?: string       // ex: '/documento/' para construir links
  cookieDomain?: string
  cookieName?: string
  customHeaders?: Record<string, string>
  testStatus: 'untested' | 'success' | 'failed'
  testMessage?: string
  testAt?: string
}

export const DEFAULT_INTRANET_CONFIG: IntranetConfig = {
  enabled: false,
  baseUrl: '',
  authMethod: 'form',
  testStatus: 'untested',
}
