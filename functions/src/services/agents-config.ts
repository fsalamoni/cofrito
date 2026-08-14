/**
 * Agents Config — configuração unificada dos agentes da plataforma.
 *
 * Modela cada agente (orquestrador, criador de acervo, pesquisador externo) com:
 *  - enabled: se o agente está ativo
 *  - model: como o agente resolve seu modelo LLM
 *      - mode 'global': usa o LLM global do admin
 *      - mode 'custom': usa provider/model/apiKey/baseUrl próprios
 *  - skills: comandos/skills que orientam o agente (CRUD pelo admin)
 *
 * Persistido em `admin-config/agents` (via config-store, com envelope de auditoria).
 * O apiKey NUNCA é devolvido cru ao front — só `hasApiKey` + máscara. Ver handler.
 */
import { logger } from 'firebase-functions'
import { loadConfigDoc } from './config-store'
import type { LLMConfigLike, LLMProvider } from './llm-providers'

// ── Tipos ──────────────────────────────────────────────────────────────

/** IDs canônicos dos agentes configuráveis. */
export type AgentId = 'orchestrator' | 'acervo' | 'web-researcher'

export const AGENT_IDS: AgentId[] = ['orchestrator', 'acervo', 'web-researcher']

/**
 * Agentes configuráveis POR USUÁRIO. O 'acervo' roda apenas no upload (admin),
 * então não faz parte do escopo do usuário.
 */
export const USER_AGENT_IDS: AgentId[] = ['orchestrator', 'web-researcher']

/** Skill/comando que orienta um agente. */
export interface AgentSkill {
  /** id estável (gerado no front ou server) */
  id: string
  /** nome curto (ex: "Extrair citações") */
  name: string
  /** descrição do que a skill faz (para o admin) */
  description: string
  /** instrução/prompt injetado no system prompt do agente */
  prompt: string
  /** se a skill está ativa */
  enabled: boolean
}

/** Como o agente resolve seu modelo LLM. */
export interface AgentModelConfig {
  /** 'global' = usa o LLM global do admin; 'custom' = usa os campos abaixo */
  mode: 'global' | 'custom'
  provider?: LLMProvider
  model?: string
  /** Guardado só no server; nunca devolvido cru ao front. */
  apiKey?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
}

/** Configuração completa de um agente. */
export interface AgentConfig {
  id: AgentId
  /** rótulo exibido (pode ser editado no futuro) */
  label: string
  enabled: boolean
  model: AgentModelConfig
  skills: AgentSkill[]
}

/** Documento raiz da config de agentes. */
export interface AgentsConfig {
  agents: Record<AgentId, AgentConfig>
}

// ── Defaults ────────────────────────────────────────────────────────────

const AGENT_LABELS: Record<AgentId, string> = {
  orchestrator: 'Agente Orquestrador (chat)',
  acervo: 'Criador de Acervo (upload)',
  'web-researcher': 'Pesquisador Externo (web)',
}

function defaultSkill(id: string, name: string, description: string, prompt: string): AgentSkill {
  return { id, name, description, prompt, enabled: true }
}

