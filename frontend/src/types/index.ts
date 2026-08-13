/**
 * Types compartilhados entre frontend e Cloud Functions.
 * Mantenha em sincronia com functions/src/types/.
 */

export interface UserProfile {
  uid: string
  displayName: string
  email: string
  institutionalEmail: boolean
  role: 'promotor' | 'servidor' | 'estagiario' | 'coordenador' | 'admin' | 'externo'
  unidade?: string
  areasAtuacao: string[]
  areasInferidas: string[]
  preferences: {
    tone: 'formal' | 'conversational'
    detail: 'low' | 'medium' | 'high'
    language: 'pt-BR'
  }
  status: 'active' | 'suspended' | 'deleted'
  createdAt: string
  lastSeen: string
  consent: {
    acceptedAt: string
    version: string
    ipHash: string
    userAgent: string
  }
}

export interface SourceRef {
  docId: string
  chunkId: string
  section: string
  title: string
  relevance: number
  url?: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  sources?: SourceRef[]
  feedback?: { helpful: boolean; comment?: string; at: string }
  tokens?: { prompt: number; completion: number; total: number }
  latencyMs?: number
  intent?: string
  guardrailTriggered?: string
  agentRuns?: number
  iterations?: number
  criticScore?: number

  /** ID do messageId "live" para ouvir eventos do orquestrador em tempo real (Fase 2f) */
  pipelineMessageId?: string
  /** Mensagem de erro se o pipeline falhou */
  pipelineError?: string
  createdAt: string
}

export interface Conversation {
  id: string
  uid: string
  title: string
  status: 'active' | 'archived'
  createdAt: string
  lastActivityAt: string
  messageCount: number
}

export interface ChatRequest {
  conversationId?: string
  message: string
  allowExternal?: boolean
  requestLegalAnalysis?: boolean
  effort?: 'rapido' | 'padrao' | 'profundo'
  context?: {
    documentId?: string
    intent?: string
  }
}

export interface ChatAction {
  type: 'open_consulta' | 'view_document' | 'restart' | 'view_history'
  label: string
  payload?: Record<string, unknown>
}

export interface ChatResponse {
  conversationId: string
  messageId: string
  reply: string
  sources: SourceRef[]
  intent: string
  inScope: boolean
  feedbackToken: string
  suggestions: string[]
  actions: ChatAction[]
  usage: { prompt: number; completion: number; total: number }
  latencyMs: number
  provider?: string
  model?: string
  /** Número de agent runs executados no pipeline (orquestrador, pesquisador, compilador, etc.) */
  agentRuns?: number
  /** Número de iterações do loop de crítico */
  iterations?: number
  /** Score do crítico (0-100) — só presente se rodou */
  criticScore?: number

  /** ID do messageId "live" para ouvir eventos do orquestrador em tempo real (Fase 2f) */
  pipelineMessageId?: string
}

export interface ConsultaRequest {
  assunto: string
  questaoObjetiva: string
  contextoFatico?: string
  pgea?: string
  documentosIds: string[]
}

export interface ConsultaResponse {
  protocol: string
  status: 'recebida'
  createdAt: string
  estimatedResponseDays: string
}

export interface Document {
  id: string
  title: string
  type:
    | 'ato'
    | 'tese'
    | 'parecer'
    | 'legislacao'
    | 'template'
    | 'doutrina'
    | 'faq'
    | 'manual'
    | 'manual-institucional'
  date?: string
  source?: string
  url?: string
  area: string[]
  tags: string[]
  version: number
  status: 'ativo' | 'revogado' | 'parcial'
  replacedBy?: string
  fullText: string
  summary: string
  createdAt: string
  updatedAt: string
  createdBy: string
}

export type ChatRole = 'user' | 'assistant' | 'system'

// ── LLM Config ──────────────────────────────────────────────────────────

/**
 * Provedor de LLM suportado.
 *  - 'google'      → Gemini via API Key
 *  - 'openai'      → OpenAI (compatível com muitos gateways)
 *  - 'anthropic'   → Claude (via API oficial)
 *  - 'openrouter'  → OpenRouter (multi-provider)
 *  - 'deepseek'    → DeepSeek
 *  - 'kimi'        → Kimi / Moonshot
 *  - 'qwen'        → Alibaba Qwen (DashScope)
 *  - 'groq'        → Groq
 *  - 'nvidia'      → NVIDIA NIM
 *  - 'mistral'     → Mistral AI
 *  - 'xai'         → xAI / Grok
 *  - 'cohere'      → Cohere
 *  - 'together'    → Together AI
 *  - 'fireworks'   → Fireworks AI
 *  - 'perplexity'  → Perplexity
 *  - 'ollama'      → Ollama (local)
 *  - 'custom'      → Endpoint OpenAI-compatible customizado
 */
export type LLMProvider =
  | 'google' | 'openai' | 'anthropic' | 'openrouter'
  | 'deepseek' | 'kimi' | 'qwen' | 'groq' | 'nvidia'
  | 'mistral' | 'xai' | 'cohere' | 'together'
  | 'fireworks' | 'perplexity' | 'ollama' | 'custom'

export interface LLMConfig {
  provider: LLMProvider
  /** Modelo (ex: 'gemini-2.5-flash', 'claude-3-5-sonnet', 'gpt-4o-mini'). */
  model: string
  /** API key do usuário (criptografada em produção). */
  apiKey: string
  /** Endpoint customizado (para providers self-hosted). */
  baseUrl?: string
  /** Temperatura (0-2). */
  temperature?: number
  /** Max tokens. */
  maxTokens?: number
  /** System prompt adicional (opcional). */
  systemPromptOverride?: string
  /** Salvo em: 'user' ou 'global'. */
  scope?: 'user' | 'global'
  /** Metadata. */
  updatedAt?: string
}

