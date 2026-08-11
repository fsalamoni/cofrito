/**
 * Document → Structured JSON converter.
 *
 * Porta do `document-json-converter.ts` da Lexio para o backend Node.js.
 * Converte texto extraido em JSON estruturado v1 (compacto + pesquisavel).
 *
 * Schema v1:
 * ```json
 * {
 *   "v": 1,
 *   "meta": { "filename", "format", "pages?", "paragraphs", "charsOriginal", "charsStored", "compressionRatio" },
 *   "sections": [ { "title", "paragraphs[]" } ],
 *   "fullText": "..."
 * }
 * ```
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface StructuredDocumentJson {
  v: 1
  meta: StructuredDocumentMeta
  sections: StructuredDocumentSection[]
  /** Whitespace-normalized full text (otimizado para LLM/busca) */
  fullText: string
}

export interface StructuredDocumentMeta {
  filename: string
  /** Source format: pdf, docx, txt, md, html, json, csv, xml, rtf, yaml, log */
  format: string
  pages?: number
  paragraphs: number
  charsOriginal: number
  charsStored: number
  /** Ratio: 1 - charsStored/charsOriginal (0..1) */
  compressionRatio: number
}

export interface StructuredDocumentSection {
  title: string
  paragraphs: string[]
}

// ── Constants ─────────────────────────────────────────────────────────

const MIN_PARAGRAPH_CHARS = 12
const MAX_SECTIONS = 200
const MAX_PARAGRAPHS_PER_SECTION = 500

// ── Core conversion ────────────────────────────────────────────────────

/**
 * Converte texto bruto em JSON estruturado v1.
 * @param text - texto extraido (PDF, DOCX, etc)
 * @param filename - nome original do arquivo
 * @param pageCount - numero de paginas (opcional, so para PDFs)
 */
export function textToStructuredJson(
  text: string,
  filename: string,
  pageCount?: number,
): StructuredDocumentJson {
  const charsOriginal = text.length
  const format = detectFormat(filename)

  const rawParagraphs = splitIntoParagraphs(text)
  const sections = buildSections(rawParagraphs)
  const fullText = normalizeWhitespace(text)

  const totalParagraphs = sections.reduce((n, s) => n + s.paragraphs.length, 0)

  const meta: StructuredDocumentMeta = {
    filename,
    format,
    paragraphs: totalParagraphs,
    charsOriginal,
    charsStored: fullText.length,
    compressionRatio: charsOriginal > 0
      ? Math.round((1 - fullText.length / charsOriginal) * 1000) / 1000
      : 0,
  }
  if (pageCount !== undefined && pageCount > 0) {
    meta.pages = pageCount
  }

  return {
    v: 1,
    meta,
    sections,
    fullText,
  }
}

/**
 * Serializa para string JSON (para gravar no Firestore).
 */
export function serializeStructuredJson(doc: StructuredDocumentJson): string {
  return JSON.stringify(doc)
}

/**
 * Tenta parsear textContent como StructuredDocumentJson v1.
 * Retorna null se nao for (legado texto puro).
 */
export function parseStructuredJson(textContent: string): StructuredDocumentJson | null {
  if (!textContent || textContent.length < 10) return null
  const trimmed = textContent.trimStart()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && parsed.v === 1 && typeof parsed.fullText === 'string') {
      return parsed as StructuredDocumentJson
    }
  } catch {
    // nao eh JSON
  }
  return null
}

/**
 * Resolve textContent para texto puro (transparente: JSON v1 OU legado).
 * Esta eh a UNICA forma de ler textContent que todos os consumers devem usar.
 */
export function resolveTextContent(textContent: string): string {
  const structured = parseStructuredJson(textContent)
  if (structured) return structured.fullText
  return textContent
}

/**
 * Retorna metadata do JSON estruturado, ou null se for legado.
 */
export function getStructuredMeta(textContent: string): StructuredDocumentMeta | null {
  const structured = parseStructuredJson(textContent)
  return structured?.meta ?? null
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

function splitIntoParagraphs(text: string): string[] {
  // Split por double newline ou form-feed
  return text
    .split(/\n\s*\n|\f/)
    .map(p => p.trim())
    .filter(p => p.length >= MIN_PARAGRAPH_CHARS)
}

function buildSections(paragraphs: string[]): StructuredDocumentSection[] {
  const sections: StructuredDocumentSection[] = []
  let current: StructuredDocumentSection = { title: 'Documento', paragraphs: [] }
  const headingRegex = /^(\d+[.)]\s+.+|CAPÍTULO\s+\w+|TÍTULO\s+\w+|SEÇÃO\s+\w+|ARTIGO\s+\w+|Art\.\s*\d+)/i
  const allCapsRegex = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{5,}$/

  for (const para of paragraphs) {
    const isHeading = headingRegex.test(para) || (allCapsRegex.test(para.split('\n')[0] ?? '') && para.length < 100)

    if (isHeading && current.paragraphs.length > 0) {
      // Nova secao
      if (sections.length < MAX_SECTIONS) sections.push(current)
      current = { title: para.length < 100 ? para : 'Seção', paragraphs: [] }
    } else {
      if (current.paragraphs.length < MAX_PARAGRAPHS_PER_SECTION) {
        current.paragraphs.push(para)
      }
      if (sections.length === 0 && current.paragraphs.length === 1) {
        current.title = 'Documento'
      }
    }
  }

  if (current.paragraphs.length > 0) {
    sections.push(current)
  }

  return sections
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')          // multiplos espacos/tabs -> 1 espaco
    .replace(/\n{3,}/g, '\n\n')       // 3+ newlines -> 2
    .replace(/^\s+|\s+$/g, '')        // trim inicio/fim
}
