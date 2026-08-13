/**
 * Researcher-Internal — busca no corpus interno da plataforma em 3 camadas.
 *
 * FONTES (V1):
 *  1. Firestore 'corpus' collection (chunks indexados com embeddings + metadados estruturados)
 *  2. Storage 'corpus/uploaded/' (documentos do acervo V1)
 *
 * 3 CAMADAS DE BUSCA (refatorado na Fase 2c):
 *  1. KEYWORD PRE-FILTER: usa `searchKeywords` do chunk (consolidado da classification+
 *     ementa+keyPoints) para filtrar candidatos rapidamente. 0 LLM calls.
 *  2. EMBEDDING/SIMILARITY: se embedding existir, ranqueia por cosine sim. 0 LLM calls.
 *  3. LLM UNIFICADO: 1 unica chamada LLM que faz a busca semantica final + ranqueamento
 *     contextual em uma unica passada. (em vez de 2-3 chamadas separadas)
 *
 * GANHOS vs implementacao anterior:
 *  - pre-filtro por keywords estruturadas (custo 0)
 *  - 1 chamada LLM (em vez de 0-2) - apenas quando ha ambiguidade nos top-K
 *  - texto do chunk enviado 1 vez so para analise final
 *  - ranqueamento mais coerente (uma cadeia de raciocinio)
 *
 * Para cada ponto de pesquisa, faz:
 *  - Keyword pre-filter usando searchKeywords do chunk
 *  - Embedding match (se existir)
 *  - Se top-K candidatos ainda estiverem ambiguos, LLM unificado escolhe os melhores
 *  - Extrai snippet literal do chunk
 *  - Calcula relevancia (0-1)
 */

import { getFirestore } from '../services/firestore'
import type { ResearchPoint, SourceRef, ResearchConfig } from './types'
import { generateWithProvider, type LLMConfigLike } from '../services/llm-providers'

export interface ResearcherInternalInput {
  userId: string
  points: ResearchPoint[]
  config: ResearchConfig
  logger: { info: (m: string, x?: unknown) => void; warn: (m: string, x?: unknown) => void; error: (m: string, x?: unknown) => void }
  /**
   * LLM config JÁ CARREGADO (do configToUse global).
   * Se nao fornecido, nao faz camada 3 (LLM).
   */
  llmConfig?: LLMConfigLike
  /**
   * Config do pipeline de pesquisa (Fase 2c/2e).
   * - enableLlmRerank: se false, pula Camada 3 (default: true)
   * - rerankAmbiguityThreshold: limiar de ambiguidade (default: 0.15)
   */
  pipelineConfig?: { enableLlmRerank?: boolean; rerankAmbiguityThreshold?: number }
}

const SNIPPET_RADIUS = 800 // chars ao redor do termo casado
const DEFAULT_AMBIGUITY_THRESHOLD = 0.15  // overridable via pipelineConfig.rerankAmbiguityThreshold
const TOP_K_FOR_LLM = 10  // numero de candidatos que vao pro LLM unificado

/**
 * Roda o pesquisador interno para todos os pontos de pesquisa.
 * Devolve fontes ranqueadas por relevancia + recencia.
 */
export async function runResearcherInternal(input: ResearcherInternalInput): Promise<SourceRef[]> {
  const { points, config, logger, llmConfig } = input
  const start = Date.now()
  const all: SourceRef[] = []

  for (const point of points) {
    try {
      const sources = await searchCorpusForPoint(point, config, llmConfig, input.pipelineConfig, logger)
      all.push(...sources)
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err)
      logger.warn('researcher-internal.pointFailed', { pointId: point.id, err: msg })
    }
  }

  // Deduplicar por docId+chunkId
  const dedup = new Map<string, SourceRef>()
  for (const s of all) {
    const key = `${s.docId}::${s.id}`
    const existing = dedup.get(key)
    if (!existing || s.relevance > existing.relevance) dedup.set(key, s)
  }
  const unique = [...dedup.values()]

  // Ranquear por relevancia
  unique.sort((a, b) => b.relevance - a.relevance)

  // Cortar
  const truncated = unique.slice(0, config.maxTotalSources)

  logger.info('researcher-internal.done', {
    durationMs: Date.now() - start,
    found: unique.length,
    kept: truncated.length,
    llmUsed: !!llmConfig,
  })
  return truncated
}

