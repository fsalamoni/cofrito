/**
 * Document → Structured JSON converter.
 *
 * Schema v2 (intelligent reconstruction):
 * ```json
 * {
 *   "v": 2,
 *   "meta": { "filename", "format", "pages?", "paragraphs", "charsOriginal", "charsStored", "compressionRatio", "headersRemoved", "paragraphsJoined" },
 *   "paragraphs": [ { "i": number, "text": string, "type"?: string } ],
 *   "fullText": "...",
 *   "sections": [ { "title": string, "start": number, "end": number } ]
 * }
 * ```
 *
 * Algoritmo de reconstrucao inteligente:
 * 1. Normalizar whitespace
 * 2. Detectar e REMOVER headers/footers (linhas que se repetem em >= 3 paginas)
 * 3. Detectar paragrafos QUEBRADOS entre paginas (linha que termina sem pontuacao
 *    + proxima linha comecando com letra minuscula)
 * 4. Juntar paragrafos quebrados em um so
 * 5. Detectar secoes (titulos em CAIXA ALTA, "Art. N", "TITULO N", etc)
 * 6. Indexar paragrafos com i (indice), text, type
 */
import { logger } from 'firebase-functions'

// ── Types ──────────────────────────────────────────────────────────────

export interface StructuredDocumentJsonV2 {
  v: 2
  meta: StructuredDocumentMetaV2
  /** Lista de paragrafos com indice, texto e tipo opcional. */
  paragraphs: Array<{ i: number; text: string; type?: string }>
  /** Whitespace-normalized full text (otimizado para LLM/busca). */
  fullText: string
  /** Secoes detectadas (titulo + range de paragrafos). */
  sections: Array<{ title: string; start: number; end: number }>
}

export interface StructuredDocumentMetaV2 {
  filename: string
  /** Source format: pdf, docx, txt, md, html, json, csv, xml, rtf, yaml, log */
  format: string
  pages?: number
  paragraphs: number
  charsOriginal: number
  charsStored: number
  /** Ratio: 1 - charsStored/charsOriginal (0..1) */
  compressionRatio: number
  /** Linhas removidas por serem headers/footers repetidos */
  headersRemoved: number
  /** Pares de paragrafos juntados por quebra de pagina */
  paragraphsJoined: number
}

// ── Constants ─────────────────────────────────────────────────────────

