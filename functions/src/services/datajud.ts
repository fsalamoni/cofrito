/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DataJud API Client — pesquisa de jurisprudência nos tribunais brasileiros.
 *
 * A API Pública do DataJud (CNJ) usa Elasticsearch e tem chave pública.
 * Endpoint: POST https://api-publica.datajud.cnj.jus.br/api_publica_{tribunal}/_search
 * Auth: Authorization: APIKey <chave pública>
 *
 * @see https://datajud-wiki.cnj.jus.br/api-publica/
 */

const DATAJUD_BASE_URL = 'https://api-publica.datajud.cnj.jus.br'

/**
 * Chave pública de API do DataJud (compartilhada por todos os consumidores).
 * Documentada oficialmente pelo CNJ. Pode ser substituída por chave própria
 * se o CNJ emitir uma para o usuário.
 */
export const DEFAULT_DATAJUD_API_KEY = 'cHJhZ2lhdGl2YS1qdXN0aWNhLXNlY3JldA=='

/** Tribunais disponíveis no DataJud público. STF não tem índice público (apenas STF direto). */
export const DATAJUD_TRIBUNAIS = {
  superiores: [
    { alias: 'stj',  name: 'STJ — Superior Tribunal de Justiça' },
    { alias: 'tst',  name: 'TST — Tribunal Superior do Trabalho' },
    { alias: 'tse',  name: 'TSE — Tribunal Superior Eleitoral' },
  ],
  federal: [
    { alias: 'trf1', name: 'TRF1 — TRF da 1ª Região' },
    { alias: 'trf2', name: 'TRF2 — TRF da 2ª Região' },
    { alias: 'trf3', name: 'TRF3 — TRF da 3ª Região' },
    { alias: 'trf4', name: 'TRF4 — TRF da 4ª Região (inclui RS)' },
    { alias: 'trf5', name: 'TRF5 — TRF da 5ª Região' },
    { alias: 'trf6', name: 'TRF6 — TRF da 6ª Região' },
  ],
  estadual: [
    { alias: 'tjrs', name: 'TJRS — Tribunal de Justiça do RS' },
    { alias: 'tjsp', name: 'TJSP — Tribunal de Justiça de SP' },
    { alias: 'tjrj', name: 'TJRJ — Tribunal de Justiça do RJ' },
    { alias: 'tjmg', name: 'TJMG — Tribunal de Justiça de MG' },
    { alias: 'tjpr', name: 'TJPR — Tribunal de Justiça do PR' },
    { alias: 'tjsc', name: 'TJSC — Tribunal de Justiça de SC' },
    { alias: 'tjba', name: 'TJBA — Tribunal de Justiça da BA' },
    { alias: 'tjpe', name: 'TJPE — Tribunal de Justiça de PE' },
    { alias: 'tjdft', name: 'TJDFT — Tribunal de Justiça do DF' },
  ],
} as const

export type DataJudTribunalAlias =
  | 'stj' | 'tst' | 'tse'
  | 'trf1' | 'trf2' | 'trf3' | 'trf4' | 'trf5' | 'trf6'
  | 'tjrs' | 'tjsp' | 'tjrj' | 'tjmg' | 'tjpr' | 'tjsc' | 'tjba' | 'tjpe' | 'tjdft'

export const ALL_TRIBUNAL_ALIASES: DataJudTribunalAlias[] = [
  'stj', 'tst', 'tse',
  'trf1', 'trf2', 'trf3', 'trf4', 'trf5', 'trf6',
  'tjrs', 'tjsp', 'tjrj', 'tjmg', 'tjpr', 'tjsc', 'tjba', 'tjpe', 'tjdft',
]

export interface DataJudSearchOptions {
  tribunals?: DataJudTribunalAlias[]  // default: STJ + TRF4 + TJRS
  maxPerTribunal?: number              // default: 5
  dateFrom?: string                    // ISO date (YYYY-MM-DD)
  dateTo?: string                      // ISO date
  apiKey?: string                      // override default
  signal?: AbortSignal
}

