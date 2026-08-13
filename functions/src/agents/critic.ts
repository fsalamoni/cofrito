/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-imports */
/**
 * Critic — avalia o rascunho do Legal-Writer antes de devolver ao usuário.
 *
 * Quatro eixos (Lexio-style):
 *  (1) corretude factual e técnica
 *  (2) cobertura do pedido original
 *  (3) riscos (citações duvidosas, lacunas, sem fontes)
 *  (4) clareza para o usuário final
 *
 * Output: JSON { score: 0-100, reasons: string[], shouldStop: boolean }
 * - score >= criticThreshold → shouldStop = true (encerrar turno)
 * - score < criticThreshold   → shouldStop = false (sugerir iteração)
 *
 * IMPORTANTE: o crítico NÃO tem permissão para inventar jurisprudência/doutrina.
 * Sua função é APENAS avaliar a saída do redator.
 */

import { generateWithProvider, type LLMConfigLike } from '../services/llm-providers'

export interface CriticInput {
  question: string
  draft: string
  sources: Array<{ id: string; title: string; type: string; verified: boolean }>
  iteration: number
  maxIterations: number
  criticThreshold: number
  llmConfig: LLMConfigLike
  geminiApiKey: string
  logger: { info: (m: string, x?: unknown) => void; warn: (m: string, x?: unknown) => void }
}

export interface CriticOutput {
  score: number
  reasons: string[]
  shouldStop: boolean
}

const CRITIC_SYSTEM_PROMPT = `Você é o **Crítico** do Cofrito (assistente do CAOCIPP do MPRS).

Sua função EXCLUSIVA é avaliar a resposta gerada por outro agente. Você NUNCA escreve a resposta final.

# REGRAS INALTERÁVEIS

1. Você NUNCA escreve uma nova resposta. Você apenas avalia.
2. Você NUNCA inventa jurisprudência, doutrina, legislação.
3. Se a resposta do redutor contiver "não foram encontrados", isso NÃO é problema — é comportamento correto.
4. Se a resposta citar fontes verificáveis, dê pontos por isso.
5. Se a resposta contiver alegações SEM fonte, penalize severamente (cite sem prova = alucinação = score < 50).

# QUATRO EIXOS DE AVALIAÇÃO

(1) **Corretude factual e técnica** (0-25 pts):
- As informações citadas são consistentes com a pergunta?
- Há dados que parecem inventados/duvidosos?

(2) **Cobertura do pedido original** (0-25 pts):
- A resposta cobre TODOS os pontos perguntados?
- Há pontos óbvios em falta?

(3) **Riscos** (0-25 pts):
- Há citações sem fonte?
- Há números/leis inventados?
- A resposta promete algo que o material não suporta?

(4) **Clareza** (0-25 pts):
- Linguagem técnica mas acessível?
- Estrutura clara (cabeçalhos, listas)?
- Tom jurídico adequado?

# FORMATO DE SAÍDA

Responda EXCLUSIVAMENTE com JSON válido (sem markdown, sem fences, sem texto adicional):
{
  "score": <0-100>,
  "reasons": [<motivos curtos em pt-BR, máx. 6 itens>],
  "shouldStop": <true|false>
}

Heurísticas para shouldStop:
- score >= 75 → true
- score < 60 → false (sugere iteração)
- iteration >= maxIterations → true (força parada, mesmo se score baixo)
- Se a resposta diz literalmente "não foram encontrados materiais..." E isso é consistente com a pergunta → true (não há mais o que iterar)`

export async function runCritic(input: CriticInput): Promise<CriticOutput> {
  const { question, draft, sources, iteration, maxIterations, criticThreshold, llmConfig, geminiApiKey, logger } = input

  // Default em caso de erro
  const fallback: CriticOutput = { score: 75, reasons: ['Crítico indisponível — pontuação default'], shouldStop: true }

  try {
    const userPrompt = buildCriticUserPrompt(question, draft, sources, iteration, maxIterations)
    const out = await generateWithProvider({
      systemPrompt: CRITIC_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      config: { ...llmConfig, maxTokens: 800, temperature: 0.1 },
      geminiApiKey,
    })

    const parsed = parseCriticResponse(out.content)
    // Heurística adicional: se chegamos na última iteração, força parada
    if (iteration >= maxIterations) {
      parsed.shouldStop = true
    }
    // Heurística de threshold
    parsed.shouldStop = parsed.shouldStop || parsed.score >= criticThreshold
    logger.info('critic.done', { score: parsed.score, shouldStop: parsed.shouldStop })
    return parsed
  } catch (err: any) {
    logger.warn('critic.fallback', { err: err?.message })
    return fallback
  }
}

function buildCriticUserPrompt(
  question: string,
  draft: string,
  sources: Array<{ id: string; title: string; type: string; verified: boolean }>,
  iteration: number,
  maxIterations: number,
): string {
  return `PERGUNTA ORIGINAL DO USUÁRIO:
"""
${question}
"""

RASCUNHO A AVALIAR (resposta atual do agente):
"""
${draft.slice(0, 6000)}
"""

FONTES DISPONÍVEIS (${sources.length}):
${sources.length === 0 ? '(nenhuma)' : sources.map((s) => `- [${s.type}] ${s.title} (verified: ${s.verified})`).join('\n')}

CONTEXTO: iteração ${iteration} de ${maxIterations}

Avalie o rascunho nos quatro eixos (corretude, cobertura, riscos, clareza) e responda com o JSON pedido.`
}

function parseCriticResponse(raw: string): CriticOutput {
  const cleaned = raw.trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { score: 75, reasons: ['Resposta do crítico não era JSON válido'], shouldStop: true }
  }
  try {
    const parsed = JSON.parse(jsonMatch[0])
    const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : 75
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.filter((r: any) => typeof r === 'string').slice(0, 6) : []
    const shouldStop = typeof parsed.shouldStop === 'boolean' ? parsed.shouldStop : score >= 75
    return { score, reasons, shouldStop }
  } catch {
    return { score: 75, reasons: ['JSON malformado'], shouldStop: true }
  }
}