const MIN_PARAGRAPH_CHARS = 12
const MAX_PARAGRAPHS = 5000
const MAX_SECTIONS = 200
/** Uma linha que aparece em >= 3 paginas eh considerada header/footer. */
const HEADER_FOOTER_THRESHOLD = 3
/** Frases que terminam sem pontuacao sao consideradas continuacao. */
const CONTINUATION_ENDINGS = /[,;:\-–—]$/
const SECTION_HEADING_PATTERNS = [
  /^(\d+[.)]\s+.+)/,                    // "1. Introdução"
  /^(CAP[ÍI]TULO|TITULO|T[ÍI]TULO)\s+\w+/i,
  /^(SE[ÇC][ÃA]O)\s+\w+/i,
  /^(ARTIGO|ART\.?)\s*\d+/i,
  /^(PARECER|DESPACHO|SENTEN[ÇC]A|AC[ÓO]RD[ÃA]O|DECIS[ÃA]O|MANIFESTA[ÇC][ÃA]O|INFORMA[ÇC][ÃA]O|NOTA\s+T[ÉE]CNICA|RELAT[ÓO]RIO|DEN[ÚU]NCIA|RECOMENDA[ÇC][ÃA]O|PORTARIA|RESOLU[ÇC][ÃA]O)\b/i,
  /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s\d.,;:()\-–—]{4,80}$/,  // ALL CAPS (min 5, max 80)
]
const CERTIFICATION_PATTERNS = [
  /documento\s+eletr[ôo]nico\s+assinado/i,
  /assinado\s+digitalmente/i,
  /c[óo]digo\s+para\s+verifica[çc][ãa]o/i,
  /conforme\s+mp\s+n?[ºo]?\s*2\.?200-?2/i,
  /procurador[ia]?-?geral\s+do\s+estado/i,
]
const SIGNATURE_PATTERNS = [
  /^\(?assinado\s+digitalmente\)?/i,
  /^[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/,  // Nome proprio simples
  /^Dr[ª.]?\.?\s+/,
]

// ── Core conversion ────────────────────────────────────────────────────

/**
 * Converte texto bruto em JSON estruturado v2 (reconstrucao inteligente).
 */
export function textToStructuredJsonV2(
  text: string,
  filename: string,
  pageCount?: number,
): StructuredDocumentJsonV2 {
  const charsOriginal = text.length
  const format = detectFormat(filename)

  // 1. Detectar e remover headers/footers repetidos (independe de \f)
  const { cleanedText, headersRemoved } = removeHeadersFooters(text, pageCount)

  // 2. Detectar e juntar paragrafos quebrados dentro de blocos
  const { paragraphs: blockParagraphs, paragraphsJoined: joinedInBlock } = joinBrokenParagraphs(cleanedText)

  // 2b. Reunir paragrafos partidos por QUEBRA DE PAGINA (o rodape removido deixou
  //     as duas metades em blocos separados). Junta quando a metade anterior nao
  //     termina em pontuacao final e a seguinte comeca em minuscula/continuacao.
  const { paragraphs: rawParagraphs, joined: joinedAcrossPages } = mergeAcrossPageBreaks(blockParagraphs)
  const paragraphsJoined = joinedInBlock + joinedAcrossPages

  // 3. Detectar secoes
  const { paragraphs: finalParagraphs, sections } = detectSections(rawParagraphs)

  // 4. Construir fullText
  const fullText = buildFullText(finalParagraphs)

  const meta: StructuredDocumentMetaV2 = {
    filename,
    format,
    paragraphs: finalParagraphs.length,
    charsOriginal,
    charsStored: fullText.length,
    compressionRatio: charsOriginal > 0
      ? Math.round((1 - fullText.length / charsOriginal) * 1000) / 1000
      : 0,
    headersRemoved,
    paragraphsJoined,
  }
  if (pageCount !== undefined && pageCount > 0) {
    meta.pages = pageCount
  }

  return {
    v: 2,
    meta,
    paragraphs: finalParagraphs,
    fullText,
    sections,
  }
}

// Backward compat
export type StructuredDocumentJson = StructuredDocumentJsonV2
export type StructuredDocumentMeta = StructuredDocumentMetaV2
export type StructuredDocumentSection = StructuredDocumentJsonV2['sections'][number]

/**
 * Serializa para string JSON (para gravar no Firestore).
 */
export function serializeStructuredJson(doc: StructuredDocumentJsonV2): string {
  return JSON.stringify(doc)
}

/**
 * Tenta parsear textContent como StructuredDocumentJson v2.
 * Aceita v1 tambem (retrocompat).
 */
export function parseStructuredJson(textContent: string): StructuredDocumentJsonV2 | null {
  if (!textContent || textContent.length < 10) return null
  const trimmed = textContent.trimStart()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object') {
      if (parsed.v === 2 && Array.isArray(parsed.paragraphs)) {
        return parsed as StructuredDocumentJsonV2
      }
      if (parsed.v === 1 && typeof parsed.fullText === 'string') {
        // Converter v1 para v2
        const v1 = parsed as { meta: Record<string, unknown>; sections: unknown[]; fullText: string }
        const text = v1.fullText
        const { paragraphs } = joinBrokenParagraphs(text)
        return {
          v: 2,
          meta: { ...v1.meta, paragraphsJoined: 0, headersRemoved: 0 } as StructuredDocumentMetaV2,
          paragraphs: paragraphs.map((p, i) => ({ i, text: p })),
          fullText: text,
          sections: [],
        }
      }
    }
  } catch {
    // nao eh JSON
  }
  return null
}

/**
 * Resolve textContent para texto puro (transparente: JSON v1/v2 OU legado).
 */
export function resolveTextContent(textContent: string): string {
  const structured = parseStructuredJson(textContent)
  if (structured) return structured.fullText
  return textContent
}

/**
 * Retorna metadata do JSON estruturado, ou null se for legado.
 */
export function getStructuredMeta(textContent: string): StructuredDocumentMetaV2 | null {
  const structured = parseStructuredJson(textContent)
  return structured?.meta ?? null
}

/**
 * Retorna sections do JSON estruturado, ou [] se for legado.
 */
export function getStructuredSections(textContent: string): StructuredDocumentSection[] {
  const structured = parseStructuredJson(textContent)
  return structured?.sections ?? []
}

// ── Backward compat com v1 ───────────────────────────────────────────

// Manter textToStructuredJson apontando para V2 (comportamento melhorado)
export function textToStructuredJson(
  text: string,
  filename: string,
  pageCount?: number,
): StructuredDocumentJsonV2 {
  return textToStructuredJsonV2(text, filename, pageCount)
}