async function searchCorpusForPoint(
  point: ResearchPoint,
  config: ResearchConfig,
  llmConfig: LLMConfigLike | undefined,
  pipelineConfig: { enableLlmRerank?: boolean; rerankAmbiguityThreshold?: number } | undefined,
  log: { info: (m: string, x?: unknown) => void; warn: (m: string, x?: unknown) => void },
): Promise<SourceRef[]> {
  const db = getFirestore()
  const queryText = buildQueryText(point)
  const queryKeywords = point.keywords.map(k => k.toLowerCase().trim()).filter(k => k.length >= 3)

  // ════════════════════════════════════════════════════════════════════
  // CAMADA 1: KEYWORD PRE-FILTER
  // ════════════════════════════════════════════════════════════════════
  // Carrega TODOS os chunks do corpus e filtra por overlap entre
  // (a) searchKeywords do chunk (consolidado da classification+ementa+keyPoints)
  // (b) keywords da query
  // Custo: 1 query Firestore + filtro em memoria. Sem LLM, sem embedding.
  let allChunks: Array<{ id: string; data: Record<string, unknown>; keywordScore: number }> = []
  try {
    const snap = await db.collection('corpus').limit(500).get()
    allChunks = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>
      // chunks estao em subcollection corpus/{docId}/chunks
      // mas o documento pai tem searchKeywords agregado
      const docSearchKeywords = ((data.searchKeywords as string[]) || []).map(k => k.toLowerCase())
      // calcular overlap de keywords
      const matches = queryKeywords.filter(qk => docSearchKeywords.includes(qk)).length
      const keywordScore = queryKeywords.length > 0 ? matches / queryKeywords.length : 0
      return { id: d.id, data, keywordScore }
    }).filter(c => c.keywordScore > 0)  // elimina quem nao tem nada a ver
    log.info('researcher-internal.layer1', { candidates: allChunks.length })
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err)
    log.warn('researcher-internal.layer1Failed', { err: msg })
  }

  if (allChunks.length === 0) {
    // Sem matches por keyword: pode ser corpus vazio ou keywords muito especificas
    // Fallback: retorna vazio (researcher-web pode ser chamado depois)
    return []
  }

  // ════════════════════════════════════════════════════════════════════
  // CAMADA 2: EMBEDDING SIMILARITY
  // ════════════════════════════════════════════════════════════════════
  // Para cada doc, busca os chunks mais similares e ranqueia
  let queryEmbedding: number[] = []
  // Sempre tenta usar semantic search (sem custo extra se nao tiver GEMINI_API_KEY)
  try {
    const { embedWithCache } = await import('../services/embeddings')
    const geminiKey = process.env.GEMINI_API_KEY || ''
    if (geminiKey) {
      queryEmbedding = await embedWithCache(queryText, geminiKey)
    }
  } catch {
    // Sem embedding - continua com keyword score
  }

  // Para cada doc, busca os top-3 chunks mais similares
  const candidates: Array<{
    docId: string
    docData: Record<string, unknown>
    chunkId: string
    chunkText: string
    chunkData: Record<string, unknown>
    keywordScore: number
    embeddingScore: number
    combinedScore: number
  }> = []

  for (const doc of allChunks) {
    try {
      const chunksSnap = await db.doc(`corpus/${doc.id}/chunks`).collection('chunks').get().catch(() => null)
      if (!chunksSnap) continue
      const chunkHits = chunksSnap.docs.map((chunkDoc) => {
        const chunkData = chunkDoc.data() as Record<string, unknown>
        const chunkEmbedding = (chunkData.embedding as number[]) || []
        const sim = queryEmbedding.length > 0 && chunkEmbedding.length > 0
          ? cosineSimilarity(queryEmbedding, chunkEmbedding)
          : 0
        return {
          docId: doc.id,
          docData: doc.data,
          chunkId: chunkDoc.id,
          chunkText: (chunkData.text as string) || '',
          chunkData,
          keywordScore: doc.keywordScore,
          embeddingScore: sim,
          // Score combinado: 60% embedding, 40% keyword (se existir embedding)
          combinedScore: queryEmbedding.length > 0
            ? 0.6 * sim + 0.4 * doc.keywordScore
            : doc.keywordScore,
        }
      })
      // Pega top-3 chunks deste doc
      chunkHits.sort((a, b) => b.combinedScore - a.combinedScore)
      candidates.push(...chunkHits.slice(0, 3))
    } catch {
      // doc sem chunks
    }
  }

  // Top 30 candidatos por score combinado
  candidates.sort((a, b) => b.combinedScore - a.combinedScore)
  const topCandidates = candidates.slice(0, 30)

  // ════════════════════════════════════════════════════════════════════
  // CAMADA 3: LLM UNIFICADO (se ambiguo e ha LLM)
  // ════════════════════════════════════════════════════════════════════
  // Se o LLM esta disponivel E ha ambiguidade nos top-K, usa 1 chamada
  // para re-ranquear com base no contexto semantico real
  const enableLlmRerank = pipelineConfig?.enableLlmRerank !== false
  const ambiguityThreshold = pipelineConfig?.rerankAmbiguityThreshold ?? DEFAULT_AMBIGUITY_THRESHOLD
  let finalScores: Map<string, number> = new Map()
  if (enableLlmRerank && llmConfig && topCandidates.length > 1) {
    const top1 = topCandidates[0].combinedScore
    const topK = topCandidates[Math.min(TOP_K_FOR_LLM - 1, topCandidates.length - 1)].combinedScore
    const isAmbiguous = (top1 - topK) < ambiguityThreshold
    if (isAmbiguous) {
      try {
        finalScores = await unifiedRerankWithLLM({
          query: queryText,
          point,
          candidates: topCandidates.slice(0, TOP_K_FOR_LLM),
          llmConfig,
        })
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? String(err)
        log.warn('researcher-internal.llmRerankFailed', { err: msg })
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // CONSTRUIR SourceRef
  // ════════════════════════════════════════════════════════════════════
  const recencyCutoff = config.preferRecentDays > 0
    ? Date.now() - config.preferRecentDays * 24 * 60 * 60 * 1000
    : 0

  const sources: SourceRef[] = []
  for (const c of topCandidates) {
    // Filtrar por recencia
    if (point.prefersRecent && recencyCutoff > 0) {
      const docDate = (c.docData.documentDate as string) || (c.docData.publishedAt as string) || (c.docData.createdAt as string)
      if (docDate) {
        const t = new Date(docDate).getTime()
        if (t < recencyCutoff) continue
      }
    }
    // Score final
    const llmScore = finalScores.get(c.chunkId)
    const relevance = llmScore !== undefined
      ? llmScore  // LLM definiu
      : c.combinedScore  // combinado embedding+keyword
    const snippet = extractSnippet(c.chunkText, point.keywords)
    const date = (c.docData.documentDate as string) || (c.docData.publishedAt as string) || (c.docData.createdAt as string)
    sources.push({
      id: c.chunkId,
      docId: c.docId,
      title: (c.docData.title as string) || (c.docData.documentTitle as string) || 'Documento do corpus',
      section: c.chunkData.section as string,
      url: (c.docData.storageUrl as string) || (c.docData.url as string),
      type: inferType(c.docData),
      relevance: Math.min(1, Math.max(0, relevance)),
      snippet,
      fullText: c.chunkText.length > 0 ? c.chunkText : undefined,
      date: date ? new Date(date).toISOString() : undefined,
      sourcePath: (c.docData.sourcePath as string) || 'corpus/',
      verified: true,
    })
    if (sources.length >= config.maxSourcesPerPoint) break
  }

  return sources
}

// ════════════════════════════════════════════════════════════════════
// LLM UNIFICADO: 1 chamada que re-ranqueia os top-K com contexto semantico
// ════════════════════════════════════════════════════════════════════

interface RerankInput {
  query: string
  point: ResearchPoint
  candidates: Array<{
    chunkId: string
    chunkText: string
    combinedScore: number
  }>
  llmConfig: LLMConfigLike
}

const RERANK_SYSTEM = [
  'Você é um ranqueador semantico de trechos juridicos.',
  'Receba uma QUERY e uma lista de CANDIDATOS (trechos de documentos).',
  'Retorne um JSON com a relevancia real de cada candidato (0.0 a 1.0).',
  '',
  'Considere:',
  '  - Pertinencia semantica (nao so lexical)',
  '  - Contexto juridico: o trecho responde a query?',
  '  - Profundidade: o trecho tem fundamentacao ou so tangencia?',
  '',
  'FORMATO DE SAIDA (APENAS JSON):',
  '{',
  '  "scores": [',
  '    {"id": "chunk-0", "relevance": 0.92},',
  '    {"id": "chunk-1", "relevance": 0.45}',
  '  ]',
  '}',
  '',
  'REGRAS:',
  '  - Sempre retorne TODOS os candidatos na mesma ordem.',
  '  - Use 0.0-0.3 para trechos tangenciais, 0.4-0.7 para relevantes, 0.8-1.0 para respostas diretas.',
].join('\n')

async function unifiedRerankWithLLM(input: RerankInput): Promise<Map<string, number>> {
  const candidateList = input.candidates.map((c, i) => ({
    id: c.chunkId,
    index: i,
    text: c.chunkText.slice(0, 600),  // limite por candidato
    initialScore: c.combinedScore,
  }))

  const userPrompt = [
    `QUERY: ${input.query}`,
    ``,
    `KEYWORDS: ${input.point.keywords.join(', ')}`,
    ``,
    `CANDIDATOS (${candidateList.length}):`,
    JSON.stringify(candidateList, null, 2),
    ``,
    'Retorne o JSON com a relevancia real de cada candidato.',
  ].join('\n')

  const result = await generateWithProvider({
    systemPrompt: RERANK_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
    config: { ...input.llmConfig, maxTokens: 800, temperature: 0.1 },
  })

  const parsed = tryParseRerankJson(result.content, input.candidates.length)
  const map = new Map<string, number>()
  if (parsed) {
    parsed.forEach((relevance, i) => {
      if (i < input.candidates.length) {
        map.set(input.candidates[i].chunkId, relevance)
      }
    })
  }
  return map
}

function tryParseRerankJson(raw: string, expectedCount: number): number[] | null {
  if (!raw) return null
  let jsonStr = raw.trim()
  const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) jsonStr = fenced[1].trim()
  const firstBrace = jsonStr.indexOf('{')
  const lastBrace = jsonStr.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace < 0) return null
  jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
  try {
    const parsed = JSON.parse(jsonStr) as { scores?: Array<{ id?: string; relevance?: number }> }
    if (!Array.isArray(parsed.scores)) return null
    return parsed.scores.map(s => {
      const r = typeof s.relevance === 'number' ? s.relevance : 0
      return Math.min(1, Math.max(0, r))
    }).slice(0, expectedCount)
  } catch {
    return null
  }
}

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

