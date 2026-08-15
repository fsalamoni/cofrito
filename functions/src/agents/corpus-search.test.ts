/**
 * Testes do corpus-search 4-level.
 */
import { describe, it, expect, vi } from 'vitest'
import type { ResearchPoint } from './types'

// Mock Firestore
const mockDocs: any[] = [
  {
    id: 'doc1',
    data: () => ({
      fileName: 'Parecer 1.pdf',
      title: 'Parecer sobre Nepotismo',
      type: 'parecer',
      classification: {
        natureza: 'consultivo',
        areaDireito: ['Direito Administrativo'],
        assuntos: ['Nepotismo', 'Cargo em Comissão'],
        tipoDocumento: 'Parecer',
        contexto: ['Município contratou parente'],
      },
      ementa: {
        tipo: 'Parecer',
        tipoDocumento: 'Parecer',
        assunto: 'Nepotismo',
        sintese: 'Contratação de parente em cargo comissionado sem concurso.',
        fundamentacao: 'Súmula Vinculante 13 do STF veda nepotismo em cargos políticos.',
        conclusao: 'Procedente, deve ser anulada a nomeação.',
        keywords: ['nepotismo', 'cargo', 'comissão', 'sv13', 'sumula'],
      },
      textContent: JSON.stringify({ version: 1, paragraphs: [{ text: 'Conteudo integral do parecer sobre nepotismo' }] }),
      keyPoints: {
        items: [
          'Súmula Vinculante 13 veda nepotismo',
          'Cargo comissionado exige relação de confiança',
          'Nomeação de cônjuge é ato de improbidade',
        ],
        reusableContent: 'A nomeação de cônjuge para cargo em comissão configura nepotismo...',
      },
      createdAt: new Date().toISOString(),
    }),
  },
  {
    id: 'doc2',
    data: () => ({
      fileName: 'Sentença 2.pdf',
      title: 'Sentença improbidade',
      type: 'sentenca',
      classification: {
        natureza: 'decisorio',
        areaDireito: ['Direito Administrativo', 'Improbidade'],
        assuntos: ['Improbidade administrativa', 'Enriquecimento ilícito'],
        tipoDocumento: 'Sentença',
        contexto: ['Gestor desviou verba pública'],
      },
      ementa: {
        tipo: 'Sentença',
        tipoDocumento: 'Sentença',
        assunto: 'Improbidade',
        sintese: 'Condenação por desvio de verba pública.',
        conclusao: 'Procedente, condenado a ressarcir o erário.',
        keywords: ['improbidade', 'desvio', 'verba', 'condenação'],
      },
      keyPoints: {
        items: [
          'Desvio de verba configura improbidade',
          'Ressarcimento integral ao erário',
        ],
      },
    }),
  },
  {
    id: 'doc3',
    data: () => ({
      fileName: 'Notícia 3.pdf',
      title: 'Notícia genérica',
      type: 'noticia',
      classification: {
        natureza: 'doutrinario',
        areaDireito: ['Direito Constitucional'],
        assuntos: ['Liberdade de expressão'],
        tipoDocumento: 'Notícia',
      },
      ementa: {
        tipo: 'Notícia',
        assunto: 'Liberdade de expressão',
        keywords: ['expressão', 'liberdade', 'constituição'],
      },
      keyPoints: {
        items: ['Liberdade de expressão é cláusula pétrea'],
      },
    }),
  },
]

vi.mock('../services/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      select: () => ({
        limit: () => ({
          get: async () => ({ docs: mockDocs.map(d => ({ id: d.id, data: d.data })) }),
        }),
        get: async () => ({ docs: mockDocs.map(d => ({ id: d.id, data: d.data })) }),
      }),
      limit: () => ({
        get: async () => ({ docs: mockDocs.map(d => ({ id: d.id, data: d.data })) }),
      }),
      get: async () => ({ docs: mockDocs.map(d => ({ id: d.id, data: d.data })) }),
    }),
    doc: (path: string) => ({
      get: async () => {
        const id = path.split('/')[1]
        const found = mockDocs.find(d => d.id === id)
        return {
          exists: !!found,
          id,
          data: () => found?.data() || {},
        }
      },
    }),
  }),
}))

