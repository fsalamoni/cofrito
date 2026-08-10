/**
 * Model scoring — derivação de tier, capacidades e notas de "fit" por categoria.
 *
 * Inspirado no Lexio. Aqui não fazemos download dinâmico (a lista de modelos já
 * está hardcoded em `providers.ts`); então a função `normalizeModelCatalog`
 * PREENCHE automaticamente tier / capabilities / agentFit / isFree a partir do
 * id + label do modelo, e em seguida aplica uma NORMALIZAÇÃO dentro do provider
 * para que as notas 0-10 façam sentido em comparação (top do provider = 10).
 *
 * As notas brutas são heurísticas absolutas (1-10 global) — depois normalizadas
 * por provider com min-max dentro do conjunto.
 *
 * Aplica `MODEL_OVERRIDES` antes da inferência para os modelos mais conhecidos
 * (preços, tier, capabilities curados).
 */

import type {
  LLMModelInfo,
  ModelCapability,
  AgentFitScores,
  AgentCategory,
  ModelRole,
} from '@/types'
import { applyOverrides } from './model-overrides'

// ── Inferência de tier (perfil: rápido / equilibrado / premium) ──────────────

const FAST_RE = /\b(mini|nano|lite|flash|haiku|small|swift|turbo|tiny|mini-it|base|7b|8b|1b|3b|4b|0\.5|fast)\b/i
const PREMIUM_RE = /\b(r1|r2|o1[- ]?pro|o3[- ]?pro|o4[- ]?pro|opus|ultra|max|plush|pro|plus|large|405b|70b|72b|235b|sonnet|thinking|reason|deepseek[- ]?reason|qwen3|max|preview|top)\b/i

/**
 * Infere o tier do modelo pelo id + label.
 *  - 'fast'     — modelos pequenos/otimizados para velocidade
 *  - 'premium'  — modelos topo de linha / raciocínio profundo
 *  - 'balanced' — tudo o mais
 */
export function inferTier(id: string, label = ''): 'fast' | 'balanced' | 'premium' {
  const s = `${id} ${label}`.toLowerCase()
  if (PREMIUM_RE.test(s) && !FAST_RE.test(s)) return 'premium'
  if (FAST_RE.test(s)) return 'fast'
  return 'balanced'
}

// ── Inferência de capabilities (multimodalidade) ─────────────────────────────

const CAPS_TEXT_RE = /\b(text|chat|instruct|completion|gpt|claude|gemini|grok|llama|mistral|deepseek|qwen|kimi|command|sonar|phi|gemma)\b/i
const CAPS_IMAGE_RE = /\b(image|vision|vl|dall[- ]?e|flux|sdxl|imagen|ideogram|recraft|seedream|midjourney|gemini[- ]?image|image[- ]?gen)\b/i
const CAPS_AUDIO_RE = /\b(audio|tts|speech|voice|whisper|transcribe|elevenlabs|hd)\b/i
const CAPS_VIDEO_RE = /\b(video|veo|sora|kling|hailuo|ltx|runway|pika|wan|movie)\b/i

export function inferCapabilitiesFromText(id: string, label = '', description = ''): ModelCapability[] {
  const s = `${id} ${label} ${description}`.toLowerCase()
  const caps: ModelCapability[] = []
  if (CAPS_VIDEO_RE.test(s)) caps.push('video')
  if (CAPS_AUDIO_RE.test(s)) caps.push('audio')
  if (CAPS_IMAGE_RE.test(s)) caps.push('image')
  if (CAPS_TEXT_RE.test(s) || caps.length === 0) caps.push('text')
  return Array.from(new Set(caps))
}

// ── Inferência de notas brutas (escala global 0-10) ──────────────────────────

const REASONING_RE = /\b(r1|r2|o1|o3|o4|thinking|reason|think|opus[- ]?4[- ]?7|opus[- ]?4[- ]?1|deepseek[- ]?reason|qwen3|max)\b/i

