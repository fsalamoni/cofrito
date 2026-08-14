import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LEGAL_TAXONOMY,
  normalizeLegalTaxonomy,
  buildTaxonomyPromptBlock,
} from './legal-taxonomy'

describe('legal-taxonomy', () => {
  it('defaults têm listas não vazias', () => {
    expect(DEFAULT_LEGAL_TAXONOMY.tiposDocumento.length).toBeGreaterThan(0)
    expect(DEFAULT_LEGAL_TAXONOMY.areasDireito.length).toBeGreaterThan(0)
    expect(DEFAULT_LEGAL_TAXONOMY.assuntos.length).toBeGreaterThan(0)
  })

  it('normaliza: remove vazios, apara, dedup case-insensitive; campos ausentes → default', () => {
    const t = normalizeLegalTaxonomy({
      tiposDocumento: ['  Parecer  ', 'parecer', '', 'TAC', 123],
      areasDireito: [],
    })
    expect(t.tiposDocumento).toEqual(['Parecer', 'TAC'])
    // areasDireito ausente/vazio (não-array falso) usa fallback? [] é array vazio válido
    expect(Array.isArray(t.areasDireito)).toBe(true)
    // assuntos ausente → default
    expect(t.assuntos.length).toBe(DEFAULT_LEGAL_TAXONOMY.assuntos.length)
  })

  it('campo ausente (undefined) volta ao default; array vazio fica vazio', () => {
    const t = normalizeLegalTaxonomy({ areasDireito: [] })
    expect(t.areasDireito).toEqual([])
    expect(t.tiposDocumento).toEqual(DEFAULT_LEGAL_TAXONOMY.tiposDocumento)
  })

  it('buildTaxonomyPromptBlock inclui os termos', () => {
    const block = buildTaxonomyPromptBlock({
      tiposDocumento: ['Parecer'],
      areasDireito: ['Direito Administrativo'],
      assuntos: ['Nepotismo'],
    })
    expect(block).toContain('TAXONOMIA')
    expect(block).toContain('Parecer')
    expect(block).toContain('Direito Administrativo')
    expect(block).toContain('Nepotismo')
  })
})
