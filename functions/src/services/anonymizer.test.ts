import { describe, it, expect } from 'vitest'
import { filterPII, restorePII } from './anonymizer'

describe('anonymizer', () => {
  describe('filterPII', () => {
    it('substitui CPF', () => {
      const result = filterPII('Meu CPF é 123.456.789-09')
      expect(result.text).not.toContain('123.456.789-09')
      expect(result.text).toContain('[cpf_')
      expect(result.mapping.size).toBeGreaterThan(0)
    })

    it('substitui PGEA', () => {
      const result = filterPII('PGEA: 00021.000.181/2025')
      expect(result.text).not.toContain('00021.000.181/2025')
      expect(result.text).toContain('[pgea_')
    })

    it('substitui e-mail', () => {
      const result = filterPII('Mande para fulano@example.com')
      expect(result.text).not.toContain('fulano@example.com')
      expect(result.text).toContain('[email_')
    })

    it('substitui número de processo CNJ', () => {
      const result = filterPII('Processo: 0001234-56.2024.8.21.0001')
      expect(result.text).not.toContain('0001234-56.2024.8.21.0001')
      expect(result.text).toContain('[processo_')
    })

    it('substitui OAB', () => {
      const result = filterPII('OAB/RS 12345')
      expect(result.text).not.toContain('OAB/RS 12345')
      expect(result.text).toContain('[oab_')
    })

    it('substitui telefone', () => {
      const result = filterPII('Me ligue: (51) 99999-8888')
      expect(result.text).not.toContain('(51) 99999-8888')
      expect(result.text).toContain('[telefone_')
    })

    it('substitui múltiplos PIIs no mesmo texto', () => {
      const result = filterPII('CPF 111.222.333-44, email a@b.com')
      expect(result.text).not.toContain('111.222.333-44')
      expect(result.text).not.toContain('a@b.com')
    })

    it('preserva texto sem PII', () => {
      const text = 'O que é improbidade administrativa?'
      const result = filterPII(text)
      expect(result.text).toBe(text)
      expect(result.mapping.size).toBe(0)
    })
  })

  describe('restorePII', () => {
    it('restaura PIIs do mapping', () => {
      const { text, mapping } = filterPII('CPF 123.456.789-09')
      const original = '123.456.789-09'
      const restored = restorePII(text, mapping)
      expect(restored).toContain(original)
    })

    it('preserva texto sem alterações se mapping vazio', () => {
      const text = 'texto puro'
      const restored = restorePII(text, new Map())
      expect(restored).toBe(text)
    })
  })

  describe('round-trip', () => {
    it('filtra e depois restaura', () => {
      const original = 'CPF 123.456.789-09, email x@y.com'
      const { text, mapping } = filterPII(original)
      expect(text).not.toBe(original)
      const restored = restorePII(text, mapping)
      expect(restored).toBe(original)
    })
  })
})