/**
 * Notas brutas (0-100 absolutos) — antes da normalização por provider.
 *  - Modelos de raciocínio: reasoning alto, outros moderados
 *  - Premium: synthesis / reasoning / writing altos
 *  - Balanced: tudo em 70
 *  - Fast: extraction alto, synthesis/reasoning/writing moderados
 *
 * A escala 0-100 é a meta — depois a normalização por provider reescala
 * para que o top do provider = 100 e o pior = 1, mantendo a proporção.
 */
export function inferRawFitScores(tier: 'fast' | 'balanced' | 'premium', id: string): AgentFitScores {
  const isReasoning = REASONING_RE.test(id)
  if (isReasoning) return { extraction: 30, synthesis: 60, reasoning: 95, writing: 60 }
  switch (tier) {
    case 'fast':     return { extraction: 85, synthesis: 50, reasoning: 35, writing: 50 }
    case 'premium':  return { extraction: 60, synthesis: 90, reasoning: 90, writing: 90 }
    default:         return { extraction: 70, synthesis: 70, reasoning: 70, writing: 70 }
  }
}

/**
 * Normaliza notas brutas por provedor para que o melhor modelo do provider
 * tenha 100 e o pior tenha 1, mantendo a proporção relativa (min-max scaling).
 *
 * Se só há 1 modelo no provider, mantém as notas brutas (arredondadas).
 */
export function normalizeScoresInProvider(scores: AgentFitScores, allScores: AgentFitScores[]): AgentFitScores {
  if (allScores.length <= 1) {
    return {
      extraction: Math.round(scores.extraction),
      synthesis:  Math.round(scores.synthesis),
      reasoning:  Math.round(scores.reasoning),
      writing:    Math.round(scores.writing),
    }
  }
  const cats: AgentCategory[] = ['extraction', 'synthesis', 'reasoning', 'writing']
  const out = { ...scores }
  for (const c of cats) {
    const values = allScores.map((s) => s[c])
    const min = Math.min(...values)
    const max = Math.max(...values)
    if (max === min) {
      out[c] = 50 // all tied → "médio"
    } else {
      // min-max scaling: [min, max] → [1, 100]
      out[c] = Math.round(((scores[c] - min) / (max - min)) * 99 + 1)
    }
  }
  return out
}

// ── Função (role semântico) ───────────────────────────────────────────────────

const CATEGORY_LABELS: Record<AgentCategory, string> = {
  extraction: 'Extração',
  synthesis:  'Síntese',
  reasoning:  'Raciocínio',
  writing:    'Redação',
}
const CATEGORY_ICONS: Record<AgentCategory, string> = {
  extraction: '⚡',
  synthesis:  '⚖',
  reasoning:  '🧠',
  writing:    '✍',
}
const CATEGORY_COLORS: Record<AgentCategory, string> = {
  extraction: '#10b981',
  synthesis:  '#3b82f6',
  reasoning:  '#8b5cf6',
  writing:    '#f97316',
}

export const AGENT_CATEGORY_LABELS = CATEGORY_LABELS
export const AGENT_CATEGORY_ICONS = CATEGORY_ICONS
export const AGENT_CATEGORY_COLORS = CATEGORY_COLORS

export const AGENT_CATEGORY_DESCRIPTIONS: Record<AgentCategory, string> = {
  extraction: 'Rápido e preciso para extrair informações estruturadas (entidades, fatos, dados).',
  synthesis:  'Excelente para compilar, revisar e organizar documentos complexos.',
  reasoning:  'Raciocínio jurídico profundo, argumentação elaborada, análise de precedentes.',
  writing:    'Redação fluente de documentos longos, com tom e estilo consistentes.',
}

/**
 * Dado um agentFit, devolve a categoria de maior nota (a "função" do modelo).
 */
export function getTopCategory(scores: AgentFitScores): { category: AgentCategory; label: string; icon: string; color: string; score: number } {
  let bestCat: AgentCategory = 'balanced' as never
  let bestScore = -1
  ;(Object.keys(scores) as AgentCategory[]).forEach((c) => {
    if (scores[c] > bestScore) {
      bestScore = scores[c]
      bestCat = c
    }
  })
  return {
    category: bestCat,
    label: CATEGORY_LABELS[bestCat],
    icon: CATEGORY_ICONS[bestCat],
    color: CATEGORY_COLORS[bestCat],
    score: bestScore,
  }
}

