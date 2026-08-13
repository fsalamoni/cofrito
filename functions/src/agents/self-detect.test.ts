/**
 * Testes do detector de perguntas sobre o próprio agente.
 */
import { describe, it, expect } from 'vitest'
import { isAboutItself, getIdentityResponse } from './self-detect'

describe('self-detect', () => {
  describe('isAboutItself', () => {
    it('detecta "quem é você"', () => {
      expect(isAboutItself('Quem é você?')).toBe(true)
    })
    it('detecta "o que é o Cofrito"', () => {
      expect(isAboutItself('O que é o Cofrito?')).toBe(true)
    })
    it('detecta "como funciona"', () => {
      expect(isAboutItself('Como você funciona?')).toBe(true)
    })
    it('detecta "quem te criou"', () => {
      expect(isAboutItself('Quem te criou?')).toBe(true)
    })
    it('detecta "para que serve"', () => {
      expect(isAboutItself('Para que você serve?')).toBe(true)
    })
    it('detecta "Cofrito" no meio do texto', () => {
      expect(isAboutItself('Posso conhecer melhor o Cofrito?')).toBe(true)
    })
    it('detecta "me ajude"', () => {
      expect(isAboutItself('Me ajude')).toBe(true)
    })
    it('NÃO detecta pergunta jurídica específica', () => {
      expect(isAboutItself('Qual a jurisprudência do STJ sobre improbidade administrativa?')).toBe(false)
    })
    it('NÃO detecta pergunta sobre acervo', () => {
      expect(isAboutItself('O que há no acervo sobre ações de improbidade?')).toBe(false)
    })
    it('NÃO detecta texto longo (pergunta jurídica complexa)', () => {
      const long = 'Preciso de uma análise detalhada sobre a aplicação do art. 37 da Constituição Federal em casos de nepotismo cruzado, considerando a jurisprudência recente do STF sobre a matéria, especialmente os julgados de 2024 e 2025 que reformularam o entendimento'
      expect(isAboutItself(long)).toBe(false)
    })
    it('detecta "vc" e abreviações', () => {
      expect(isAboutItself('Vc é confiável?')).toBe(true)
      expect(isAboutItself('O q vc faz?')).toBe(true)
    })
  })

  describe('getIdentityResponse', () => {
    it('retorna resposta longa por padrão', () => {
      const r = getIdentityResponse()
      expect(r).toContain('Cofrito')
      expect(r).toContain('CAOCIPP')
      expect(r).toContain('MPRS')
      expect(r.length).toBeGreaterThan(200)
    })
    it('retorna resposta curta quando short=true', () => {
      const r = getIdentityResponse(true)
      expect(r).toContain('Cofrito')
      expect(r.length).toBeLessThan(300)
    })
  })
})
