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
  /** Tribunal (DataJud) */
  tribunal?: string
  tribunalName?: string
  /** Número do processo (DataJud) */
  numero?: string
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

export type WebSearchProvider =
  | 'tavily'
  | 'serper'
  | 'brave'
  | 'perplexity'
  | 'mprs-intranet'
  | 'datajud'

export const WEB_SEARCH_PROVIDER_LABELS: Record<WebSearchProvider, string> = {
  'tavily':         'Tavily (busca IA)',
  'serper':         'Serper (Google Search API)',
  'brave':          'Brave Search',
  'perplexity':     'Perplexity (sonar com IA)',
  'mprs-intranet':  'MPRS Intranet (acesso autenticado)',
  'datajud':        'DataJud (CNJ — jurisprudência)',
}

export const WEB_SEARCH_PROVIDER_DESCRIPTIONS: Record<WebSearchProvider, string> = {
  'tavily':
    'Tavily é um motor de busca otimizado para LLMs/IA. Retorna resultados com conteúdo extraído. ' +
    'Tem plano gratuito (1000 buscas/mês) e pago. Site: tavily.com',
  'serper':
    'Serper.dev é a API de busca do Google (similar ao Programmable Search Engine). ' +
    'Tem plano gratuito limitado. Site: serper.dev',
  'brave':
    'Brave Search API — index próprio, focado em privacidade. Tem plano gratuito limitado. ' +
    'Site: brave.com/search/api',
  'perplexity':
    'Perplexity (modelo "sonar") faz busca web + IA e devolve resposta sintetizada com citações. ' +
    'Custo: ~$1/M tokens input. Site: docs.perplexity.ai',
  'mprs-intranet':
    'Acessa a intranet do MP/RS com login/senha configurados. Faz parte do corpus interno ' +
    '(sempre consultada quando habilitada, sem precisar do toggle "Pesquisa web").',
  'datajud':
    'DataJud é a API pública do CNJ (Conselho Nacional de Justiça) para consulta de ' +
    'jurisprudência em todos os tribunais brasileiros. CHAVE PÚBLICA (não precisa configurar). ' +
    'É a fonte oficial e confiável para jurisprudência.',
}

export const WEB_SEARCH_PROVIDER_COSTS: Record<WebSearchProvider, string> = {
  'tavily':         'Grátis até 1000 buscas/mês; Pro: $30/mês (5k buscas)',
  'serper':         'Grátis até 2.500 queries; depois ~$1/1k queries',
  'brave':          'Grátis até 2000 queries/mês; Pro: $3-9/CPM',
  'perplexity':     '~$1/M tokens (sonar-small); ~$3/M tokens (sonar-pro)',
  'mprs-intranet':  'Sem custo (acesso institucional)',
  'datajud':        'Sem custo (API pública)',
}

export interface WebSearchConfig {
  provider: WebSearchProvider
  apiKey?: string                   // chave do provedor
  enabled: boolean
  maxResultsPerQuery: number        // default 5
  restrictDomains?: string[]        // limitar domínios (ex: ['mp.rs.gov.br'])
  restrictToBR?: boolean            // default true
  safeSearch: boolean               // default true
  recencyDays?: number              // priorizar resultados recentes
  /** Tribunais do DataJud a consultar (default: STJ + TRF4 + TJRS — MP/RS) */
  datajudTribunals?: string[]
  /** Modelo de busca opcional (Perplexity: 'sonar' / 'sonar-pro'; outros provedores ignoram) */
  searchModel?: string
}

export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  provider: 'tavily',
  enabled: false,                    // admin master liga manualmente
  maxResultsPerQuery: 5,
  restrictToBR: true,
  safeSearch: true,
  recencyDays: 365,
  datajudTribunals: ['stj', 'trf4', 'tjrs'],
}

// ── Deep Search (pesquisa web profunda via LLM) ────────────────────────────

/**
 * Configuração da skill de "deep search" — pesquisa web profunda com raciocínio.
 *
 * Se useGlobalModel=true e houver LLM global configurado, o orquestrador
 * reusa o mesmo modelo já carregado (sem novo load de API).
 * Se useGlobalModel=false, usa o model/apiKey dedicados.
 */
export interface DeepSearchConfig {
  enabled: boolean                              // skill habilitada
  useGlobalModel: boolean                       // usar LLM global carregado
  provider?: 'openrouter' | 'google' | 'openai' | 'anthropic' | 'deepseek' | 'perplexity' | 'custom'  // se nao global
  model?: string                                // modelo dedicado
  apiKey?: string                               // chave do provedor
  maxTokens?: number                            // default 2000
  temperature?: number                          // default 0.3
  maxSearchQueries?: number                     // quantas buscas a skill faz (default 3)
  restrictToBR?: boolean                        // default true
  recencyDays?: number                          // default 365
}

export const DEFAULT_DEEP_SEARCH_CONFIG: DeepSearchConfig = {
  enabled: false,
  useGlobalModel: true,                         // default: usa LLM global
  maxTokens: 2000,
  temperature: 0.3,
  maxSearchQueries: 3,
  restrictToBR: true,
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