import { searchCorpusFourLevel } from './corpus-search'

describe('searchCorpusFourLevel', () => {
  it('retorna docs que combinam com query sobre nepotismo', async () => {
    const point: ResearchPoint = {
      id: 'p1',
      query: 'parecer sobre nepotismo em cargo comissionado',
      keywords: ['nepotismo', 'cargo comissionado', 'parecer'],
    }
    const result = await searchCorpusFourLevel({ point, maxResults: 5 })
    expect(result.docs.length).toBeGreaterThan(0)
    expect(result.docs[0].id).toBe('doc1')  // doc1 tem mais relacao
    expect(result.docs[0].textContent).toBeDefined()
    expect(result.docs[0].classification?.tipoDocumento).toBe('Parecer')
  })

  it('retorna docs sobre improbidade', async () => {
    const point: ResearchPoint = {
      id: 'p2',
      query: 'improbidade administrativa desvio verba',
      keywords: ['improbidade', 'desvio', 'verba'],
    }
    const result = await searchCorpusFourLevel({ point, maxResults: 5 })
    expect(result.docs.length).toBeGreaterThan(0)
    expect(result.docs.some(d => d.id === 'doc2')).toBe(true)
  })

  it('retorna os mais proximos (fallback) quando nenhum doc bate diretamente', async () => {
    const point: ResearchPoint = {
      id: 'p3',
      query: 'tributação importação soja',
      keywords: ['tributação', 'importação', 'soja'],
    }
    const result = await searchCorpusFourLevel({ point, maxResults: 5 })
    // NAO retorna vazio: entrega os "mais proximos" com ressalva (usuario pediu isso).
    expect(result.usedClosestFallback).toBe(true)
    expect(result.docs.length).toBeGreaterThan(0)
    expect(result.docs.every(d => d.isClosestMatch === true)).toBe(true)
    expect(result.docs.every(d => d.matchScore === 0)).toBe(true)
  })

  it('marca correspondencias reais como NAO-fallback com score positivo', async () => {
    const point: ResearchPoint = {
      id: 'p3b',
      query: 'nepotismo cargo comissionado',
      keywords: ['nepotismo', 'cargo comissionado'],
    }
    const result = await searchCorpusFourLevel({ point, maxResults: 5 })
    expect(result.usedClosestFallback).toBe(false)
    expect(result.docs[0].isClosestMatch).toBe(false)
    expect((result.docs[0].matchScore || 0)).toBeGreaterThan(0)
  })

  it('respeita maxResults', async () => {
    const point: ResearchPoint = {
      id: 'p4',
      query: 'direito constitucional',
      keywords: ['direito'],
    }
    const result = await searchCorpusFourLevel({ point, maxResults: 1 })
    expect(result.docs.length).toBeLessThanOrEqual(1)
  })

  it('preenche stats de cada nivel', async () => {
    const point: ResearchPoint = {
      id: 'p5',
      query: 'nepotismo',
      keywords: ['nepotismo'],
    }
    const result = await searchCorpusFourLevel({ point })
    expect(result.stats.level1.loaded).toBe(3)
    expect(result.stats.level1.matched).toBeGreaterThan(0)
    expect(result.stats.level4.matched).toBeGreaterThan(0)
    // totalMs pode ser 0 em testes sincronos
  })

  it('carrega textContent apenas dos finalistas (L4)', async () => {
    const point: ResearchPoint = {
      id: 'p6',
      query: 'nepotismo cargo comissionado',
      keywords: ['nepotismo', 'cargo comissionado'],
    }
    const result = await searchCorpusFourLevel({ point, maxResults: 2 })
    for (const d of result.docs) {
      expect(d).toHaveProperty('textContent')
    }
  })
})
