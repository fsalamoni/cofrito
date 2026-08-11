/**
 * Storage compressor — gerencia compressao gzip para arquivos texto.
 *
 * PDFs, DOCXs e binarios ja sao naturalmente compactados.
 * TXT, MD, HTML, CSV sao compactados com gzip para economizar espaco
 * no Storage e no Firestore (textOriginal compactado).
 *
 * O browser descompacta nativamente (Content-Encoding: gzip),
 * entao nao muda o fluxo de download.
 */
import { gzipSync, gunzipSync } from 'node:zlib'

const TEXT_MIME_TYPES = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/yaml',
]

const TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'html', 'htm', 'json', 'csv', 'xml',
  'log', 'yaml', 'yml', 'tsv', 'tex', 'rst',
]

/**
 * Decide se um arquivo deve ser compactado com gzip.
 * Retorna true para texto (txt, md, html, json, csv, etc).
 * Retorna false para binarios (pdf, docx, images, etc).
 */
export function shouldCompress(mimeType: string, fileName: string): boolean {
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  if (TEXT_EXTENSIONS.includes(ext)) return true
  if (TEXT_MIME_TYPES.some(t => mimeType.startsWith(t))) return true
  return false
}

/**
 * Compacta buffer com gzip (se faz sentido).
 * Retorna { buffer, encoded } onde encoded=true se foi compactado.
 */
export function compressBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): { buffer: Buffer; encoded: boolean } {
  if (!shouldCompress(mimeType, fileName)) {
    return { buffer, encoded: false }
  }
  // gzip level 6 (default balance)
  const gzipped = gzipSync(buffer, { level: 6 })
  // Se compactacao nao ajudou (< 5%), usa original
  if (gzipped.length >= buffer.length * 0.95) {
    return { buffer, encoded: false }
  }
  return { buffer: gzipped, encoded: true }
}

/**
 * Descompacta buffer (se foi compactado).
 */
export function decompressBuffer(
  buffer: Buffer,
  wasEncoded: boolean,
): Buffer {
  if (!wasEncoded) return buffer
  return gunzipSync(buffer)
}

/**
 * Estima o ganho de compactacao (1 - compressedSize/originalSize).
 */
export function estimateCompressionGain(
  original: Buffer,
  compressed: Buffer,
): number {
  if (original.length === 0) return 0
  return Math.round((1 - compressed.length / original.length) * 1000) / 1000
}
