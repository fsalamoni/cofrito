/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-imports */
/**
 * Legal-Writer — quinto (e último) agente do pipeline.
 *
 * Recebe o compilado e gera a análise jurídica provisória em Markdown.
 *
 * REGRAS PRIMORDIAIS (NUNCA QUEBRAR):
 *  - NUNCA inventar jurisprudência, doutrina, legislação
 *  - SEMPRE transcrever trechos literais
 *  - SEMPRE citar fonte (link + chunkId)
 *  - Se material insuficiente, declarar literalmente
 *  - Mesmo se user pedir pra inventar, recusar literalmente
 */

import { generateWithProvider, type LLMConfigLike } from '../services/llm-providers'
import { LEGAL_WRITER_SYSTEM_PROMPT, buildLegalWriterUserPrompt, REFUSAL_INVENT_MESSAGE, buildFallbackMessage } from './prompts'
import type { SourceRef } from './types'

export interface LegalWriterInput {
  question: string
  requiresLegalWriting: boolean
  allowExternal: boolean
  compiled: {
    summary: string
    sources: SourceRef[]
    hasEnoughMaterial: boolean
    warnings: string[]
  }
  llmConfig: LLMConfigLike
  geminiApiKey: string
  logger: { info: (m: string, x?: unknown) => void; warn: (m: string, x?: unknown) => void; error: (m: string, x?: unknown) => void }
}

export async function runLegalWriter(input: LegalWriterInput): Promise<{ answer: string }> {
  const { question, compiled, llmConfig, geminiApiKey, logger } = input
  const start = Date.now()

  // Se tem material suficiente, usar LLM
  if (compiled.hasEnoughMaterial && compiled.sources.length > 0) {
    try {
      const userPrompt = buildLegalWriterUserPrompt(question, compiled)
      const out = await generateWithProvider({
        systemPrompt: LEGAL_WRITER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        config: { ...llmConfig, maxTokens: 4000, temperature: 0.2 }, timeoutMs: 90_000,
        geminiApiKey,
      })
      logger.info('legal-writer.success', { durationMs: Date.now() - start })
      return { answer: out.content }
    } catch (err: any) {
      logger.warn('legal-writer.fallback', { err: err?.message })
      return { answer: buildSimpleAnswerFromSources(compiled) }
    }
  }

  // Sem material — usar mensagem padrão
  const hasInternal = compiled.sources.some((s) => s.type === 'internal-document' || s.type === 'norm' || s.type === 'legislation' || s.type === 'jurisprudence' || s.type === 'doctrine')
  const hasWeb = compiled.sources.some((s) => s.type === 'web' || s.type === 'intranet' || s.type === 'external-document')
  return { answer: buildFallbackMessage(hasInternal, hasWeb, input.allowExternal) }
}

/**
 * Fallback determinístico se o LLM falhar: lista as fontes sem análise.
 */
function buildSimpleAnswerFromSources(compiled: { sources: SourceRef[]; summary: string }): string {
  const list = compiled.sources.map((s, i) => {
    const link = s.url ? `[${s.title}](${s.url})` : s.title
    return `### ${i + 1}. ${s.title}
- **Tipo:** ${s.type}
- **Data:** ${s.date || 'sem data'}
- **Link:** ${link}
- **Trecho literal:**
"""
${s.snippet}
"""`
  }).join('\n\n')

  return `## Síntese

${compiled.summary}

## Material encontrado

${list}

---

⚠️ A análise jurídica detalhada não pôde ser gerada automaticamente. Os trechos acima são **transcrições literais** dos documentos encontrados. Para análise jurídica aprofundada, abra uma **consulta formal ao CAOCIPP**.`
}

/**
 * Mensagem de recusa para pedidos de criação/inventar jurisprudência.
 */
export function buildRefusalAnswer(): string {
  return REFUSAL_INVENT_MESSAGE
}

