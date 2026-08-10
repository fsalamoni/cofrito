/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-imports */
/**
 * Researcher-Web — busca em fontes externas.
 *
 * Providers suportados:
 *  - Tavily     (https://tavily.com) — API key
 *  - Serper     (https://serper.dev) — Google search
 *  - Brave      (https://brave.com/search/api) — search
 *  - Perplexity (https://docs.perplexity.ai) — sonar
 *  - DataJud    (https://datajud-wiki.cnj.jus.br) — jurisprudência (chave pública)
 *  - MPRS Intranet (auth customizado)
 *
 * A busca web SÓ é executada se:
 *  - allowExternal = true (ativado pelo user no chat)
 *  - webSearchConfig.enabled = true (admin master ligou)
 *  - (apiKey definida) — exceto DataJud que tem chave pública
 *  - requiresWebSearch = true (decisão do orchestrator)
 */

import type { ResearchPoint, SourceRef, WebSearchConfig, IntranetConfig } from './types'
import { searchDataJud, type DataJudTribunalAlias } from '../services/datajud'

export interface ResearcherWebInput {
  points: ResearchPoint[]
  webConfig: WebSearchConfig
  intranetConfig: IntranetConfig
  allowExternal: boolean
  logger: { info: (m: string, x?: unknown) => void; warn: (m: string, x?: unknown) => void; error: (m: string, x?: unknown) => void }
}

export async function runResearcherWeb(input: ResearcherWebInput): Promise<SourceRef[]> {
  const { points, webConfig, intranetConfig, allowExternal, logger } = input

  // Guards
  if (!allowExternal) {
    logger.info('researcher-web.skipped', { reason: 'allowExternal=false' })
    return []
  }
  if (!webConfig.enabled) {
    logger.info('researcher-web.skipped', { reason: 'webConfig.enabled=false' })
    return []
  }
  if (points.length === 0) {
    logger.info('researcher-web.skipped', { reason: 'no points' })
    return []
  }

  const all: SourceRef[] = []
  for (const point of points) {
    try {
      const sources = await searchWebForPoint(point, webConfig, intranetConfig)
      all.push(...sources)
    } catch (err: any) {
      logger.warn('researcher-web.pointFailed', { pointId: point.id, err: err?.message })
    }
  }

  // Deduplicar por URL
  const dedup = new Map<string, SourceRef>()
  for (const s of all) {
    if (s.url) dedup.set(s.url, s)
  }
  const unique = [...dedup.values()]
  unique.sort((a, b) => b.relevance - a.relevance)

  logger.info('researcher-web.done', { found: unique.length })
  return unique.slice(0, 12)
}

async function searchWebForPoint(
  point: ResearchPoint,
  webConfig: WebSearchConfig,
  intranetConfig: IntranetConfig,
): Promise<SourceRef[]> {
  const query = `${point.query} ${point.keywords.join(' ')}`.trim()
  switch (webConfig.provider) {
    case 'tavily':
      return searchTavily(query, webConfig, point)
    case 'serper':
      return searchSerper(query, webConfig, point)
    case 'brave':
      return searchBrave(query, webConfig, point)
    case 'perplexity':
      return searchPerplexity(query, webConfig, point)
    case 'datajud':
      return searchDataJudProvider(query, webConfig, point)
    case 'mprs-intranet':
      return searchMprsIntranet(query, webConfig, intranetConfig, point)
    default:
      return []
  }
}

// ── Tavily ────────────────────────────────────────────────────────────────