/** Modelo disponível em um provider. */
export interface LLMModelInfo {
  id: string
  name: string
  contextWindow?: number
  supportsTools?: boolean
  supportsVision?: boolean
  /** Tier/perfil do modelo: rápido, equilibrado ou premium. */
  tier?: 'fast' | 'balanced' | 'premium'
  /** Capacidades: o que o modelo consegue trabalhar (texto/imagem/áudio/vídeo). */
  capabilities?: ModelCapability[]
  /** Custo por 1M tokens de ENTRADA em USD (0 = gratuito). */
  inputCost?: number
  /** Custo por 1M tokens de SAÍDA em USD (0 = gratuito). */
  outputCost?: number
  /** Se o modelo é gratuito (custos 0 ou marcados como free). */
  isFree?: boolean
  /** Notas de 0-100 do modelo em cada capacidade (extração, síntese, raciocínio, redação).
   *  Normalizadas por provider — o melhor do provider tem 100, o pior tem 1. */
  agentFit?: AgentFitScores
  /** Descrição curta do modelo. */
  description?: string
}

/** Categorias de capacidade de agente — para o qual o modelo é mais apto. */
export type AgentCategory = 'extraction' | 'synthesis' | 'reasoning' | 'writing'

/** Notas 0-100 do modelo em cada categoria (escala absoluta, normalizada por provider).
 *  100 = melhor da classe · 80-99 = excelente · 60-79 = bom · 40-59 = adequado
 *  20-39 = fraco · 0-19 = ruim */
export interface AgentFitScores {
  extraction: number
  synthesis: number
  reasoning: number
  writing: number
}

/** Capacidades multimodais. */
export type ModelCapability = 'text' | 'image' | 'audio' | 'video'

// ── Pipeline multi-agente (espelha functions/src/agents/types.ts) ─────────

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

export type EffortLevel = 'rapido' | 'medio' | 'profundo'

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  rapido:   'Rápido',
  medio:    'Médio',
  profundo: 'Profundo',
}

export const EFFORT_DESCRIPTIONS: Record<EffortLevel, string> = {
  rapido:   'Resposta direta, sem crítico — até 3 iterações',
  medio:    'Equilibrado, crítico avalia 1 vez — até 6 iterações',
  profundo: 'Investigação completa, crítico avalia 2x — até 10 iterações',
}

export type Intent =
  | 'document-retrieval'
  | 'legal-analysis'
  | 'simple-question'
  | 'out-of-scope'
  | 'refusal'

export interface ResearchPoint {
  id: string
  query: string
  keywords: string[]
  priority: 'high' | 'medium' | 'low'
  expectedSourceTypes: string[]
  prefersRecent: boolean
}

export interface OrchestratorPlan {
  intent: Intent
  reasoning: string
  points: ResearchPoint[]
  requiresWebSearch: boolean
  requiresLegalWriting: boolean
  requiresCompilation: boolean
  requiresInternalSearch: boolean
  detectedAreas?: string[]
  outOfScopeReason?: string
  refusalReason?: string
}

export interface SourceRefLite {
  id: string
  docId: string
  title: string
  section?: string
  url?: string
  type: string
  relevance: number
  snippet: string
  date?: string
  verified: boolean
}

export interface AgentRun {
  id: string
  role: AgentRole
  startedAt: string
  finishedAt?: string
  durationMs?: number
  status: 'pending' | 'success' | 'error' | 'skipped'
  error?: string
  notes?: string
}

export interface ResearchConfig {
  maxSourcesPerPoint: number
  maxTotalSources: number
  preferRecentDays: number
  compilationMode: 'concise' | 'detailed' | 'raw'
  minRelevanceScore: number
  enableAutoLegalWriting: boolean
  intradayRecencyBoost: number
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
  apiKey?: string
  enabled: boolean
  maxResultsPerQuery: number
  restrictDomains?: string[]
  restrictToBR?: boolean
  safeSearch: boolean
  recencyDays?: number
}

export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  provider: 'tavily',
  enabled: false,
  maxResultsPerQuery: 5,
  restrictToBR: true,
  safeSearch: true,
  recencyDays: 365,
}

export interface IntranetConfig {
  enabled: boolean
  baseUrl: string
  authMethod: 'form' | 'basic' | 'cookie' | 'sso-redirect'
  username?: string
  password?: string
  loginPath?: string
  searchPath?: string
  documentPathPrefix?: string
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

/** Categorias semânticas de função do modelo (derivada de tier + agentFit). */
export type ModelRole =
  | 'premium'        // topo de linha (Opus, o3, Sonnet 4)
  | 'balanced'       // equilibrado (Sonnet, Gemini Pro, GPT-4.1)
  | 'fast'           // rápido/econômico (Haiku, Flash, Mini, Nano, Lite)
  | 'reasoning'      // raciocínio profundo (R1, o3, o4, Thinking)
  | 'synthesis'      // especializado em síntese (Compilador, Revisor)
  | 'extraction'     // especializado em extração (Triagem, Fact-Checker)
  | 'writing'        // especializado em redação (Redator)
  | 'multimodal'     // aceita/gerar imagem, áudio, vídeo
  | 'free'           // gratuito


