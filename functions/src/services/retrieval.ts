/**
 * Serviço de retrieval do acervo.
 *
 * NOTA IMPORTANTE (2026-08): a busca VETORIAL (embeddings) esta' desativada
 * neste deploy. Como o acervo e' indexado com dados ESTRUTURADOS pela analise
 * do agente de acervo (classification + ementa + keyPoints), a busca e' feita
 * por CORRESPONDENCIA DE PALAVRAS-CHAVE/METADADOS sobre esses campos — sem
 * depender de embedding. Isso encontra e entrega os documentos existentes e
 * fornece ao LLM o conteudo (ementa/pontos) para discorrer sobre o assunto.
 */

import { getFirestore } from './firestore'

export interface RetrievedChunk {
  id: string
  docId: string
  text: string
  section: string
  metadata: Record<string, unknown>
  similarity: number
}

export interface RetrievalOptions {
  topK?: number
  minSimilarity?: number
  filterType?: string
  filterArea?: string
}

interface CorpusDocData {
  fileName?: string
  title?: string
  type?: string
  area?: string[]
  tags?: string[]
  status?: string
  classification?: {
    natureza?: string
    areaDireito?: string[]
    assuntos?: string[]
    tipoDocumento?: string
    contexto?: string[]
  } | null
  ementa?: {
    tipo?: string
    assunto?: string
    sintese?: string
    fundamentacao?: string
    conclusao?: string
    keywords?: string[]
    materias?: string[]
    topicos?: string[]
  } | null
  keyPoints?: {
    items?: Array<{ titulo?: string; descricao?: string; tags?: string[] }>
    pessoasEnvolvidas?: Array<{ nome?: string; cargo?: string; papel?: string; contexto?: string }>
    citacoesJuridicas?: Array<{ referencia?: string; interpretacao?: string }>
    relacionamentos?: Array<{ tipo?: string; grau?: string; pessoas?: string[]; descricao?: string }>
  } | null
  updatedAt?: string
  createdAt?: string
}

/**
 * Busca documentos relevantes no acervo por correspondencia de metadados.
 * Retorna "chunks" (1 por documento) com texto rico (ementa + pontos) para o LLM.
 */