async function searchTavily(query: string, config: WebSearchConfig, point: ResearchPoint): Promise<SourceRef[]> {
  if (!config.apiKey) return []
  const body: Record<string, unknown> = {
    api_key: config.apiKey,
    query,
    max_results: config.maxResultsPerQuery,
    include_raw_content: true,
    search_depth: 'advanced',
  }
  if (config.restrictDomains?.length) body.include_domains = config.restrictDomains
  if (point.prefersRecent && config.recencyDays) {
    body.days = config.recencyDays
  }
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Tavily ${res.status}`)
  const json: any = await res.json()
  return (json.results || []).map((r: any, i: number) => ({
    id: `tavily-${i}`,
    docId: r.url || `tavily-${i}`,
    title: r.title || 'Resultado Tavily',
    url: r.url,
    type: inferTypeFromUrl(r.url),
    relevance: r.score ?? 0.7,
    snippet: r.content || r.raw_content?.slice(0, 800) || '',
    fullText: r.raw_content,
    date: r.published_date,
    sourcePath: 'web/tavily',
    verified: false, // web precisa ser verificada pelo legal-writer
  }))
}

// ── Serper (Google) ───────────────────────────────────────────────────────

async function searchSerper(query: string, config: WebSearchConfig, _point: ResearchPoint): Promise<SourceRef[]> {
  if (!config.apiKey) return []
  const params = new URLSearchParams({ q: query, api_key: config.apiKey, gl: 'br', hl: 'pt-BR' })
  if (config.restrictDomains?.length) params.set('domains', config.restrictDomains.join(','))
  const res = await fetch(`https://google.serper.dev/search?${params.toString()}`)
  if (!res.ok) throw new Error(`Serper ${res.status}`)
  const json: any = await res.json()
  const organic = json.organic || []
  return organic.slice(0, config.maxResultsPerQuery).map((r: any, i: number) => ({
    id: `serper-${i}`,
    docId: r.link || `serper-${i}`,
    title: r.title || 'Resultado Google',
    url: r.link,
    type: inferTypeFromUrl(r.link),
    relevance: r.position ? Math.max(0, 1 - r.position / 10) : 0.5,
    snippet: r.snippet || '',
    date: r.date,
    sourcePath: 'web/serper',
    verified: false,
  }))
}

// ── Brave ─────────────────────────────────────────────────────────────────

async function searchBrave(query: string, config: WebSearchConfig, _point: ResearchPoint): Promise<SourceRef[]> {
  if (!config.apiKey) return []
  const params = new URLSearchParams({ q: query, count: String(config.maxResultsPerQuery) })
  if (config.restrictDomains?.length) params.set('site_filter', config.restrictDomains.join(','))
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
    headers: {
      'X-Subscription-Token': config.apiKey,
      'Accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Brave ${res.status}`)
  const json: any = await res.json()
  const results = json.web?.results || []
  return results.map((r: any, i: number) => ({
    id: `brave-${i}`,
    docId: r.url || `brave-${i}`,
    title: r.title || 'Resultado Brave',
    url: r.url,
    type: inferTypeFromUrl(r.url),
    relevance: 0.7,
    snippet: r.description || '',
    date: r.age,
    sourcePath: 'web/brave',
    verified: false,
  }))
}

// ── Perplexity ────────────────────────────────────────────────────────────

async function searchPerplexity(query: string, config: WebSearchConfig, _point: ResearchPoint): Promise<SourceRef[]> {
  if (!config.apiKey) return []
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: query }],
      return_citations: true,
    }),
  })
  if (!res.ok) throw new Error(`Perplexity ${res.status}`)
  const json: any = await res.json()
  const citations = json.citations || []
  const content = json.choices?.[0]?.message?.content || ''
  return citations.slice(0, config.maxResultsPerQuery).map((url: string, i: number) => ({
    id: `perplexity-${i}`,
    docId: url,
    title: `Citação ${i + 1} (Perplexity)`,
    url,
    type: inferTypeFromUrl(url),
    relevance: 0.85,
    snippet: content.slice(i * 200, (i + 1) * 200) || content.slice(0, 300),
    sourcePath: 'web/perplexity',
    verified: false,
  }))
}

// ── MPRS Intranet ─────────────────────────────────────────────────────────

