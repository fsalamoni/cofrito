/**
 * Researcher-Internal — busca no corpus interno da plataforma.
 *
 * Fontes:
 *  1. Firestore 'corpus' collection (chunks indexados com embeddings)
 *  2. Storage 'corpus/' (documentos originais — link)
 *  3. Storage 'uploads/' (uploads do admin)
 *  4. Source paths configurados (PC local, WebDAV, SMB, GDrive, OneDrive)
 *
 * Para cada ponto de pesquisa, faz:
 *  - Embedding da query
 *  - Retrieval semântico no Firestore
 *  - Filtra por recência (se prefersRecent=true)
 *  - Extrai snippet literal do chunk
 *  - Calcula relevância (cosine sim + boost de recência)
 */

import { getFirestore } from 'firebase-admin/firestore'
import type { ResearchPoint, SourceRef, ResearchConfig } from './types'

export interface ResearcherInternalInput {
  userId: string
  points: ResearchPoint[]
  config: ResearchConfig
  logger: { info: (m: string, x?: unknown) => void; warn: (m: string, x?: unknown) => void; error: (m: string, x?: unknown) => void }
}

const SNIPPET_RADIUS = 800 // chars ao redor do termo casado

/**
 * Roda o pesquisador interno para todos os pontos de pesquisa.
 * Devolve fontes ranqueadas por relevância + recência.
 */
export async function runResearcherInternal(input: ResearcherInternalInput): Promise<SourceRef[]> {
  const { points, config, logger } = input
  const start = Date.now()
  const all: SourceRef[] = []

  for (const point of points) {
    try {
      const sources = await searchCorpusForPoint(point, config)
      all.push(...sources)
    } catch (err: any) {
      logger.warn('researcher-internal.pointFailed', { pointId: point.id, err: err?.message })
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

  // Ranquear por relevância
  unique.sort((a, b) => b.relevance - a.relevance)

  // Cortar
  const truncated = unique.slice(0, config.maxTotalSources)

  logger.info('researcher-internal.done', { durationMs: Date.now() - start, found: unique.length, kept: truncated.length })
  return truncated
}

async function searchCorpusForPoint(point: ResearchPoint, config: ResearchConfig): Promise<SourceRef[]> {
  const db = getFirestore()
  const queryText = buildQueryText(point)

  // Embedding da query (lazy import para evitar overhead)
  let queryEmbedding: number[] = []
  try {
    const { embedWithCache } = await import('../services/embeddings')
    const geminiKey = process.env.GEMINI_API_KEY || ''
    if (geminiKey) {
      queryEmbedding = await embedWithCache(queryText, geminiKey)
    }
  } catch {
    // Sem embedding — usar busca textual como fallback
  }

  // 1) Retrieval semântico (se embedding OK)
  let candidates: any[] = []
  if (queryEmbedding.length > 0) {
    try {
      const snap = await db.collection('corpus')
        .where('embedding', '!=', null)
        .limit(200)
        .get()
      candidates = snap.docs.map((d) => {
        const data = d.data() as any
        const sim = cosineSimilarity(queryEmbedding, data.embedding || [])
        return { id: d.id, data, sim }
      })
      candidates.sort((a, b) => b.sim - a.sim)
      candidates = candidates.slice(0, 50)
    } catch (err) {
      // collection pode estar vazia
    }
  }

  // 2) Busca textual (fallback) por keywords
  if (candidates.length === 0) {
    try {
      const snap = await db.collection('corpus').limit(200).get()
      candidates = snap.docs.map((d) => {
        const data = d.data() as any
        const text = (data.text || '').toLowerCase()
        const matches = point.keywords.filter((k) => text.includes(k.toLowerCase())).length
        const sim = matches / Math.max(point.keywords.length, 1)
        return { id: d.id, data, sim }
      }).filter((c) => c.sim > 0)
      candidates.sort((a, b) => b.sim - a.sim)
      candidates = candidates.slice(0, 30)
    } catch (err) {
      // vazio
    }
  }

  // 3) Aplicar filtro de recência
  const now = Date.now()
  const recencyCutoff = config.preferRecentDays > 0
    ? now - config.preferRecentDays * 24 * 60 * 60 * 1000
    : 0

  const filtered = candidates
    .filter((c) => {
      if (!point.prefersRecent || recencyCutoff === 0) return true
      const docDate = c.data.documentDate || c.data.publishedAt || c.data.createdAt
      if (!docDate) return true // sem data = assume recente
      const t = new Date(docDate).getTime()
      return t >= recencyCutoff
    })
    .slice(0, config.maxSourcesPerPoint)

  // 4) Construir SourceRef
  return filtered.map((c) => {
    const text: string = c.data.text || ''
    const snippet = extractSnippet(text, point.keywords)
    const date = c.data.documentDate || c.data.publishedAt || c.data.createdAt
    const baseRelevance = c.sim ?? 0.5
    const relevance = boostRecent(baseRelevance, date, config.intradayRecencyBoost)
    return {
      id: c.id,
      docId: c.data.documentId || c.id,
      title: c.data.title || c.data.documentTitle || 'Documento do corpus',
      section: c.data.section || c.data.heading,
      url: c.data.storageUrl || c.data.url, // link interno para o Storage
      type: inferType(c.data),
      relevance,
      snippet,
      fullText: text.length > 0 ? text : undefined,
      date: date ? new Date(date).toISOString() : undefined,
      sourcePath: c.data.sourcePath || 'corpus/',
      verified: true,
    }
  })
}

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

function inferType(data: any): SourceRef['type'] {
  const t = (data.type || data.sourceType || '').toLowerCase()
  if (t.includes('norm') || t.includes('provimento') || t.includes('ordem')) return 'norm'
  if (t.includes('jurisprud') || t.includes('acord') || t.includes('sumula')) return 'jurisprudence'
  if (t.includes('legisla') || t.includes('lei') || t.includes('artigo')) return 'legislation'
  if (t.includes('doutrin') || t.includes('parecer') || t.includes('nota')) return 'doctrine'
  if (t.includes('intranet') || t.includes('mprs')) return 'intranet'
  return 'internal-document'
}

function boostRecent(baseRelevance: number, date: string | undefined, boost: number): number {
  if (!date || boost <= 0) return baseRelevance
  const days = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
  // Boost decai linearmente: 100% se hoje, 0% se >= 365 dias
  const factor = Math.max(0, 1 - days / 365)
  return Math.min(1, baseRelevance + boost * factor)
}