// ── Helpers ────────────────────────────────────────────────────────────

function detectFormat(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || ''
  const map: Record<string, string> = {
    pdf: 'pdf', doc: 'docx', docx: 'docx', txt: 'txt', md: 'md', markdown: 'md',
    html: 'html', htm: 'html', json: 'json', csv: 'csv', xml: 'xml', rtf: 'rtf',
    yaml: 'yaml', yml: 'yaml', log: 'log',
  }
  return map[ext] || 'txt'
}

/**
 * Marcadores tipicos de cabecalho/rodape institucional (orgao, endereco, contato,
 * numero de pagina, assinatura). Uma linha que casa um marcador E se repete e'
 * quase sempre cabecalho/rodape — nao conteudo.
 */
const HEADER_FOOTER_MARKERS: RegExp[] = [
  /\bp[áa]g(?:ina)?\b/i,
  /\bfls?\.?\b/i,
  /\bcep\b/i,
  /\b\d{5}-?\d{3}\b/,                       // CEP numerico
  /[\w.+-]+@[\w.-]+\.\w{2,}/,               // e-mail
  /\btel\.?\b|\bfone\b|\bramal\b/i,
  /assinad[oa]\s+digitalmente/i,
  /documento\s+(?:eletr[ôo]nico|assinado)/i,
  /\bcrc:?\b/i,
  /minist[ée]rio\s+p[úu]blico/i,
  /\bestado\s+d[oe]\b/i,
  /tribunal\s+de\s+justi/i,
  /poder\s+judici[áa]rio/i,
  /\bcomarca\b/i,
  /procuradoria/i,
  /\b(?:av\.|avenida|rua|pra[çc]a|rodovia)\s/i,
  /procedimento\s+n?[ºo]/i,
  /\bevento\s*n?[ºo]?\s*\d/i,
  /\bchave:\s*\w/i,
]

/** Mascara tokens volateis (numero de pagina/evento/data) para agrupar rodapes iguais. */
function maskVolatileTokens(s: string): string {
  return s
    .replace(/\bp[áa]g(?:ina)?\.?\s*\d+(?:\s*(?:de|of|\/)\s*\d+)?/gi, 'pág§')
    .replace(/\bevento\s*n?[ºo]?\s*\d+/gi, 'evento§')
    .replace(/\bfls?\.?\s*\d+/gi, 'fls§')
    .replace(/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, 'data§')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, 'hora§')
}

/** Assinatura normalizada de uma linha (para contagem de repeticao). */
function lineSignature(line: string): string {
  return maskVolatileTokens(line.trim().toLowerCase()).replace(/\s+/g, ' ').slice(0, 200)
}

/**
 * Detecta e remove headers/footers (linhas que se repetem entre paginas), SEM
 * depender de delimitador de pagina (\f/"Page N") — o pdf-parse nao insere \f.
 *
 * Estrategia (por LINHA fisica, robusta):
 *  1. Assina cada linha mascarando tokens volateis (numero de pagina/evento/data),
 *     para que rodapes iguais em paginas diferentes colapsem na mesma assinatura.
 *  2. Conta a frequencia de cada assinatura no documento inteiro.
 *  3. Marca como cabecalho/rodape as linhas "semente":
 *       - frequencia alta (repete em >= metade das paginas), OU
 *       - repete >= 2x E casa um MARCADOR institucional (orgao/endereco/pagina), OU
 *       - e' apenas um numero de pagina isolado que se repete.
 *  4. EXPANDE o bloco: linhas que se repetem (>= 2x) e sao VIZINHAS de uma semente
 *     tambem entram (o cabecalho/rodape e' um bloco contiguo; assim pega linhas
 *     institucionais sem marcador explicito, ex.: nome do orgao/departamento).
 *  5. Remove as linhas marcadas. As metades de paragrafo que ficarem adjacentes
 *     serao reunidas depois (joinBrokenParagraphs + mergeAcrossPageBreaks).
 */
