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
  /** URL publica (tokenizada) para abrir/baixar o arquivo original em nova aba. */
  downloadUrl?: string
  /** Pontuacao de relevancia acumulada (todos os campos). >0 = correspondencia real. */
  matchScore?: number
  /**
   * True quando o doc entrou como "mais proximo" (fallback), porque NENHUM doc
   * teve correspondencia direta com a busca. O writer deve fazer ressalvas.
   */
  isClosestMatch?: boolean
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
  /**
   * True quando NENHUM doc correspondeu diretamente e retornamos os "mais
   * proximos" (por recencia) como fallback. Sinaliza ao writer que deve fazer
   * as devidas ressalvas ("nao ha documento que se encaixe perfeitamente...").
   */
  usedClosestFallback: boolean
}

interface ScoredDoc {
  doc: CorpusDocMetadata
  score: number
  /** Quebra por camada (para stats/debug). */
  classificationScore: number
  keyPointScore: number
  ementaScore: number
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
  // CARGA: metadata leve de TODOS os docs (~2KB por doc, sem textContent)
  // ════════════════════════════════════════════════════════════════════
  log.info('corpus-search.load.start', { totalTokens: allQueryTokens.length, queryText: queryText.slice(0, 100) })

  let allDocs: CorpusDocMetadata[] = []
  try {
    const snap = await db.collection('corpus')
      .select('fileName', 'title', 'type', 'area', 'tags', 'status',
              'classification', 'ementa', 'keyPoints', 'createdAt', 'updatedAt')
      .limit(500)
      .get()
    allDocs = snap.docs.map(d => ({ id: d.id, ...(d.data() as Partial<CorpusDocMetadata>) }) as CorpusDocMetadata)
  } catch (err) {
    log.warn('corpus-search.load.failed', { err: (err as Error).message })
  }
  log.info('corpus-search.load.loaded', { count: allDocs.length })

  // ════════════════════════════════════════════════════════════════════
  // PONTUACAO UNIFICADA (segue a ordem que o usuario pediu):
  //   1) CLASSIFICACAO -> 2) PONTOS RELEVANTES -> 3) EMENTA -> +metadados
  // IMPORTANTE: NAO ha' porta rigida. Um doc com classificacao pobre ainda
  // pontua por keyPoints/ementa/titulo. Isso conserta o "chat nao encontra nada"
  // (docs com classificacao heuristica fraca eram descartados antes).
  // ════════════════════════════════════════════════════════════════════
  const scored: ScoredDoc[] = []
  let level1MatchedCount = 0
  let level2MatchedCount = 0
  let level3MatchedCount = 0

