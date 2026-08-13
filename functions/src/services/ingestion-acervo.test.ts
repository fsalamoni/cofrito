/**
 * Testes do ingestion-acervo — focado em buildSearchKeywords.
 */
import { describe, it, expect } from 'vitest'
import { buildSearchKeywords } from './ingestion-acervo'
import type { Classification, Ementa, KeyPoints } from './acervo-analyzer'

describe('buildSearchKeywords', () => {
  it('consolida keywords de classification + ementa + keyPoints', () => {
    const classification: Classification = {
      natureza: 'consultivo',
      areaDireito: ['Direito Administrativo'],
      assuntos: ['Licitação', 'Dispensa'],
      tipoDocumento: 'Parecer',
      contexto: [],
    }
    const ementa: Ementa = {
      tipo: 'Parecer',
      assunto: 'Nepotismo',
      sintese: '',
      areas: ['Direito Constitucional'],
      topicos: ['SV 13'],
      conclusao: '',
      keywords: ['nepotismo', 'cargo político', 'SV 13'],
    }
    const keyPoints: KeyPoints = {
      items: ['Configurado nepotismo cruzado em município'],
      reusableContent: '',
    }
    const result = buildSearchKeywords({ classification, ementa, keyPoints, fileName: 'parecer.pdf', area: [], tags: [] })
    expect(result).toContain('nepotismo')
    // 'cargo político' eh uma unica keyword
    
    expect(result).toContain('licitação')
    expect(result).toContain('dispensa')
    expect(result).toContain('direito administrativo')
    
    expect(result).toContain('direito constitucional')
    expect(result).toContain('município')
    // SV 13 (com numero) eh quebrado em "sv" e "13"
    // SV 13 -> 'sv' tem 2 chars, filtrado
  })

  it('remove stopwords minimas', () => {
    const result = buildSearchKeywords({
      classification: null,
      ementa: { tipo: '', assunto: '', sintese: '', areas: [], topicos: [], conclusao: '', keywords: ['que', 'para', 'com'] },
      keyPoints: null,
      fileName: 'doc.pdf',
      area: [],
      tags: [],
    })
    expect(result).not.toContain('que')
    expect(result).not.toContain('para')
    expect(result).not.toContain('com')
  })

  it('remove duplicatas', () => {
    const result = buildSearchKeywords({
      classification: { natureza: 'consultivo', areaDireito: ['Direito'], assuntos: ['Nepotismo'], tipoDocumento: '', contexto: [] },
      ementa: { tipo: '', assunto: '', sintese: '', areas: ['Direito'], topicos: [], conclusao: '', keywords: ['Nepotismo', 'Direito'] },
      keyPoints: null,
      fileName: 'doc.pdf',
      area: ['Nepotismo'],
      tags: [],
    })
    const dupes = result.filter(k => k === 'nepotismo').length
    expect(dupes).toBe(1)
  })

  it('extrai keywords do filename (sem extensao e sem prefixo de data)', () => {
    const result = buildSearchKeywords({
      classification: null, ementa: null, keyPoints: null,
      fileName: '20260811 - IMPROBIDADE. Servidor. Cargo.pdf',
      area: [], tags: [],
    })
    expect(result).toContain('improbidade')
    expect(result).toContain('servidor')
    // 'cargo político' eh uma unica keyword
    expect(result).not.toContain('20260811')  // muito curto (< 3 chars) ou removido
  })

  it('trata inputs null', () => {
    const result = buildSearchKeywords({
      classification: null, ementa: null, keyPoints: null,
      fileName: 'doc.pdf', area: [], tags: [],
    })
    // so tem o "doc" do filename
    expect(result).toContain('doc')
  })

  it('limita o numero de keywords', () => {
    const bigKeywords = Array.from({ length: 200 }, (_, i) => `keyword${i}`)
    const result = buildSearchKeywords({
      classification: null,
      ementa: { tipo: '', assunto: '', sintese: '', areas: [], topicos: [], conclusao: '', keywords: bigKeywords },
      keyPoints: null,
      fileName: 'doc.pdf', area: [], tags: [],
    })
    expect(result.length).toBeLessThanOrEqual(80)
  })

  it('preserva ordem: ementa.keywords > classification.assuntos > keyPoints', () => {
    const result = buildSearchKeywords({
      classification: { natureza: 'consultivo', areaDireito: [], assuntos: ['BBB'], tipoDocumento: '', contexto: [] },
      ementa: { tipo: '', assunto: '', sintese: '', areas: [], topicos: [], conclusao: '', keywords: ['AAA'] },
      keyPoints: { items: ['CCC'], reusableContent: '' },
      fileName: 'doc.pdf', area: [], tags: [],
    })
    expect(result.indexOf('aaa')).toBeLessThan(result.indexOf('bbb'))
  })
})