/**
 * Infere a "função" semântica (ModelRole) combinando tier, agentFit e capabilities.
 *  - 'premium' se tier premium
 *  - 'reasoning' se categoria top é reasoning com score >= 8
 *  - 'extraction' se top é extraction com score >= 8
 *  - 'multimodal' se tem capabilities além de texto
 *  - 'free' se isFree
 *  - 'fast' se tier fast
 *  - 'balanced' como default
 */
export function inferModelRole(
  tier: 'fast' | 'balanced' | 'premium',
  fit: AgentFitScores,
  capabilities: ModelCapability[],
  isFree: boolean,
): ModelRole {
  if (isFree) return 'free'
  if (tier === 'premium') return 'premium'
  if (tier === 'fast') return 'fast'
  const top = getTopCategory(fit)
  if (top.score >= 8) {
    if (top.category === 'reasoning') return 'reasoning'
    if (top.category === 'synthesis') return 'synthesis'
    if (top.category === 'extraction') return 'extraction'
    if (top.category === 'writing') return 'writing'
  }
  const hasMultimodal = capabilities.some((c) => c !== 'text')
  if (hasMultimodal) return 'multimodal'
  return 'balanced'
}

export const MODEL_ROLE_LABELS: Record<ModelRole, string> = {
  premium:    'Premium',
  balanced:   'Equilibrado',
  fast:       'Rápido',
  reasoning:  'Raciocínio',
  synthesis:  'Síntese',
  extraction: 'Extração',
  writing:    'Redação',
  multimodal: 'Multimodal',
  free:       'Grátis',
}

export const MODEL_ROLE_COLORS: Record<ModelRole, { bg: string; text: string }> = {
  premium:    { bg: 'rgba(245, 158, 11, 0.15)', text: '#92400e' },  // amber
  balanced:   { bg: 'rgba(139, 92, 246, 0.15)', text: '#5b21b6' }, // purple
  fast:       { bg: 'rgba(16, 185, 129, 0.15)', text: '#065f46' }, // emerald
  reasoning:  { bg: 'rgba(99, 102, 241, 0.15)', text: '#3730a3' }, // indigo
  synthesis:  { bg: 'rgba(59, 130, 246, 0.15)', text: '#1e40af' }, // blue
  extraction: { bg: 'rgba(20, 184, 166, 0.15)', text: '#115e59' }, // teal
  writing:    { bg: 'rgba(249, 115, 22, 0.15)', text: '#9a3412' }, // orange
  multimodal: { bg: 'rgba(236, 72, 153, 0.15)', text: '#9d174d' }, // pink
  free:       { bg: 'rgba(34, 197, 94, 0.15)', text: '#166534' },  // green
}

// ── Inferência de provider (a partir do id) ──────────────────────────────────

const PROVIDER_FROM_ID: Record<string, string> = {
  'google':       'Google',
  'openai':       'OpenAI',
  'anthropic':    'Anthropic',
  'openrouter':   'OpenRouter',
  'deepseek':     'DeepSeek',
  'kimi':         'Kimi',
  'qwen':         'Qwen',
  'groq':         'Groq',
  'nvidia':       'NVIDIA',
  'mistral':      'Mistral',
  'xai':          'xAI',
  'cohere':       'Cohere',
  'together':     'Together',
  'fireworks':    'Fireworks',
  'perplexity':   'Perplexity',
  'ollama':       'Ollama',
  'meta-llama':   'Meta',
  'mistralai':    'Mistral',
  'meta':         'Meta',
  'x-ai':         'xAI',
  'microsoft':    'Microsoft',
  'amazon':       'Amazon',
  'ai21':         'AI21',
}

export function inferProviderFromId(modelId: string): string {
  const prefix = modelId.split('/')[0]
  if (PROVIDER_FROM_ID[prefix]) return PROVIDER_FROM_ID[prefix]
  return prefix.charAt(0).toUpperCase() + prefix.slice(1)
}

// ── Normalização do catálogo ──────────────────────────────────────────────────