/** Skills-semente por agente (o admin pode editar/excluir/adicionar). */
function defaultSkillsFor(id: AgentId): AgentSkill[] {
  switch (id) {
    case 'orchestrator':
      return [
        defaultSkill(
          'orch-conversa-natural',
          'Conversa natural',
          'Conversa de forma humana sobre o próprio agente, o acervo e temas gerais, sem inventar conteúdo jurídico.',
          'Converse de modo natural e humano. Quando perguntarem quem você é, o que faz ou como ajuda, responda com clareza sobre o Cofrito. Nunca invente jurisprudência, documentos ou citações.',
        ),
        defaultSkill(
          'orch-busca-acervo',
          'Busca no acervo',
          'Interpreta o pedido do usuário e busca no acervo interno os documentos pertinentes.',
          'Analise as nuances do pedido (assunto principal, assuntos complementares, autoridades, vínculos, circunstâncias) e busque no acervo interno os documentos que tratem exatamente desses pontos. Priorize precisão sobre volume.',
        ),
        defaultSkill(
          'orch-entrega-ordenada',
          'Entrega ordenada',
          'Entrega os documentos encontrados de forma organizada, com ementa e trechos literais, com ou sem análise própria conforme solicitado.',
          'Apresente os documentos de forma ordenada: identifique cada um, resuma pela ementa e cite trechos literais. Só produza análise/conclusão própria quando o usuário pedir uma análise.',
        ),
      ]
    case 'acervo':
      return [
        defaultSkill(
          'acervo-classificacao',
          'Classificação jurídica',
          'Classifica o documento por natureza, área do direito, assuntos, tipo e contexto.',
          'Classifique o documento dentro dos tipos mapeados: natureza (consultivo/executório/transacional/negocial/doutrinário/decisório), áreas do direito, assuntos, tipo específico e contexto fático.',
        ),
        defaultSkill(
          'acervo-pontos-relevantes',
          'Pontos relevantes detalhados',
          'Extrai assunto principal, assuntos complementares, pessoas, autoridades, vínculos e todas as circunstâncias que tornam o caso único.',
          'Mapeie de forma exaustiva o que torna o caso único: assunto principal e complementares, pessoas envolvidas (autoridades, cargos), vínculos de parentesco/afinidade/amizade/compadrio, valores, datas e circunstâncias. Registre como o redator tratou cada ponto e os fundamentos da decisão.',
        ),
        defaultSkill(
          'acervo-ementa',
          'Ementa jurídica',
          'Redige ementa jurídica do CONTEÚDO do documento (não do trabalho do modelo).',
          'Redija uma ementa jurídica sobre o conteúdo do documento — tipo, assunto, síntese do caso, fundamentação (tese e dispositivos), conclusão e palavras-chave — para auxiliar a busca no chat.',
        ),
        defaultSkill(
          'acervo-reconstrucao',
          'Reconstrução íntegra',
          'Reconstrói o texto integral do documento sem quebras de página, preservando parágrafos.',
          'Reconstrua o texto integral do título à assinatura, sem cabeçalho/rodapé, unindo parágrafos quebrados entre páginas, preservando a coerência e a integralidade do documento original.',
        ),
      ]
    case 'web-researcher':
      return [
        defaultSkill(
          'web-busca-externa',
          'Busca externa',
          'Pesquisa fontes externas (web) quando habilitado, priorizando fontes oficiais.',
          'Quando a pesquisa web estiver habilitada, busque fontes externas confiáveis e oficiais pertinentes ao pedido, retornando links verificáveis.',
        ),
        defaultSkill(
          'web-sintese-fontes',
          'Síntese de fontes',
          'Resume as fontes externas encontradas com links, sem inventar conteúdo.',
          'Resuma cada fonte externa encontrada indicando a origem e o link. Nunca invente conteúdo nem apresente fonte sem link verificável.',
        ),
      ]
  }
}

export function defaultAgentConfig(id: AgentId): AgentConfig {
  return {
    id,
    label: AGENT_LABELS[id],
    enabled: true,
    model: { mode: 'global' },
    skills: defaultSkillsFor(id),
  }
}

export function defaultAgentsConfig(): AgentsConfig {
  return {
    agents: {
      orchestrator: defaultAgentConfig('orchestrator'),
      acervo: defaultAgentConfig('acervo'),
      'web-researcher': defaultAgentConfig('web-researcher'),
    },
  }
}

// ── Normalização (merge do que está salvo com os defaults) ──────────────

function normalizeSkill(raw: unknown): AgentSkill | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  if (!name) return null
  const id = typeof r.id === 'string' && r.id ? r.id : `skill-${Math.random().toString(36).slice(2, 10)}`
  return {
    id,
    name: name.slice(0, 120),
    description: typeof r.description === 'string' ? r.description.slice(0, 500) : '',
    prompt: typeof r.prompt === 'string' ? r.prompt.slice(0, 4000) : '',
    enabled: r.enabled !== false,
  }
}

function normalizeModel(raw: unknown): AgentModelConfig {
  if (typeof raw !== 'object' || raw === null) return { mode: 'global' }
  const r = raw as Record<string, unknown>
  const mode = r.mode === 'custom' ? 'custom' : 'global'
  const model: AgentModelConfig = { mode }
  if (typeof r.provider === 'string') model.provider = r.provider as LLMProvider
  if (typeof r.model === 'string') model.model = r.model
  if (typeof r.apiKey === 'string') model.apiKey = r.apiKey
  if (typeof r.baseUrl === 'string') model.baseUrl = r.baseUrl
  if (typeof r.temperature === 'number') model.temperature = r.temperature
  if (typeof r.maxTokens === 'number') model.maxTokens = r.maxTokens
  return model
}

function normalizeAgent(id: AgentId, raw: unknown): AgentConfig {
  const base = defaultAgentConfig(id)
  if (typeof raw !== 'object' || raw === null) return base
  const r = raw as Record<string, unknown>
  const skills = Array.isArray(r.skills)
    ? r.skills.map(normalizeSkill).filter((s): s is AgentSkill => s !== null)
    : base.skills
  return {
    id,
    label: typeof r.label === 'string' && r.label ? r.label : base.label,
    enabled: r.enabled !== false,
    model: normalizeModel(r.model),
    // se o admin apagou todas as skills, respeitamos (lista vazia é válida)
    skills,
  }
}

/**
 * Normaliza um documento cru (parcial/legado) para a AgentsConfig completa,
 * preenchendo agentes ausentes com defaults.
 */
