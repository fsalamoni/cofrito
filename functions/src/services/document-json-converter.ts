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

  // 1. Detectar e remover headers/footers repetidos
  const { cleanedText, headersRemoved } = removeHeadersFooters(text)

  // 2. Detectar e juntar paragrafos quebrados entre paginas
  const { paragraphs: rawParagraphs, paragraphsJoined } = joinBrokenParagraphs(cleanedText)

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
        const v1 = parsed as { meta: any; sections: any[]; fullText: string }
        const text = v1.fullText
        const { paragraphs } = joinBrokenParagraphs(text)
        return {
          v: 2,
          meta: { ...v1.meta, paragraphsJoined: 0, headersRemoved: 0 },
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
 * Detecta e remove headers/footers (linhas que se repetem em >= HEADER_FOOTER_THRESHOLD paginas).
 */
function removeHeadersFooters(text: string): { cleanedText: string; headersRemoved: number } {
  const pageDelimiter = /\f|\n\s*Page\s+\d+\s*(?:of\s+\d+)?\s*\n/i
  const pages = text.split(pageDelimiter)
  if (pages.length < HEADER_FOOTER_THRESHOLD) {
    return { cleanedText: text, headersRemoved: 0 }
  }

  const lineCount = new Map<string, number>()
  const normalize = (line: string) => line.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 100)
  for (const page of pages) {
    const seen = new Set<string>()
    for (const line of page.split('\n')) {
      const normalized = normalize(line)
      if (normalized.length < 3) continue
      if (CERTIFICATION_PATTERNS.some(p => p.test(normalized))) continue
      if (seen.has(normalized)) continue
      seen.add(normalized)
      lineCount.set(normalized, (lineCount.get(normalized) || 0) + 1)
    }
  }

  const headerFooterLines = new Set<string>()
  for (const [line, count] of lineCount.entries()) {
    if (count >= HEADER_FOOTER_THRESHOLD) {
      headerFooterLines.add(line)
    }
  }

  let headersRemoved = 0
  const cleanedPages = pages.map((page) => {
    const lines = page.split('\n')
    const filtered = lines.filter((line) => {
      const normalized = normalize(line)
      if (headerFooterLines.has(normalized)) {
        headersRemoved++
        return false
      }
      return true
    })
    return filtered.join('\n')
  })

  const cleanedText = cleanedPages.join('\n\n')
  return { cleanedText, headersRemoved }
}

/**
 * Detecta paragrafos quebrados entre paginas e os junta.
 */
function joinBrokenParagraphs(text: string): { paragraphs: string[]; paragraphsJoined: number } {
  let preprocessed = text
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
      if (CONTINUATION_ENDINGS.test(prev) || /[a-z]-$/.test(prev)) {
        merged[merged.length - 1] = prev.replace(/[a-z]-$/, '').trim() + ' ' + curr
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
