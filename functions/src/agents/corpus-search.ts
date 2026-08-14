/**
 * Corpus Search — busca no acervo em 4 niveis progressivos.
 *
 * OTIMIZACAO CRITICA: para nao carregar o textContent (que pode ter 50KB+)
 * ate saber que o documento e' RELEVANTE. Segue o pipeline:
 *
 *   NIVEL 1: classification (natureza, tipoDocumento, areaDireito, assuntos)
 *            - Filtra por overlap de palavras-chave
 *            - Custo: 1 query Firestore (apenas metadados, ~2KB por doc)
 *   NIVEL 2: keyPoints.items + ementa.keywords
 *            - Filtra pelos pontos relevantes citados
 *            - Custo: ja' vem no mesmo doc, so' le do cache
 *   NIVEL 3: ementa (assunto, sintese, fundamentacao, conclusao)
 *            - Le apenas dos que passaram nos filtros 1+2
 *            - Custo: 0 (ja' leu no nivel 1)
 *   NIVEL 4: textContent (texto integral)
 *            - Le APENAS dos documentos finalistas
 *            - Custo: N leituras grandes (ate maxResults)
 *
 * RESULTADO: reduz drasticamente o trafego Firestore em acervos grandes
 * (com 100+ docs, evita carregar 100 x 50KB = 5MB so para filtrar).
 *
 * Os documentos sao do schema corpus/{docId} (Fase 1+, ref #99).
 */
import { getFirestore } from '../services/firestore'
import type { ResearchPoint } from './types'

export interface CorpusDocMetadata {
  id: string
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
    tipoDocumento?: string
    numero?: string
    data?: string
    autor?: string
    destinatario?: string
    assunto?: string
    sintese?: string
    fundamentacao?: string
    areas?: string[]
    topicos?: string[]
    conclusao?: string
    keywords?: string[]
    materias?: string[]
  } | null
  keyPoints?: {
    items?: Array<{ categoria?: string; titulo?: string; descricao?: string; tags?: string[] }>
    pessoasEnvolvidas?: Array<{ nome?: string; cargo?: string; papel?: string; contexto?: string }>
    relacionamentos?: Array<{ tipo?: string; grau?: string; pessoas?: string[]; descricao?: string }>
    citacoesJuridicas?: Array<{ tipo?: string; referencia?: string; interpretacao?: string }>
    reusableContent?: string
  } | null
  createdAt?: string
  updatedAt?: string
}

export interface CorpusDocFull extends CorpusDocMetadata {
  textContent?: string
  textOriginal?: string
  storagePath?: string
}

export interface FourLevelSearchInput {
  /** Ponto de pesquisa (com keywords, query, etc) */
  point: ResearchPoint
  /** Maximo de documentos a retornar (default 10) */
  maxResults?: number
  /** Logger opcional */
  logger?: { info: (m: string, x?: unknown) => void; warn: (m: string, x?: unknown) => void; error: (m: string, x?: unknown) => void }
}

export interface FourLevelSearchResult {
  /** Documentos finalistas, com textContent carregado */
  docs: CorpusDocFull[]
  /** Estatisticas por nivel (para debug) */
  stats: {
    level1: { loaded: number; matched: number }
    level2: { loaded: number; matched: number }
    level3: { loaded: number; matched: number }
    level4: { loaded: number; matched: number }
  }
  /** Tempo total (ms) */
  totalMs: number
}

interface ScoredDoc {
  doc: CorpusDocMetadata
  score: number
}

/**
 * Busca documentos do acervo em 4 niveis progressivos.
 *
 * Retorna ate `maxResults` documentos finais, ja com textContent carregado.
 */