export async function retrieveRelevantChunks(
  query: string,
  options: RetrievalOptions = {},
): Promise<RetrievedChunk[]> {
  const { topK = 8, minSimilarity = 0.55, filterType, filterArea } = options

  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return []

  const db = getFirestore()
  let snap: FirebaseFirestore.QuerySnapshot
  try {
    snap = await db.collection('corpus')
      .select('fileName', 'title', 'type', 'area', 'tags', 'status',
              'classification', 'ementa', 'keyPoints', 'updatedAt', 'createdAt')
      .limit(500)
      .get()
  } catch {
    return []
  }

  const scored: Array<{ id: string; data: CorpusDocData; score: number }> = []
  for (const doc of snap.docs) {
    const data = doc.data() as CorpusDocData
    if (filterType && data.type !== filterType) continue
    if (filterArea && !(Array.isArray(data.area) && data.area.includes(filterArea))) continue
    const score = scoreCorpusDoc(data, tokens, query.toLowerCase())
    if (score > 0) scored.push({ id: doc.id, data, score })
  }
  if (scored.length === 0) return []

  scored.sort((a, b) => b.score - a.score)
  const maxScore = scored[0].score || 1
  const top = scored.slice(0, topK)

  const chunks: RetrievedChunk[] = []
  for (const s of top) {
    // Normaliza score -> similaridade em [0.55, 0.97] (o melhor sempre passa o corte).
    const similarity = 0.55 + 0.42 * (s.score / maxScore)
    if (similarity < minSimilarity) continue
    chunks.push({
      id: `${s.id}-meta`,
      docId: s.id,
      text: buildChunkText(s.data),
      section: s.data.ementa?.assunto || s.data.title || s.data.fileName || s.id,
      metadata: {
        fileName: s.data.fileName,
        title: s.data.title,
        type: s.data.type,
        classification: s.data.classification,
        ementa: s.data.ementa,
      },
      similarity,
    })
  }
  return chunks
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Tokeniza a query em termos uteis (minusculo, >= 3 chars, sem duplicatas). */
function tokenizeQuery(query: string): string[] {
  const STOP = new Set([
    'sobre', 'para', 'como', 'qual', 'quais', 'onde', 'quando', 'tem', 'ha', 'há',
    'material', 'materia', 'documento', 'documentos', 'acervo', 'existe', 'existem',
    'procuro', 'preciso', 'gostaria', 'poderia', 'favor', 'pode', 'algum', 'alguma',
    'relacionado', 'relacionada', 'envolvendo', 'caso', 'casos', 'que', 'com', 'dos',
    'das', 'uma', 'uns', 'por', 'aos', 'nas', 'nos', 'sao', 'são',
  ])
  return Array.from(new Set(
    (query || '')
      .toLowerCase()
      .split(/[\s,;.:!?()"“”'’/]+/)
      .map(t => t.trim())
      .filter(t => t.length >= 3 && !STOP.has(t)),
  ))
}

/** Conta quantos tokens (distintos) aparecem como substring no texto. */
function countTextHits(textLower: string, tokens: string[]): number {
  if (!textLower) return 0
  let n = 0
  for (const t of tokens) if (textLower.includes(t)) n++
  return n
}

/** Conta quantos tokens casam com algum item do array. */
function countArrayHits(arr: string[] | undefined, tokens: string[]): number {
  if (!arr || arr.length === 0) return 0
  const lower = arr.map(a => a.toLowerCase())
  let n = 0
  for (const t of tokens) if (lower.some(a => a.includes(t))) n++
  return n
}

/**
 * Pontua um documento do acervo por relevancia a' query, na ordem:
 * classificacao -> pontos relevantes -> ementa -> metadados.
 */
function scoreCorpusDoc(data: CorpusDocData, tokens: string[], queryLower: string): number {
  let score = 0

  const c = data.classification
  if (c) {
    if (c.tipoDocumento && tokens.some(t => c.tipoDocumento!.toLowerCase().includes(t))) score += 3
    score += countArrayHits(c.areaDireito, tokens) * 2
    score += countArrayHits(c.assuntos, tokens) * 3
    score += countArrayHits(c.contexto, tokens) * 1
    if (c.natureza === 'decisorio' && /senten|acórd|jurisprud|decis/i.test(queryLower)) score += 1
    if (c.natureza === 'consultivo' && /parecer|consulta|orientaç/i.test(queryLower)) score += 1
  }

  const kp = data.keyPoints
  if (kp) {
    if (kp.items?.length) {
      const t = kp.items.map(i => `${i.titulo || ''} ${i.descricao || ''} ${(i.tags || []).join(' ')}`).join(' ').toLowerCase()
      score += countTextHits(t, tokens) * 3
    }
    if (kp.pessoasEnvolvidas?.length) {
      const t = kp.pessoasEnvolvidas.map(p => `${p.nome || ''} ${p.cargo || ''} ${p.papel || ''} ${p.contexto || ''}`).join(' ').toLowerCase()
      score += countTextHits(t, tokens) * 2
    }
    if (kp.relacionamentos?.length) {
      const t = kp.relacionamentos.map(r => `${r.tipo || ''} ${r.grau || ''} ${(r.pessoas || []).join(' ')} ${r.descricao || ''}`).join(' ').toLowerCase()
      score += countTextHits(t, tokens) * 2
    }
    if (kp.citacoesJuridicas?.length) {
      const t = kp.citacoesJuridicas.map(x => `${x.referencia || ''} ${x.interpretacao || ''}`).join(' ').toLowerCase()
      score += countTextHits(t, tokens) * 2
    }
  }

  const e = data.ementa
  if (e) {
    score += countArrayHits(e.keywords, tokens) * 1
    score += countArrayHits(e.materias, tokens) * 2
    score += countArrayHits(e.topicos, tokens) * 1
    if (e.assunto && tokens.some(t => e.assunto!.toLowerCase().includes(t))) score += 3
    if (e.sintese) score += countTextHits(e.sintese.toLowerCase(), tokens) * 2
    if (e.fundamentacao) score += countTextHits(e.fundamentacao.toLowerCase(), tokens) * 1
    if (e.conclusao) score += countTextHits(e.conclusao.toLowerCase(), tokens) * 2
  }

  const meta = `${data.title || ''} ${data.fileName || ''}`.toLowerCase()
  score += countTextHits(meta, tokens) * 2
  score += countArrayHits(data.tags, tokens) * 1
  score += countArrayHits(data.area, tokens) * 1

  return score
}

/** Monta o texto do "chunk" (resumo citavel) para o LLM discorrer sobre o assunto. */
function buildChunkText(data: CorpusDocData): string {
  const e = data.ementa
  const parts: string[] = []
  if (e?.assunto) parts.push(`Assunto: ${e.assunto}.`)
  if (e?.sintese) parts.push(`Síntese: ${e.sintese}`)
  if (e?.fundamentacao) parts.push(`Fundamentação: ${e.fundamentacao}`)
  if (e?.conclusao) parts.push(`Conclusão: ${e.conclusao}`)
  const pontos = (data.keyPoints?.items || [])
    .map(i => i.titulo)
    .filter(Boolean)
    .slice(0, 6)
  if (pontos.length) parts.push(`Pontos relevantes: ${pontos.join('; ')}.`)
  if (parts.length === 0) {
    return `${data.title || data.fileName || 'Documento do acervo'}${
      data.classification?.assuntos?.length ? ` — ${data.classification.assuntos.join(', ')}` : ''
    }`
  }
  return parts.join(' ').slice(0, 4000)
}