function removeHeadersFooters(
  text: string,
  pageCount?: number,
): { cleanedText: string; headersRemoved: number } {
  // Normaliza form-feed (quando presente) como quebra de linha/pagina.
  const rawLines = text.replace(/\f/g, '\n').split('\n')
  if (rawLines.length < 6) return { cleanedText: text, headersRemoved: 0 }

  // Frequencia por assinatura
  const freq = new Map<string, number>()
  const sigs: string[] = rawLines.map((l) => lineSignature(l))
  for (const sig of sigs) {
    if (sig.length < 3) continue
    freq.set(sig, (freq.get(sig) || 0) + 1)
  }

  // Estimar numero de paginas
  let pages = pageCount && pageCount > 0 ? pageCount : 0
  if (pages === 0) {
    const pageMarkers = rawLines.filter((l) => /\bp[áa]g(?:ina)?\.?\s*\d+/i.test(l)).length
    pages = pageMarkers > 0 ? pageMarkers : Math.max(1, Math.round(rawLines.length / 45))
  }
  const strongThreshold = Math.max(HEADER_FOOTER_THRESHOLD, Math.ceil(pages * 0.5))

  const isPureNumber = (l: string) => /^\W*\d{1,4}\W*$/.test(l.trim())
  const matchesMarker = (l: string) => HEADER_FOOTER_MARKERS.some((re) => re.test(l))

  // Passo 3: sementes
  const boiler = new Array<boolean>(rawLines.length).fill(false)
  const repeats = new Array<boolean>(rawLines.length).fill(false)
  for (let i = 0; i < rawLines.length; i++) {
    const sig = sigs[i]
    if (sig.length < 3) continue
    const count = freq.get(sig) || 0
    repeats[i] = count >= 2
    const raw = rawLines[i]
    if (count >= strongThreshold) boiler[i] = true
    else if (count >= 2 && matchesMarker(raw)) boiler[i] = true
    else if (count >= 2 && isPureNumber(raw)) boiler[i] = true
  }

  // Passo 4: expansao do bloco (linhas repetidas vizinhas de sementes)
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (let i = 0; i < rawLines.length; i++) {
      if (boiler[i] || !repeats[i]) continue
      if ((i > 0 && boiler[i - 1]) || (i < rawLines.length - 1 && boiler[i + 1])) {
        boiler[i] = true
        changed = true
      }
    }
    if (!changed) break
  }

  // Passo 5: remover linhas marcadas
  let headersRemoved = 0
  const kept: string[] = []
  for (let i = 0; i < rawLines.length; i++) {
    if (boiler[i]) {
      headersRemoved++
      continue
    }
    kept.push(rawLines[i])
  }

  return { cleanedText: kept.join('\n'), headersRemoved }
}

/**
 * Detecta paragrafos quebrados entre paginas e os junta.
 */
function joinBrokenParagraphs(text: string): { paragraphs: string[]; paragraphsJoined: number } {
  const preprocessed = text
    .replace(/\f/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')

  const rawBlocks = preprocessed.split(/\n\s*\n+/)

  const joined: string[] = []
  let paragraphsJoined = 0
  for (const block of rawBlocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length === 0) continue

    const merged = [lines[0]]
    for (let i = 1; i < lines.length; i++) {
      const prev = merged[merged.length - 1]
      const curr = lines[i]
      const isNewSentence = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(curr) && /[.!?]$/.test(prev) && !CONTINUATION_ENDINGS.test(prev)
      if (/[a-zà-ÿ]-$/.test(prev)) {
        // Hifen de silabacao (palavra quebrada na linha): junta SEM espaco,
        // removendo apenas o hifen. Ex: "adminis-" + "tração" -> "administração".
        merged[merged.length - 1] = prev.replace(/-$/, '') + curr
        paragraphsJoined++
      } else if (CONTINUATION_ENDINGS.test(prev)) {
        merged[merged.length - 1] = prev + ' ' + curr
        paragraphsJoined++
      } else if (!isNewSentence) {
        merged[merged.length - 1] = prev + ' ' + curr
        paragraphsJoined++
      } else {
        merged.push(curr)
      }
    }
    for (const p of merged) {
      const trimmed = p.trim()
      if (trimmed.length >= MIN_PARAGRAPH_CHARS) {
        joined.push(trimmed)
      }
    }
  }

  return { paragraphs: joined, paragraphsJoined }
}

/**
 * Reune paragrafos que foram PARTIDOS por quebra de pagina.
 *
 * Depois de remover cabecalho/rodape, as duas metades de um paragrafo que cruzava
 * a virada de pagina ficam como paragrafos consecutivos. Este passo as junta quando:
 *  - a metade anterior NAO termina em pontuacao final (. ! ? …), e
 *  - a metade seguinte comeca em minuscula OU em caractere de continuacao () , ; :),
 *    OU a anterior termina em hifen de silabacao (juntamos removendo o hifen).
 *
 * Conservador de proposito: exige que a continuacao comece em minuscula, para NAO
 * fundir titulos/frases distintas (que comecam em maiuscula). Isso reintegra o
 * paragrafo sem misturar conteudos que sao de fato separados.
 */
