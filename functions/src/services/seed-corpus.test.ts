/**
 * Testes do seed-corpus.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted permite usar mocks antes dos imports
const { mockGet, mockFirestore } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mockSet = vi.fn().mockResolvedValue(undefined)
  const mockGet = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mockDoc = vi.fn((path: string) => ({
    get: () => mockGet(path),
    set: mockSet,
    collection: () => ({
      doc: () => ({ set: mockSet }),
    }),
  }))
  const mockFirestore = vi.fn(() => ({ doc: mockDoc }))
  return { mockSet, mockGet, mockDoc, mockFirestore }
})

vi.mock('./firestore', () => ({
  getFirestore: mockFirestore,
}))

vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { ensureSeedCorpus, SEED_DOCS } from './seed-corpus'

describe('seed-corpus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('SEED_DOCS', () => {
    it('tem pelo menos 3 documentos fundacionais', () => {
      expect(SEED_DOCS.length).toBeGreaterThanOrEqual(3)
    })

    it('todos os docs tem id, title, content, area, tags', () => {
      for (const doc of SEED_DOCS) {
        expect(doc.id).toBeTruthy()
        expect(doc.title).toBeTruthy()
        expect(doc.content.length).toBeGreaterThan(100)
        expect(Array.isArray(doc.area)).toBe(true)
        expect(Array.isArray(doc.tags)).toBe(true)
      }
    })

    it('tem o documento "Sobre o Cofrito" com conteudo institucional', () => {
      const sobre = SEED_DOCS.find(d => d.id === 'seed-sobre-o-cofrito')
      expect(sobre).toBeDefined()
      expect(sobre?.content).toContain('Cofrito')
      expect(sobre?.content).toContain('CAOCIPP')
      expect(sobre?.content).toContain('MPRS')
      expect(sobre?.content).toContain('patrimônio')
    })

    it('tem o documento "Sobre o CAOCIPP"', () => {
      const sobre = SEED_DOCS.find(d => d.id === 'seed-sobre-o-caocipp')
      expect(sobre).toBeDefined()
      expect(sobre?.content).toContain('CAOCIPP')
    })

    it('tem o documento "Como abrir consulta formal"', () => {
      const como = SEED_DOCS.find(d => d.id === 'seed-como-abrir-consulta-formal')
      expect(como).toBeDefined()
      expect(como?.content).toContain('consulta formal')
    })
  })

  describe('ensureSeedCorpus', () => {
    it('cria docs que nao existem', async () => {
      mockGet.mockResolvedValue({ exists: false })
      const result = await ensureSeedCorpus()
      expect(result.created).toBe(SEED_DOCS.length)
      expect(result.skipped).toBe(0)
    })

    it('skipa docs que ja existem', async () => {
      mockGet.mockResolvedValue({ exists: true })
      const result = await ensureSeedCorpus()
      expect(result.created).toBe(0)
      expect(result.skipped).toBe(SEED_DOCS.length)
    })

    it('eh idempotente', async () => {
      // Primeira chamada: 1 doc existe, outros nao
      let callCount = 0
      mockGet.mockImplementation(() => {
        callCount++
        return Promise.resolve({ exists: callCount === 1 })
      })
      const r1 = await ensureSeedCorpus()
      expect(r1.created + r1.skipped).toBe(SEED_DOCS.length)
    })
  })
})
