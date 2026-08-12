import { describe, it, expect } from 'vitest'
import { isAboutItselfClient, getIdentityResponseClient } from './self-detect'

describe('self-detect (client)', () => {
  describe('isAboutItselfClient', () => {
    it('detecta "quem é você"', () => {
      expect(isAboutItselfClient('Quem é você?')).toBe(true)
    })
    it('detecta "o que é o Cofrito"', () => {
      expect(isAboutItselfClient('O que é o Cofrito?')).toBe(true)
    })
    it('detecta "como funciona"', () => {
      expect(isAboutItselfClient('Como você funciona?')).toBe(true)
    })
    it('detecta "quem te criou"', () => {
      expect(isAboutItselfClient('Quem te criou?')).toBe(true)
    })
    it('detecta "para que serve"', () => {
      expect(isAboutItselfClient('Para que você serve?')).toBe(true)
    })
    it('detecta "Cofrito" no meio do texto', () => {
      expect(isAboutItselfClient('Posso conhecer melhor o Cofrito?')).toBe(true)
    })
    it('detecta "me ajude"', () => {
      expect(isAboutItselfClient('Me ajude')).toBe(true)
    })
    it('detecta "vc" e abreviações', () => {
      expect(isAboutItselfClient('Vc é confiável?')).toBe(true)
      expect(isAboutItselfClient('O q vc faz?')).toBe(true)
    })
    it('NÃO detecta pergunta jurídica específica', () => {
      expect(isAboutItselfClient('Qual a jurisprudência do STJ sobre improbidade administrativa?')).toBe(false)
    })
    it('NÃO detecta pergunta sobre acervo', () => {
      expect(isAboutItselfClient('O que há no acervo sobre ações de improbidade?')).toBe(false)
    })
    it('NÃO detecta texto longo (pergunta jurídica complexa)', () => {
      const long = 'Preciso de uma análise detalhada sobre a aplicação do art. 37 da Constituição Federal em casos de nepotismo cruzado, considerando a jurisprudência recente do STF sobre a matéria, especialmente os julgados de 2024 e 2025 que reformularam o entendimento'
      expect(isAboutItselfClient(long)).toBe(false)
    })
  })

  describe('getIdentityResponseClient', () => {
    it('retorna resposta longa por padrão', () => {
      const r = getIdentityResponseClient()
      expect(r).toContain('Cofrito')
      expect(r).toContain('CAOCIPP')
      expect(r).toContain('MPRS')
      expect(r.length).toBeGreaterThan(200)
    })
    it('retorna resposta curta quando short=true', () => {
      const r = getIdentityResponseClient(true)
      expect(r).toContain('Cofrito')
      expect(r.length).toBeLessThan(300)
    })
  })
})