function buildQueryText(point: ResearchPoint): string {
  return `${point.query} ${point.keywords.join(' ')}`.trim()
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Extrai um trecho literal centrado no primeiro termo casado.
 */
function extractSnippet(text: string, keywords: string[]): string {
  if (!text) return ''
  if (keywords.length === 0) return text.slice(0, SNIPPET_RADIUS)

  const lower = text.toLowerCase()
  for (const k of keywords) {
    const idx = lower.indexOf(k.toLowerCase())
    if (idx >= 0) {
      const start = Math.max(0, idx - SNIPPET_RADIUS / 2)
      const end = Math.min(text.length, idx + SNIPPET_RADIUS / 2)
      let snippet = text.slice(start, end)
      if (start > 0) snippet = '...' + snippet
      if (end < text.length) snippet = snippet + '...'
      return snippet
    }
  }
  return text.slice(0, SNIPPET_RADIUS) + (text.length > SNIPPET_RADIUS ? '...' : '')
}

function inferType(data: Record<string, unknown>): SourceRef['type'] {
  const t = ((data.type as string) || (data.sourceType as string) || '').toLowerCase()
  if (t.includes('norm') || t.includes('provimento') || t.includes('ordem')) return 'norm'
  if (t.includes('jurisprud') || t.includes('acord') || t.includes('sumula')) return 'jurisprudence'
  if (t.includes('legisla') || t.includes('lei') || t.includes('artigo')) return 'legislation'
  if (t.includes('doutrin') || t.includes('parecer') || t.includes('nota')) return 'doctrine'
  if (t.includes('intranet') || t.includes('mprs')) return 'intranet'
  return 'internal-document'
}