export function normalizeAgentsConfig(raw: unknown): AgentsConfig {
  const rawAgents = (typeof raw === 'object' && raw !== null && 'agents' in (raw as Record<string, unknown>))
    ? (raw as { agents?: unknown }).agents
    : raw
  const agentsRecord = (typeof rawAgents === 'object' && rawAgents !== null)
    ? rawAgents as Record<string, unknown>
    : {}
  return {
    agents: {
      orchestrator: normalizeAgent('orchestrator', agentsRecord.orchestrator),
      acervo: normalizeAgent('acervo', agentsRecord.acervo),
      'web-researcher': normalizeAgent('web-researcher', agentsRecord['web-researcher']),
    },
  }
}

// ── Load ────────────────────────────────────────────────────────────────

export const AGENTS_CONFIG_PATH = 'admin-config/agents'

/**
 * Lê a AgentsConfig persistida (sempre completa, mesclada com defaults).
 * Nunca lança — em erro, devolve os defaults.
 */
export async function loadAgentsConfig(): Promise<AgentsConfig> {
  try {
    const loaded = await loadConfigDoc<unknown>(AGENTS_CONFIG_PATH, 'agents')
    if (!loaded) return defaultAgentsConfig()
    return normalizeAgentsConfig(loaded.data)
  } catch (err) {
    logger.warn('loadAgentsConfig: falhou, usando defaults', { err: (err as Error).message })
    return defaultAgentsConfig()
  }
}

// ── Resolução do modelo efetivo ─────────────────────────────────────────

/**
 * Resolve o LLMConfigLike efetivo para um agente.
 *  - Se o agente está em modo 'custom' e tem provider+model+apiKey → usa o dele.
 *  - Caso contrário → cai no `global` fornecido.
 * Retorna null se nem custom nem global forem utilizáveis.
 */
export function resolveAgentLLMConfig(
  agent: AgentConfig | undefined,
  global: LLMConfigLike | null,
): LLMConfigLike | null {
  if (agent && agent.model.mode === 'custom') {
    const m = agent.model
    if (m.provider && m.model && m.apiKey) {
      return {
        provider: m.provider,
        model: m.model,
        apiKey: m.apiKey,
        baseUrl: m.baseUrl,
        temperature: m.temperature,
        maxTokens: m.maxTokens,
      }
    }
    // custom incompleto → fallback para global (não trava a plataforma)
    logger.warn('resolveAgentLLMConfig: modo custom incompleto, usando global', { agentId: agent.id })
  }
  return global
}

// ── Config por usuário (apenas modelos, sem skills) ─────────────────────

/** Mapa de modelos por-agente definidos por um usuário. */
export type UserAgentModels = Partial<Record<AgentId, AgentModelConfig>>

/**
 * Normaliza a config de agentes de um usuário (só os modelos).
 * Aceita `{ agents: {...} }` ou o mapa direto `{ orchestrator: {...} }`.
 */
export function normalizeUserAgentModels(raw: unknown): UserAgentModels {
  const source = (typeof raw === 'object' && raw !== null && 'agents' in (raw as Record<string, unknown>))
    ? (raw as { agents?: unknown }).agents
    : raw
  const rec = (typeof source === 'object' && source !== null) ? source as Record<string, unknown> : {}
  const out: UserAgentModels = {}
  for (const id of AGENT_IDS) {
    if (rec[id]) out[id] = normalizeModel(rec[id])
  }
  return out
}

/**
 * Resolve o LLM efetivo de um agente para um usuário:
 *  - modelo dedicado do usuário (custom completo) → usa o dele
 *  - caso contrário → cai no `base` (config base do usuário / fallback)
 */
export function resolveUserAgentLLMConfig(
  userModel: AgentModelConfig | undefined,
  base: LLMConfigLike | null,
): LLMConfigLike | null {
  if (userModel && userModel.mode === 'custom' && userModel.provider && userModel.model && userModel.apiKey) {
    return {
      provider: userModel.provider,
      model: userModel.model,
      apiKey: userModel.apiKey,
      baseUrl: userModel.baseUrl,
      temperature: userModel.temperature,
      maxTokens: userModel.maxTokens,
    }
  }
  return base
}

/**
 * Retorna as skills ATIVAS de um agente, concatenadas como bloco de instruções
 * para injeção no system prompt. String vazia se não houver skills ativas.
 */
export function buildAgentSkillsPrompt(agent: AgentConfig | undefined): string {
  if (!agent || agent.skills.length === 0) return ''
  const active = agent.skills.filter((s) => s.enabled && s.prompt.trim())
  if (active.length === 0) return ''
  const lines = active.map((s) => `- ${s.name}: ${s.prompt.trim()}`)
  return ['# SKILLS CONFIGURADAS', ...lines].join('\n')
}
