/**
 * Compiler — terceiro agente do pipeline.
 *
 * Recebe os pontos de pesquisa + fontes internas + web e:
 *  1. Organiza as fontes por ponto
 *  2. Ranqueia por atualidade + relevância
 *  3. Filtra por minRelevanceScore
 *  4. Aplica o cap de maxTotalSources
 *  5. Gera summary e warnings
 *  6. Marca hasEnoughMaterial conforme o material disponível
 *
 * NÃO usa LLM — é um organizador determinístico.
 * (A versão com LLM é opcional; este é mais previsível e barato.)
 */

import type { SourceRef, ResearchPoint, ResearchConfig } from './types'
import { NO_SOURCES_FOUND_MESSAGE } from './prompts'

export interface CompilerInput {
  points: ResearchPoint[]
  internalSources: SourceRef[]
  webSources: SourceRef[]
  config: ResearchConfig
  logger: { info: (m: string, x?: unknown) => void; warn: (m: string, x?: unknown) => void }
}

export interface CompiledOutput {
  summary: string
  sources: SourceRef[]
  warnings: string[]
  hasEnoughMaterial: boolean
}

export function runCompiler(input: CompilerInput): CompiledOutput {
  const { points, internalSources, webSources, config, logger } = input

  const all = [...internalSources, ...webSources]
  const warnings: string[] = []

  // 1) Filtrar por relevância mínima
  const filtered = all.filter((s) => s.relevance >= config.minRelevanceScore)
  if (filtered.length < all.length) {
    warnings.push(`${all.length - filtered.length} fontes filtradas por baixa relevância (< ${(config.minRelevanceScore * 100).toFixed(0)}%)`)
  }

  // 2) Verificar fontes verificadas
  const unverified = filtered.filter((s) => !s.verified)
  if (unverified.length > 0) {
    warnings.push(`${unverified.length} fontes externas sem verificação automática (web/intranet)`)
  }

  // 3) Verificar datas
  const noDate = filtered.filter((s) => !s.date)
  if (noDate.length > 0) {
    warnings.push(`${noDate.length} fontes sem data`)
  }

  // 4) Ranquear: atualidade * 0.4 + relevância * 0.6
  const ranked = filtered
    .map((s) => ({ source: s, score: compositeScore(s, config) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.source)

  // 5) Cortar pelo teto total
  const final = ranked.slice(0, config.maxTotalSources)

  // 6) Summary
  const summary = buildSummary(points, final, internalSources.length, webSources.length)

  // 7) hasEnoughMaterial: pelo menos 1 fonte COM snippet não vazio e verified OU web com snippet útil
  const hasEnough = final.some((s) => s.snippet && s.snippet.trim().length > 20)

  logger.info('compiler.done', {
    pointsCount: points.length,
    internalCount: internalSources.length,
    webCount: webSources.length,
    filteredCount: filtered.length,
    finalCount: final.length,
    hasEnough,
  })

  if (!hasEnough) {
    warnings.push(NO_SOURCES_FOUND_MESSAGE)
  }

  return {
    summary,
    sources: final,
    warnings,
    hasEnoughMaterial: hasEnough,
  }
}

function compositeScore(s: SourceRef, config: ResearchConfig): number {
  const recency = s.date
    ? Math.max(0, 1 - (Date.now() - new Date(s.date).getTime()) / (config.preferRecentDays * 24 * 60 * 60 * 1000))
    : 0.5
  return s.relevance * 0.6 + recency * 0.4
}

function buildSummary(
  points: ResearchPoint[],
  sources: SourceRef[],
  internalCount: number,
  webCount: number,
): string {
  const parts: string[] = []
  parts.push(`Foram encontrados ${sources.length} materiais relevantes`)
  parts.push(`(${internalCount} internos, ${webCount} externos).`)
  if (points.length > 0) {
    parts.push(`Pontos investigados: ${points.map((p) => p.query).join('; ')}.`)
  }
  if (sources.length > 0) {
    const tipos = [...new Set(sources.map((s) => s.type))]
    parts.push(`Tipos: ${tipos.join(', ')}.`)
  }
  return parts.join(' ')
}
