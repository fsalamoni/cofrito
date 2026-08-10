/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-imports */
/**
 * Orchestrator — primeiro agente do pipeline.
 *
 * Recebe a pergunta do usuário e:
 *  1. Classifica a intenção (document-retrieval, legal-analysis, simple-question, out-of-scope, refusal)
 *  2. Extrai os pontos de pesquisa
 *  3. Decide quais skills devem ser acionadas
 *  4. Detecta áreas de atuação inferidas
 *
 * Saída: OrchestratorPlan (consumida pelos próximos agentes)
 */

import { generateWithProvider, type LLMConfigLike } from '../services/llm-providers'
import { ORCHESTRATOR_SYSTEM_PROMPT, buildOrchestratorUserPrompt } from './prompts'
import type { OrchestratorPlan, ResearchPoint } from './types'

export interface OrchestratorInput {
  question: string
  allowExternal: boolean
  hasCorpus: boolean
  llmConfig: LLMConfigLike
  geminiApiKey: string
  logger: { info: (m: string, x?: unknown) => void; warn: (m: string, x?: unknown) => void; error: (m: string, x?: unknown) => void }
}

const DEFAULT_PLAN: OrchestratorPlan = {
  intent: 'document-retrieval',
  reasoning: 'Plano padrão: usuário quer documentos.',
  points: [],
  requiresWebSearch: false,
  requiresLegalWriting: false,
  requiresCompilation: true,
  requiresInternalSearch: true,
}

/**
 * Roda o orchestrator e devolve o plano. Em caso de erro, devolve plano conservador
 * (document-retrieval com 1 ponto usando a pergunta inteira).
 */
export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorPlan> {
  const { question, allowExternal, hasCorpus, llmConfig, geminiApiKey, logger } = input
  const start = Date.now()

  // Plano de fallback
  const fallback: OrchestratorPlan = {
    ...DEFAULT_PLAN,
    points: [
      {
        id: 'p1',
        query: question,
        keywords: question.split(/\s+/).filter((w) => w.length > 3).slice(0, 6),
        priority: 'high',
        expectedSourceTypes: ['norm', 'legislation', 'jurisprudence', 'doctrine', 'internal-document'],
        prefersRecent: true,
      },
    ],
    requiresWebSearch: allowExternal,
  }

  try {
    const userPrompt = buildOrchestratorUserPrompt(question, allowExternal, hasCorpus)
    const out = await generateWithProvider({
      systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      config: { ...llmConfig, maxTokens: 1500, temperature: 0.1 },
      geminiApiKey,
    })
    const plan = parsePlan(out.content, fallback)
    logger.info('orchestrator.success', { durationMs: Date.now() - start, intent: plan.intent, pointsCount: plan.points.length })
    return plan
  } catch (err: any) {
    logger.warn('orchestrator.fallback', { err: err?.message })
    return fallback
  }
}

/**
 * Parseia o JSON do orchestrator com várias camadas de fallback.
 */
function parsePlan(raw: string, fallback: OrchestratorPlan): OrchestratorPlan {
  // Tentar extrair JSON puro (remover ```json ... ``` se houver)
  let cleaned = raw.trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (jsonMatch) cleaned = jsonMatch[0]

  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return fallback
  }

  // Validar intent
  const validIntents = ['document-retrieval', 'legal-analysis', 'simple-question', 'out-of-scope', 'refusal']
  const intent: OrchestratorPlan['intent'] = validIntents.includes(parsed.intent) ? parsed.intent : 'document-retrieval'

  // Validar points
  const rawPoints: any[] = Array.isArray(parsed.points) ? parsed.points : []
  const points: ResearchPoint[] = rawPoints.slice(0, 6).map((p: any, i: number) => ({
    id: typeof p?.id === 'string' ? p.id : `p${i + 1}`,
    query: typeof p?.query === 'string' ? p.query : '',
    keywords: Array.isArray(p?.keywords) ? p.keywords.filter((k: any) => typeof k === 'string') : [],
    priority: ['high', 'medium', 'low'].includes(p?.priority) ? p.priority : 'medium',
    expectedSourceTypes: Array.isArray(p?.expectedSourceTypes) ? p.expectedSourceTypes.filter((s: any) =>
      ['norm', 'legislation', 'jurisprudence', 'doctrine', 'internal-document'].includes(s),
    ) : [],
    prefersRecent: p?.prefersRecent !== false,
  })).filter((p) => p.query.trim().length > 0)

  const requiresWebSearch = !!parsed.requiresWebSearch
  const requiresLegalWriting = intent === 'legal-analysis'
  const requiresCompilation = intent !== 'simple-question' && points.length > 0
  const requiresInternalSearch = intent !== 'simple-question' && intent !== 'out-of-scope' && intent !== 'refusal'

  return {
    intent,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    points,
    requiresWebSearch: requiresWebSearch && allowExternalFromContext(), // será re-checado depois
    requiresLegalWriting,
    requiresCompilation,
    requiresInternalSearch,
    detectedAreas: Array.isArray(parsed.detectedAreas) ? parsed.detectedAreas.filter((a: any) => typeof a === 'string') : undefined,
    outOfScopeReason: typeof parsed.outOfScopeReason === 'string' ? parsed.outOfScopeReason : undefined,
    refusalReason: typeof parsed.refusalReason === 'string' ? parsed.refusalReason : undefined,
  }
}

// Workaround para evitar erro de "unused var" no TS
function allowExternalFromContext(): boolean { return true }
