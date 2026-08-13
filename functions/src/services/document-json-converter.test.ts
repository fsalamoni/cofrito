/**
 * Testes do document-json-converter.
 */
import { describe, it, expect } from 'vitest'
import {
  textToStructuredJson,
  parseStructuredJson,
  resolveTextContent,
  getStructuredMeta,
  serializeStructuredJson,
} from './document-json-converter'

describe('document-json-converter', () => {
  describe('textToStructuredJson', () => {
    it('converte texto simples em JSON v1', () => {
      const text = 'Este é o primeiro parágrafo do documento.\n\nEste é o segundo parágrafo.'
      const result = textToStructuredJson(text, 'test.txt')
      expect(result.v).toBe(1)
      expect(result.meta.format).toBe('txt')
      expect(result.meta.paragraphs).toBeGreaterThan(0)
      expect(result.fullText.length).toBeGreaterThan(0)
    })

    it('detecta formato pdf', () => {
      const result = textToStructuredJson('texto', 'doc.pdf', 5)
      expect(result.meta.format).toBe('pdf')
      expect(result.meta.pages).toBe(5)
    })

    it('detecta formato docx', () => {
      const result = textToStructuredJson('texto', 'doc.docx')
      expect(result.meta.format).toBe('docx')
    })

    it('calcula compressionRatio', () => {
      const text = '   '.repeat(100) + 'conteudo real'
      const result = textToStructuredJson(text, 'test.txt')
      expect(result.meta.compressionRatio).toBeGreaterThan(0)
    })

    it('identifica secoes por heading numerado', () => {
      const text = `Introducao.

1. Primeiro topico.

Conteudo do primeiro topico.

2. Segundo topico.

Conteudo do segundo topico.`
      const result = textToStructuredJson(text, 'doc.txt')
      expect(result.sections.length).toBeGreaterThan(1)
    })

    it('filtra paragrafos muito curtos', () => {
      const text = 'a\n\nb\n\nEste parágrafo tem conteúdo suficiente para ser incluído.'
      const result = textToStructuredJson(text, 'doc.txt')
      expect(result.meta.paragraphs).toBe(1)
    })

    it('respeita MAX_PARAGRAPHS_PER_SECTION', () => {
      const paragraphs = Array(1000).fill('parágrafo com conteúdo válido para o teste')
      const text = paragraphs.join('\n\n')
      const result = textToStructuredJson(text, 'doc.txt')
      const totalParagraphs = result.sections.reduce((n, s) => n + s.paragraphs.length, 0)
      expect(totalParagraphs).toBeLessThanOrEqual(200 * 500) // razoável
    })
  })

  describe('parseStructuredJson', () => {
    it('retorna null se textContent é texto puro', () => {
      expect(parseStructuredJson('texto puro')).toBeNull()
    })

    it('retorna null se textContent é muito curto', () => {
      expect(parseStructuredJson('a')).toBeNull()
    })

    it('parseia JSON v1 válido', () => {
      const doc = textToStructuredJson('conteudo de teste', 'test.txt')
      const json = serializeStructuredJson(doc)
      const parsed = parseStructuredJson(json)
      expect(parsed).not.toBeNull()
      expect(parsed?.v).toBe(1)
      expect(parsed?.fullText).toContain('conteudo de teste')
    })

    it('retorna null para JSON sem v=1', () => {
      const invalid = JSON.stringify({ v: 2, fullText: 'test' })
      expect(parseStructuredJson(invalid)).toBeNull()
    })
  })

  describe('resolveTextContent', () => {
    it('retorna textContent direto se nao for JSON', () => {
      expect(resolveTextContent('texto puro')).toBe('texto puro')
    })

    it('retorna fullText se for JSON v1', () => {
      const doc = textToStructuredJson('meu conteudo', 'test.txt')
      const json = serializeStructuredJson(doc)
      expect(resolveTextContent(json)).toContain('meu conteudo')
    })
  })

  describe('getStructuredMeta', () => {
    it('retorna meta de JSON v1', () => {
      const doc = textToStructuredJson('teste', 'foo.pdf', 3)
      const json = serializeStructuredJson(doc)
      const meta = getStructuredMeta(json)
      expect(meta?.filename).toBe('foo.pdf')
      expect(meta?.pages).toBe(3)
    })

    it('retorna null para texto puro', () => {
      expect(getStructuredMeta('texto puro')).toBeNull()
    })
  })

  describe('serializeStructuredJson', () => {
    it('roundtrip funciona', () => {
      const original = textToStructuredJson('teste de roundtrip\n\nsegundo parágrafo', 'doc.pdf', 2)
      const json = serializeStructuredJson(original)
      const parsed = parseStructuredJson(json)
      expect(parsed?.meta.filename).toBe('doc.pdf')
      expect(parsed?.meta.pages).toBe(2)
    })
  })
})