  for (const doc of allDocs) {
    // ── Camada 1: classificacao ──
    let classificationScore = 0
    const c = doc.classification
    if (c) {
      if (c.tipoDocumento && allQueryTokens.some(t => c.tipoDocumento!.toLowerCase().includes(t))) {
        classificationScore += 3
      }
      classificationScore += countArrayHits(c.areaDireito, allQueryTokens) * 2
      classificationScore += countArrayHits(c.assuntos, allQueryTokens) * 2
      classificationScore += countArrayHits(c.contexto, allQueryTokens) * 1
      if (c.natureza === 'decisorio' && /senten|acórd|jurisprud|decis/i.test(queryText)) classificationScore += 1
      if (c.natureza === 'consultivo' && /parecer|consulta|orientaç/i.test(queryText)) classificationScore += 1
    }

    // ── Camada 2: pontos relevantes ──
    let keyPointScore = 0
    const kp = doc.keyPoints
    if (kp) {
      if (kp.items && kp.items.length > 0) {
        const kpText = kp.items.map(i => `${i.titulo || ''} ${i.descricao || ''} ${(i.tags || []).join(' ')}`).join(' ').toLowerCase()
        keyPointScore += countTextHits(kpText, allQueryTokens) * 3
      }
      if (kp.pessoasEnvolvidas && kp.pessoasEnvolvidas.length > 0) {
        const pText = kp.pessoasEnvolvidas.map(p => `${p.nome || ''} ${p.cargo || ''} ${p.papel || ''} ${p.contexto || ''}`).join(' ').toLowerCase()
        keyPointScore += countTextHits(pText, allQueryTokens) * 2
      }
      if (kp.citacoesJuridicas && kp.citacoesJuridicas.length > 0) {
        const cText = kp.citacoesJuridicas.map(x => `${x.referencia || ''} ${x.interpretacao || ''}`).join(' ').toLowerCase()
        keyPointScore += countTextHits(cText, allQueryTokens) * 2
      }
      if (kp.relacionamentos && kp.relacionamentos.length > 0) {
        const rText = kp.relacionamentos.map(x => `${x.tipo || ''} ${x.grau || ''} ${(x.pessoas || []).join(' ')} ${x.descricao || ''}`).join(' ').toLowerCase()
        keyPointScore += countTextHits(rText, allQueryTokens) * 2
      }
    }

    // ── Camada 3: ementa ──
    let ementaScore = 0
    const e = doc.ementa
    if (e) {
      ementaScore += countArrayHits(e.keywords, allQueryTokens) * 1
      ementaScore += countArrayHits(e.materias, allQueryTokens) * 2
      ementaScore += countArrayHits(e.topicos, allQueryTokens) * 1
      if (e.assunto && allQueryTokens.some(t => e.assunto!.toLowerCase().includes(t))) ementaScore += 3
      if (e.sintese) ementaScore += countTextHits(e.sintese.toLowerCase(), allQueryTokens) * 2
      if (e.fundamentacao) ementaScore += countTextHits(e.fundamentacao.toLowerCase(), allQueryTokens) * 1
      if (e.conclusao) ementaScore += countTextHits(e.conclusao.toLowerCase(), allQueryTokens) * 2
    }

    // ── Metadados soltos (titulo, fileName, tags, area, type) ──
    let metaScore = 0
    const titleText = `${doc.title || ''} ${doc.fileName || ''}`.toLowerCase()
    metaScore += countTextHits(titleText, allQueryTokens) * 2
    metaScore += countArrayHits(doc.tags, allQueryTokens) * 1
    metaScore += countArrayHits(doc.area, allQueryTokens) * 1
    if (doc.type && allQueryTokens.some(t => doc.type!.toLowerCase().includes(t))) metaScore += 1

    const total = classificationScore + keyPointScore + ementaScore + metaScore
    if (classificationScore > 0) level1MatchedCount++
    if (keyPointScore > 0) level2MatchedCount++
    if (ementaScore > 0) level3MatchedCount++

    if (total > 0) {
      scored.push({ doc, score: total, classificationScore, keyPointScore, ementaScore })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  log.info('corpus-search.scored', {
    matched: scored.length,
    total: allDocs.length,
    byClassification: level1MatchedCount,
    byKeyPoints: level2MatchedCount,
    byEmenta: level3MatchedCount,
  })

  // ════════════════════════════════════════════════════════════════════
  // SELECAO: melhores correspondencias OU "mais proximos" (fallback)
  // "Se nao houver documento que se encaixe perfeitamente, vai buscar os mais
  //  proximos e fazer as devidas consideracoes." -> nunca retorna vazio quando
  //  ha' acervo; se ninguem pontua, entrega os mais RECENTES como aproximacao.
  // ════════════════════════════════════════════════════════════════════
  let usedClosestFallback = false
  let finalists: Array<{ doc: CorpusDocMetadata; score: number }> = scored.slice(0, maxResults)

  if (finalists.length === 0 && allDocs.length > 0) {
    usedClosestFallback = true
    const byRecency = [...allDocs].sort((a, b) => recencyMs(b) - recencyMs(a))
    finalists = byRecency.slice(0, maxResults).map(doc => ({ doc, score: 0 }))
    log.info('corpus-search.closestFallback', { returned: finalists.length })
  }

  // ════════════════════════════════════════════════════════════════════
  // CARGA FINAL: textContent apenas dos finalistas
  // ════════════════════════════════════════════════════════════════════
  const finalDocs: CorpusDocFull[] = []
  const { getPublicDownloadUrl } = await import('../services/storage-download')
  for (const f of finalists) {
    try {
      const docSnap = await db.doc(`corpus/${f.doc.id}`).get()
      if (!docSnap.exists) continue
      const data = docSnap.data() || {}
      const storagePath = data.storagePath as string | undefined
      // URL de download real (abre/baixa o PDF em nova aba). Reaproveita a cache
      // no doc; se ausente, gera pelo token do Storage e grava para reuso.
      let downloadUrl = (data.downloadUrl as string) || ''
      if (!downloadUrl && storagePath) {
        const generated = await getPublicDownloadUrl(storagePath)
        if (generated) {
          downloadUrl = generated
          try { await db.doc(`corpus/${f.doc.id}`).set({ downloadUrl }, { merge: true }) } catch { /* ignora */ }
        }
      }
      finalDocs.push({
        ...f.doc,
        textContent: data.textContent as string | undefined,
        textOriginal: ((data.textOriginal as string) || '').slice(0, 80_000),
        storagePath,
        downloadUrl: downloadUrl || undefined,
        matchScore: f.score,
        isClosestMatch: usedClosestFallback,
      })
    } catch (err) {
      log.warn('corpus-search.loadFinalFailed', { docId: f.doc.id, err: (err as Error).message })
    }
  }

  log.info('corpus-search.done', { count: finalDocs.length, usedClosestFallback })

  return {
    docs: finalDocs,
    stats: {
      level1: { loaded: allDocs.length, matched: level1MatchedCount },
      level2: { loaded: allDocs.length, matched: level2MatchedCount },
      level3: { loaded: allDocs.length, matched: level3MatchedCount },
      level4: { loaded: finalists.length, matched: finalDocs.length },
    },
    totalMs: Date.now() - start,
    usedClosestFallback,
  }
}

/** Conta quantos tokens (distintos) aparecem como substring no texto. */
function countTextHits(textLower: string, tokens: string[]): number {
  if (!textLower) return 0
  let n = 0
  for (const t of tokens) if (textLower.includes(t)) n++
  return n
}

/** Conta quantos tokens (distintos) casam com algum item do array. */
function countArrayHits(arr: string[] | undefined, tokens: string[]): number {
  if (!arr || arr.length === 0) return 0
  const lower = arr.map(a => a.toLowerCase())
  let n = 0
  for (const t of tokens) if (lower.some(a => a.includes(t))) n++
  return n
}

/** Millis de recencia (updatedAt || createdAt), 0 se ausente. */
function recencyMs(doc: CorpusDocMetadata): number {
  const v = doc.updatedAt || doc.createdAt
  if (!v) return 0
  const ms = new Date(v).getTime()
  return Number.isFinite(ms) ? ms : 0
}