async function searchMprsIntranet(
  query: string,
  _webConfig: WebSearchConfig,
  intranet: IntranetConfig,
  _point: ResearchPoint,
): Promise<SourceRef[]> {
  if (!intranet.enabled || !intranet.baseUrl) return []

  // Autenticação (simplificada — armazena cookie/session)
  // Em produção: usar cookie persistente com refresh
  const headers: Record<string, string> = {
    'User-Agent': 'Cofrito-Researcher/1.0',
    ...(intranet.customHeaders || {}),
  }

  // Se tiver cookie salvo, enviar
  if (intranet.cookieName && intranet.cookieDomain) {
    headers['Cookie'] = `${intranet.cookieName}=${intranet.password || ''}`
  }

  // Tentar login (form-based)
  if (intranet.authMethod === 'form' && intranet.username && intranet.password && intranet.loginPath) {
    try {
      const loginRes = await fetch(`${intranet.baseUrl}${intranet.loginPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
        body: new URLSearchParams({
          username: intranet.username,
          password: intranet.password,
        }).toString(),
        redirect: 'manual',
      })
      const setCookie = loginRes.headers.get('set-cookie')
      if (setCookie) {
        const m = setCookie.match(/([^=]+)=([^;]+)/)
        if (m) headers['Cookie'] = `${m[1]}=${m[2]}`
      }
    } catch {
      // Ignorar — tentar busca mesmo assim
    }
  }

  // Buscar
  const searchUrl = intranet.searchPath
    ? `${intranet.baseUrl}${intranet.searchPath.replace('{query}', encodeURIComponent(query))}`
    : `${intranet.baseUrl}/pesquisa?q=${encodeURIComponent(query)}`

  const res = await fetch(searchUrl, { headers })
  if (!res.ok) throw new Error(`MPRS Intranet ${res.status}`)
  const html = await res.text()

  // Parse simples — extrair links e snippets
  return parseIntranetHtml(html, intranet, _point)
}

function parseIntranetHtml(html: string, intranet: IntranetConfig, _point: ResearchPoint): SourceRef[] {
  const results: SourceRef[] = []
  // Regex simples: <a href="..." class="...">title</a> ... <p>snippet</p>
  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  let i = 0
  while ((m = linkRe.exec(html)) !== null) {
    const url = m[1]
    const title = m[2].trim()
    if (!url || url.startsWith('#') || seen.has(url)) continue
    if (!url.startsWith('http') && intranet.documentPathPrefix) {
      seen.add(url)
      const absUrl = `${intranet.baseUrl}${url}`
      results.push({
        id: `intranet-${i++}`,
        docId: absUrl,
        title: title || 'Documento da intranet',
        url: absUrl,
        type: 'intranet',
        relevance: 0.7,
        snippet: extractMetaDescription(html, m.index) || title,
        sourcePath: 'intranet',
        verified: false,
      })
    } else if (url.includes(intranet.baseUrl)) {
      seen.add(url)
      results.push({
        id: `intranet-${i++}`,
        docId: url,
        title: title || 'Documento da intranet',
        url,
        type: 'intranet',
        relevance: 0.7,
        snippet: extractMetaDescription(html, m.index) || title,
        sourcePath: 'intranet',
        verified: false,
      })
    }
    if (results.length >= 10) break
  }
  return results
}

function extractMetaDescription(html: string, pos: number): string {
  const window = html.slice(pos, pos + 600)
  const m = window.match(/<p[^>]*>([^<]{30,400})<\/p>/i)
  return m ? m[1].trim() : ''
}

// ── DataJud (CNJ — jurisprudência) ────────────────────────────────────────

async function searchDataJudProvider(
  query: string,
  config: WebSearchConfig,
  _point: ResearchPoint,
): Promise<SourceRef[]> {
  // DataJud tem chave pública do CNJ — não exige configuração do admin.
  const tribunals = (config.datajudTribunals && config.datajudTribunals.length > 0
    ? config.datajudTribunals
    : ['stj', 'trf4', 'tjrs']) as DataJudTribunalAlias[]

  const result = await searchDataJud(query, {
    tribunals,
    maxPerTribunal: config.maxResultsPerQuery,
    apiKey: config.apiKey, // pode ser vazio (usa default público)
  })

  return result.hits.map((h) => {
    // Normalizar score Elasticsearch (0-∞) para 0-1
    const relevance = Math.min(1, h.score / 10)
    const snippet = h.ementa
      ? h.ementa.slice(0, 600)
      : h.texto
        ? h.texto.slice(0, 600)
        : ''
    return {
      id: `datajud-${h.tribunal}-${h.id}`,
      docId: `datajud-${h.tribunal}-${h.numero || h.id}`,
      title: h.ementa
        ? h.ementa.slice(0, 120).replace(/\s+/g, ' ').trim()
        : `${h.tribunalName} — ${h.classe || ''} ${h.numero || ''}`.trim(),
      section: h.classe,
      url: h.url,
      type: 'jurisprudence' as const,
      relevance,
      snippet,
      fullText: h.texto,
      date: h.data,
      sourcePath: `datajud/${h.tribunal}`,
      verified: true,
      tribunal: h.tribunal,
      tribunalName: h.tribunalName,
      numero: h.numero,
    }
  })
}

function inferTypeFromUrl(url: string): SourceRef['type'] {
  if (!url) return 'web'
  const u = url.toLowerCase()
  if (u.includes('planalto.gov.br') || u.includes('legislacao') || u.includes('lei')) return 'legislation'
  if (u.includes('stj.jus.br') || u.includes('stf.jus.br') || u.includes('tj.rs.gov.br') || u.includes('jurispruden')) return 'jurisprudence'
  if (u.includes('mp.rs.gov.br') || u.includes('intranet')) return 'intranet'
  if (u.endsWith('.pdf') || u.includes('documento')) return 'external-document'
  return 'web'
}