export async function searchCorpusFourLevel(input: FourLevelSearchInput): Promise<FourLevelSearchResult> {
  const { point, maxResults = 10 } = input
  const log = input.logger || { info: () => {}, warn: () => {}, error: () => {} }
  const start = Date.now()
  const db = getFirestore()

  // Normalizar query keywords
  const queryKeywords = point.keywords
    .map(k => k.toLowerCase().trim())
    .filter(k => k.length >= 3)
  const queryText = (point.query || '').toLowerCase()
  const queryTokens = (queryText + ' ' + queryKeywords.join(' '))
    .split(/[\s,;.]+/)
    .map(t => t.toLowerCase().trim())
    .filter(t => t.length >= 3)
  const allQueryTokens = Array.from(new Set([...queryTokens, ...queryKeywords]))

  // ════════════════════════════════════════════════════════════════════
  // NIVEL 1: CLASSIFICATION (metadata leve: ~2KB por doc)
  // ════════════════════════════════════════════════════════════════════
  log.info('corpus-search.level1.start', { totalTokens: allQueryTokens.length, queryText: queryText.slice(0, 100) })

  let allDocs: CorpusDocMetadata[] = []
  try {
    const snap = await db.collection('corpus')
      .select('fileName', 'title', 'type', 'area', 'tags', 'status',
              'classification', 'ementa', 'keyPoints', 'createdAt', 'updatedAt')
      .limit(500)
      .get()
    allDocs = snap.docs.map(d => ({ id: d.id, ...(d.data() as Partial<CorpusDocMetadata>) }) as CorpusDocMetadata)
  } catch (err) {
    log.warn('corpus-search.level1.loadFailed', { err: (err as Error).message })
  }
  log.info('corpus-search.level1.loaded', { count: allDocs.length })

  // Filtrar por classification
  const l1Scored: ScoredDoc[] = []
  for (const doc of allDocs) {
    const c = doc.classification
    if (!c) continue
    let score = 0
    if (c.tipoDocumento) {
      const tipoLower = c.tipoDocumento.toLowerCase()
      if (allQueryTokens.some(t => tipoLower.includes(t))) score += 3
    }
    if (c.areaDireito && c.areaDireito.length > 0) {
      const areasLower = c.areaDireito.map(a => a.toLowerCase())
      const areaMatches = allQueryTokens.filter(t => areasLower.some(a => a.includes(t))).length
      score += areaMatches * 2
    }
    if (c.assuntos && c.assuntos.length > 0) {
      const assuntosLower = c.assuntos.map(a => a.toLowerCase())
      const assuntoMatches = allQueryTokens.filter(t => assuntosLower.some(a => a.includes(t))).length
      score += assuntoMatches * 2
    }
    if (c.natureza === 'decisorio' && /senten|acórd|jurisprud|decis/i.test(queryText)) score += 1
    if (c.natureza === 'consultivo' && /parecer|consulta|orientaç/i.test(queryText)) score += 1
    if (score > 0) l1Scored.push({ doc, score })
  }
  l1Scored.sort((a, b) => b.score - a.score)
  const level1Matched = l1Scored.map(s => s.doc)

  log.info('corpus-search.level1.matched', { matched: level1Matched.length, total: allDocs.length })

  if (level1Matched.length === 0) {
    return {
      docs: [],
      stats: {
        level1: { loaded: allDocs.length, matched: 0 },
        level2: { loaded: 0, matched: 0 },
        level3: { loaded: 0, matched: 0 },
        level4: { loaded: 0, matched: 0 },
      },
      totalMs: Date.now() - start,
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // NIVEL 2: KEYPOINTS + keywords da ementa (ja' no metadata)
  // ════════════════════════════════════════════════════════════════════
  const l2Scored: ScoredDoc[] = []
  const l1ById = new Map(l1Scored.map(s => [s.doc.id, s.score]))
  for (const doc of level1Matched) {
    let score = l1ById.get(doc.id) || 0
    // L2a: keyPoints.items (formato novo - objetos com titulo/descricao)
    if (doc.keyPoints?.items && doc.keyPoints.items.length > 0) {
      const kpText = doc.keyPoints.items
        .map(i => `${i.titulo || ''} ${i.descricao || ''} ${(i.tags || []).join(' ')}`)
        .join(' ')
        .toLowerCase()
      const kpMatches = allQueryTokens.filter(t => kpText.includes(t)).length
      score += kpMatches * 3
    }
    // L2b: keyPoints.pessoasEnvolvidas
    if (doc.keyPoints?.pessoasEnvolvidas && doc.keyPoints.pessoasEnvolvidas.length > 0) {
      const pessoasText = doc.keyPoints.pessoasEnvolvidas
        .map(p => `${p.nome || ''} ${p.cargo || ''} ${p.papel || ''} ${p.contexto || ''}`)
        .join(' ')
        .toLowerCase()
      const pMatches = allQueryTokens.filter(t => pessoasText.includes(t)).length
      score += pMatches * 2
    }
    // L2c: keyPoints.citacoesJuridicas
    if (doc.keyPoints?.citacoesJuridicas && doc.keyPoints.citacoesJuridicas.length > 0) {
      const citText = doc.keyPoints.citacoesJuridicas
        .map(c => `${c.referencia || ''} ${c.interpretacao || ''}`)
        .join(' ')
        .toLowerCase()
      const cMatches = allQueryTokens.filter(t => citText.includes(t)).length
      score += cMatches * 2
    }
    // L2d: ementa.keywords + ementa.materias
    if (doc.ementa?.keywords && doc.ementa.keywords.length > 0) {
      const kwLower = doc.ementa.keywords.map(k => k.toLowerCase())
      const kwMatches = allQueryTokens.filter(t => kwLower.includes(t) || kwLower.some(k => k.includes(t))).length
      score += kwMatches
    }
    if (doc.ementa?.materias && doc.ementa.materias.length > 0) {
      const matLower = doc.ementa.materias.map(m => m.toLowerCase())
      const matMatches = allQueryTokens.filter(t => matLower.includes(t) || matLower.some(m => m.includes(t))).length
      score += matMatches * 2
    }
    if (score > 0) l2Scored.push({ doc, score })
  }
  l2Scored.sort((a, b) => b.score - a.score)
  const level2Matched = l2Scored.map(s => s.doc)

  log.info('corpus-search.level2.matched', { matched: level2Matched.length })

  if (level2Matched.length === 0) {
    return {
      docs: [],
      stats: {
        level1: { loaded: allDocs.length, matched: level1Matched.length },
        level2: { loaded: level1Matched.length, matched: 0 },
        level3: { loaded: 0, matched: 0 },
        level4: { loaded: 0, matched: 0 },
      },
      totalMs: Date.now() - start,
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // NIVEL 3: EMENTA (sintese, fundamentacao, conclusao)
  // ════════════════════════════════════════════════════════════════════
  const l3Scored: ScoredDoc[] = []
  const l2ById = new Map(l2Scored.map(s => [s.doc.id, s.score]))
  for (const doc of level2Matched) {
    let score = l2ById.get(doc.id) || 0
    const e = doc.ementa
    if (!e) {
      l3Scored.push({ doc, score })
      continue
    }
    let sementeHits = 0
    if (e.sintese) {
      const sLower = e.sintese.toLowerCase()
      sementeHits += allQueryTokens.filter(t => sLower.includes(t)).length
    }
    if (e.fundamentacao) {
      const fLower = e.fundamentacao.toLowerCase()
      sementeHits += allQueryTokens.filter(t => fLower.includes(t)).length
    }
    if (e.conclusao) {
      const cLower = e.conclusao.toLowerCase()
      sementeHits += allQueryTokens.filter(t => cLower.includes(t)).length
    }
    score += sementeHits * 2
    if (score > 0) l3Scored.push({ doc, score })
  }
  l3Scored.sort((a, b) => b.score - a.score)
  const level3Matched = l3Scored.map(s => s.doc)

  log.info('corpus-search.level3.matched', { matched: level3Matched.length })

  // ════════════════════════════════════════════════════════════════════
  // NIVEL 4: TEXTCONTENT (apenas dos top-N finalistas)
  // ════════════════════════════════════════════════════════════════════
  const finalists = level3Matched.slice(0, maxResults)
  const finalDocs: CorpusDocFull[] = []
  for (const doc of finalists) {
    try {
      const docSnap = await db.doc(`corpus/${doc.id}`).get()
      if (!docSnap.exists) continue
      const data = docSnap.data() || {}
      finalDocs.push({
        ...doc,
        textContent: data.textContent as string | undefined,
        textOriginal: ((data.textOriginal as string) || '').slice(0, 80_000),
        storagePath: data.storagePath as string | undefined,
      })
    } catch (err) {
      log.warn('corpus-search.level4.loadFailed', { docId: doc.id, err: (err as Error).message })
    }
  }

  log.info('corpus-search.level4.loaded', { count: finalDocs.length })

  return {
    docs: finalDocs,
    stats: {
      level1: { loaded: allDocs.length, matched: level1Matched.length },
      level2: { loaded: level1Matched.length, matched: level2Matched.length },
      level3: { loaded: level2Matched.length, matched: level3Matched.length },
      level4: { loaded: finalists.length, matched: finalDocs.length },
    },
    totalMs: Date.now() - start,
  }
}