/**
 * Aplica a normalização: preenche campos faltantes (tier, capabilities, agentFit,
 * isFree) com base em heurísticas, e DEPOIS normaliza as notas de agentFit
 * DENTRO de cada provider.
 *
 * O resultado é um array de LLMModelInfo com agentFit sempre presente e notas
 * calibradas (top do provider = 10, pior = 1).
 */
export function normalizeModelCatalog(models: LLMModelInfo[]): LLMModelInfo[] {
  if (models.length === 0) return models

  // 0) Aplicar overrides conhecidos (preços, tier, capabilities curados)
  const withOverrides = applyOverrides(models)

  // 1) Preencher campos derivados básicos
  const enriched = withOverrides.map((m) => {
    const tier = m.tier ?? inferTier(m.id, m.name)
    const capabilities = m.capabilities && m.capabilities.length > 0
      ? m.capabilities
      : inferCapabilitiesFromText(m.id, m.name, m.description)
    const inputCost = m.inputCost ?? 0
    const outputCost = m.outputCost ?? 0
    const isFree = m.isFree ?? (inputCost === 0 && outputCost === 0)
    const rawFit = m.agentFit ?? inferRawFitScores(tier, m.id)
    return { ...m, tier, capabilities, inputCost, outputCost, isFree, agentFit: rawFit }
  })

  // 2) Normalizar agentFit dentro de cada provider
  // (assumimos que o array `enriched` pode misturar modelos de providers diferentes;
  //  agrupamos por inferência de provider do id)
  const groups = new Map<string, { idx: number; rawFit: AgentFitScores }[]>()
  enriched.forEach((m, i) => {
    const prov = inferProviderFromId(m.id)
    if (!groups.has(prov)) groups.set(prov, [])
    groups.get(prov)!.push({ idx: i, rawFit: m.agentFit! })
  })

  groups.forEach((entries) => {
    const allRaw = entries.map((e) => e.rawFit)
    entries.forEach((e) => {
      const normalized = normalizeScoresInProvider(e.rawFit, allRaw)
      enriched[e.idx] = { ...enriched[e.idx], agentFit: normalized }
    })
  })

  return enriched
}

/**
 * Versão que aplica normalização mas devolve também o `role` derivado,
 * útil para ordenação e agrupamento no front.
 */
export interface EnrichedModel extends LLMModelInfo {
  role: ModelRole
  provider: string
}

export function enrichModelsWithRole(models: LLMModelInfo[]): EnrichedModel[] {
  return normalizeModelCatalog(models).map((m) => ({
    ...m,
    role: inferModelRole(m.tier!, m.agentFit!, m.capabilities!, m.isFree!),
    provider: inferProviderFromId(m.id),
  }))
}

// ── Formatação de contexto ───────────────────────────────────────────────────

export function formatContext(tokens: number | undefined): string {
  if (!tokens || tokens === 0) return '—'
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`
  return String(tokens)
}

// ── Cor da nota (escala 0-10) ────────────────────────────────────────────────

export function scoreColor(score: number): { bg: string; text: string } {
  if (score >= 9) return { bg: 'rgba(16, 185, 129, 0.20)', text: '#047857' } // emerald
  if (score >= 7) return { bg: 'rgba(34, 197, 94, 0.18)', text: '#15803d' } // green
  if (score >= 5) return { bg: 'rgba(250, 204, 21, 0.22)', text: '#854d0e' } // yellow
  if (score >= 3) return { bg: 'rgba(251, 146, 60, 0.20)', text: '#9a3412' } // orange
  return { bg: 'rgba(248, 113, 113, 0.20)', text: '#991b1b' }               // red
}

// ── Capability badges ────────────────────────────────────────────────────────

export const CAPABILITY_LABELS: Record<ModelCapability, { icon: string; label: string; color: string }> = {
  text:  { icon: '📝', label: 'Texto',  color: '#475569' },
  image: { icon: '🖼', label: 'Imagem', color: '#be185d' },
  audio: { icon: '🎵', label: 'Áudio',  color: '#0e7490' },
  video: { icon: '🎬', label: 'Vídeo',  color: '#6d28d9' },
}
