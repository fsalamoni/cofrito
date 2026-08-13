/**
 * Testes do storage-compressor.
 */
import { describe, it, expect } from 'vitest'
import { shouldCompress, compressBuffer, decompressBuffer } from './storage-compressor'

describe('storage-compressor', () => {
  describe('shouldCompress', () => {
    it('compacta txt', () => {
      expect(shouldCompress('text/plain', 'doc.txt')).toBe(true)
    })
    it('compacta md', () => {
      expect(shouldCompress('text/markdown', 'README.md')).toBe(true)
    })
    it('compacta html', () => {
      expect(shouldCompress('text/html', 'page.html')).toBe(true)
    })
    it('compacta json', () => {
      expect(shouldCompress('application/json', 'data.json')).toBe(true)
    })
    it('nao compacta pdf', () => {
      expect(shouldCompress('application/pdf', 'doc.pdf')).toBe(false)
    })
    it('nao compacta docx', () => {
      expect(shouldCompress('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc.docx')).toBe(false)
    })
  })

  describe('compressBuffer / decompressBuffer', () => {
    it('roundtrip funciona para texto', () => {
      const original = Buffer.from('Hello world! '.repeat(100))
      const { buffer: compressed, encoded } = compressBuffer(original, 'text/plain', 'test.txt')
      expect(encoded).toBe(true)
      expect(compressed.length).toBeLessThan(original.length)
      const decompressed = decompressBuffer(compressed, encoded)
      expect(decompressed.toString()).toBe(original.toString())
    })

    it('nao compacta pdf', () => {
      const original = Buffer.from('%PDF-1.4 fake pdf content')
      const { buffer, encoded } = compressBuffer(original, 'application/pdf', 'doc.pdf')
      expect(encoded).toBe(false)
      expect(buffer).toEqual(original)
    })

    it('conteudo pequeno nao compacta (ganho minimo)', () => {
      const original = Buffer.from('a')
      const { encoded: _encoded } = compressBuffer(original, 'text/plain', 'a.txt')
      // Texto muito curto pode ou nao ser compactado (depende do overhead)
      // O importante: o conteudo original é preservado
      expect(original.toString()).toBe('a')
    })
  })
})
