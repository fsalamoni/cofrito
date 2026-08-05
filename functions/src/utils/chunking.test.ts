import { describe, it, expect } from 'vitest'
import { chunkText } from './chunking'

describe('chunkText', () => {
  it('retorna array vazio para texto vazio', () => {
    expect(chunkText('')).toHaveLength(0)
  })

  it('cria um único chunk para texto curto', () => {
    const text = 'Parágrafo único com algumas palavras.'
    const chunks = chunkText(text, { maxTokens: 100 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toContain('Parágrafo')
  })

  it('cria múltiplos chunks para texto longo', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) =>
      `Parágrafo ${i} com algum texto para encher o chunk. `.repeat(5),
    ).join('\n\n')
    const chunks = chunkText(paragraphs, { maxTokens: 100, overlapTokens: 20 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.tokens).toBeLessThanOrEqual(120)
    }
  })

  it('respeita seção', () => {
    const chunks = chunkText('Texto qualquer.', { maxTokens: 100, section: 'art. 1' })
    expect(chunks[0].section).toBe('art. 1')
  })
})