function mergeAcrossPageBreaks(paragraphs: string[]): { paragraphs: string[]; joined: number } {
  const result: string[] = []
  let joined = 0
  const endsSentence = (p: string) => /[.!?…]["'”’)\]]?\s*$/.test(p)
  const startsContinuation = (p: string) => /^[a-zà-ÿ0-9(]/.test(p) || /^[),;:]/.test(p)
  const hyphenBreak = (p: string) => /[a-zà-ÿ]-$/.test(p)

  for (const raw of paragraphs) {
    const curr = raw.trim()
    if (curr.length === 0) continue
    if (result.length === 0) {
      result.push(curr)
      continue
    }
    const prev = result[result.length - 1]
    if (hyphenBreak(prev)) {
      // palavra silabada na virada de pagina: "adminis-" + "tração" -> "administração"
      result[result.length - 1] = prev.replace(/-$/, '') + curr
      joined++
    } else if (!endsSentence(prev) && startsContinuation(curr)) {
      result[result.length - 1] = prev + ' ' + curr
      joined++
    } else {
      result.push(curr)
    }
  }
  return { paragraphs: result, joined }
}

/**
 * Detecta secoes (titulos em CAIXA ALTA, "Art. N", etc) e indexa paragrafos.
 * Detecta heading no INICIO do paragrafo (mesmo se tiver mais texto na mesma linha).
 */
function detectSections(paragraphs: string[]): {
  paragraphs: Array<{ i: number; text: string; type?: string }>
  sections: Array<{ title: string; start: number; end: number }>
} {
  const result: Array<{ i: number; text: string; type?: string }> = []
  const sections: Array<{ title: string; start: number; end: number }> = []
  let currentSection: { title: string; start: number; end: number } | null = null

  for (let i = 0; i < paragraphs.length; i++) {
    if (result.length >= MAX_PARAGRAPHS) break
    const p = paragraphs[i]
    const headingCandidate = p.split(/[.\n]/)[0].trim()
    const isHeading = headingCandidate.length > 0
      && headingCandidate.length < 200
      && SECTION_HEADING_PATTERNS.some(re => re.test(headingCandidate))

    if (isHeading) {
      if (currentSection) {
        currentSection.end = result.length - 1
        sections.push(currentSection)
      }
      currentSection = {
        title: headingCandidate,
        start: result.length,
        end: result.length,
      }
      result.push({ i: result.length, text: headingCandidate, type: 'heading' })
      const rest = p.substring(headingCandidate.length).trim()
      if (rest.length >= MIN_PARAGRAPH_CHARS) {
        result.push({ i: result.length, text: rest, type: 'body' })
        currentSection.end = result.length - 1
      }
    } else {
      const type = detectParagraphType(p)
      result.push({ i: result.length, text: p, type })
      if (currentSection) {
        currentSection.end = result.length - 1
      }
    }

    if (sections.length >= MAX_SECTIONS) break
  }

  if (currentSection) {
    currentSection.end = result.length - 1
    sections.push(currentSection)
  }

  return { paragraphs: result, sections }
}

/**
 * Detecta o tipo de um paragrafo (heading, signature, certification, body, etc).
 */
function detectParagraphType(text: string): string {
  if (CERTIFICATION_PATTERNS.some(p => p.test(text))) return 'certification'
  if (SIGNATURE_PATTERNS.some(p => p.test(text.substring(0, 100)))) return 'signature'
  if (text.length < 80 && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s\d.,;:()\-–—]{4,}$/.test(text)) return 'subheading'
  return 'body'
}

/**
 * Constroi o fullText a partir dos paragrafos.
 */
function buildFullText(paragraphs: Array<{ text: string }>): string {
  return paragraphs.map(p => p.text).join('\n\n')
}

/**
 * Log de uso (para debugging)
 */
export function logStructuredJsonStats(doc: StructuredDocumentJsonV2, docId?: string): void {
  logger.info('textToStructuredJsonV2.stats', {
    docId,
    paragraphs: doc.paragraphs.length,
    sections: doc.sections.length,
    charsOriginal: doc.meta.charsOriginal,
    charsStored: doc.meta.charsStored,
    compressionRatio: doc.meta.compressionRatio,
    headersRemoved: doc.meta.headersRemoved,
    paragraphsJoined: doc.meta.paragraphsJoined,
  })
}