export interface DataJudHit {
  tribunal: string
  tribunalName: string
  id: string
  classe?: string
  numero?: string
  data?: string                        // ISO date
  orgao?: string
  ementa?: string
  texto?: string
  url?: string
  score: number
}

export interface DataJudSearchResult {
  hits: DataJudHit[]
  totalTribunais: number
  tribunaisComResultado: number
  tribunaisComErro: Array<{ tribunal: string; error: string }>
  latencyMs: number
}

const DATAJUD_TIMEOUT_MS = 25_000

/**
 * Faz uma busca no DataJud em vários tribunais em paralelo.
 */
export async function searchDataJud(
  query: string,
  options: DataJudSearchOptions = {},
): Promise<DataJudSearchResult> {
  const start = Date.now()
  const tribunals = options.tribunals ?? (['stj', 'trf4', 'tjrs'] as DataJudTribunalAlias[])
  const maxPerTribunal = options.maxPerTribunal ?? 5
  const apiKey = options.apiKey || DEFAULT_DATAJUD_API_KEY

  const allHits: DataJudHit[] = []
  const tribunaisComErro: DataJudSearchResult['tribunaisComErro'] = []
  let tribunaisComResultado = 0

  // Buscar em paralelo (4 por vez)
  const BATCH = 4
  for (let i = 0; i < tribunals.length; i += BATCH) {
    const batch = tribunals.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map((t) => searchOneTribunal(t, query, maxPerTribunal, options.dateFrom, options.dateTo, apiKey, options.signal)),
    )
    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      if (r.status === 'fulfilled' && r.value.length > 0) {
        allHits.push(...r.value)
        tribunaisComResultado++
      } else if (r.status === 'rejected') {
        tribunaisComErro.push({ tribunal: batch[j], error: String(r.reason?.message || r.reason) })
      }
    }
  }

  // Ordenar por score desc
  allHits.sort((a, b) => b.score - a.score)

  return {
    hits: allHits,
    totalTribunais: tribunals.length,
    tribunaisComResultado,
    tribunaisComErro,
    latencyMs: Date.now() - start,
  }
}

async function searchOneTribunal(
  tribunal: DataJudTribunalAlias,
  query: string,
  max: number,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<DataJudHit[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DATAJUD_TIMEOUT_MS)
  // Encadeia signals
  if (signal) {
    signal.addEventListener('abort', () => controller.abort())
  }

  const url = `${DATAJUD_BASE_URL}/api_publica_${tribunal}/_search`
  const tribunalName = findTribunalName(tribunal)

  // Body Elasticsearch: match_query em ementa+texto+classe+assunto, recência boost
  const must: any[] = [
    {
      multi_match: {
        query,
        fields: ['ementa^3', 'texto^1', 'classe^1.5', 'assunto^2'],
        type: 'best_fields',
        operator: 'or',
        fuzziness: 'AUTO',
      },
    },
  ]
  if (dateFrom || dateTo) {
    const range: any = {}
    if (dateFrom) range.gte = dateFrom
    if (dateTo) range.lte = dateTo
    must.push({ range: { data: range } })
  }

  const body = {
    size: max,
    query: { bool: { must } },
    sort: [{ _score: { order: 'desc' } }, { data: { order: 'desc' } }],
    _source: ['id', 'classe', 'numero', 'data', 'orgao', 'ementa', 'texto', 'url', 'assunto'],
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `APIKey ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) {
      throw new Error(`DataJud ${tribunal} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }
    const data: any = await res.json()
    const hits: any[] = data.hits?.hits ?? []
    return hits.map((h) => ({
      tribunal,
      tribunalName,
      id: h._id || h._source?.id || '',
      classe: h._source?.classe,
      numero: h._source?.numero,
      data: h._source?.data,
      orgao: h._source?.orgao,
      ementa: h._source?.ementa,
      texto: h._source?.texto?.slice(0, 4000),
      url: h._source?.url,
      score: h._score ?? 0,
    }))
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

function findTribunalName(alias: string): string {
  for (const group of Object.values(DATAJUD_TRIBUNAIS)) {
    const found = (group as readonly { alias: string; name: string }[]).find((t) => t.alias === alias)
    if (found) return found.name
  }
  return alias.toUpperCase()
}
