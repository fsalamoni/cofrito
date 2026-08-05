import { describe, it, expect } from 'vitest'
import { getCachedEmbedding, setCachedEmbedding } from './embeddings'

describe('cache de embeddings', () => {
  it('retorna null para texto não cacheado', () => {
    expect(getCachedEmbedding('texto novo')).toBeNull()
  })

  it('retorna vetor cacheado', () => {
    const vector = [0.1, 0.2, 0.3]
    setCachedEmbedding('texto A', vector)
    expect(getCachedEmbedding('texto A')).toEqual(vector)
  })

  it('diferencia textos diferentes', () => {
    setCachedEmbedding('A', [1])
    setCachedEmbedding('B', [2])
    expect(getCachedEmbedding('A')).toEqual([1])
    expect(getCachedEmbedding('B')).toEqual([2])
  })
})
