import { describe, it, expect } from 'vitest'
import { detectQuickReply, isAboutItselfClient, getIdentityResponseClient } from './self-detect'

describe('self-detect (client) - quick reply', () => {
  describe('detectQuickReply', () => {
    it('retorna null para perguntas juridicas (vai pro backend)', () => {
      expect(detectQuickReply('Qual a jurisprudência do STJ sobre improbidade administrativa?')).toBeNull()
      expect(detectQuickReply('O que há no acervo sobre ações de improbidade?')).toBeNull()
    })

    it('detecta identity: "quem é você"', () => {
      const r = detectQuickReply('Quem é você?')
      expect(r).not.toBeNull()
      expect(r?.intent).toBe('identity')
    })

    it('detecta capabilities: "quais suas principais funções"', () => {
      const r = detectQuickReply('Quais são suas principais funções?')
      expect(r).not.toBeNull()
      expect(r?.intent).toBe('capabilities')
      expect(r?.reply).toContain('Buscar no acervo')
    })

    it('detecta capabilities: "o que você sabe fazer"', () => {
      const r = detectQuickReply('O que você sabe fazer?')
      expect(r?.intent).toBe('capabilities')
    })

    it('detecta capabilities: "o que vc faz"', () => {
      const r = detectQuickReply('O q vc faz?')
      expect(r?.intent).toBe('capabilities')
    })

    it('detecta how_it_works: "como funciona"', () => {
      const r = detectQuickReply('Como funciona?')
      expect(r?.intent).toBe('how_it_works')
    })

    it('detecta how_it_works: "como você funciona"', () => {
      const r = detectQuickReply('Como você funciona?')
      expect(r?.intent).toBe('how_it_works')
      expect(r?.reply).toContain('multi-agente')
    })

    it('detecta how_to_use: "como faço para buscar"', () => {
      const r = detectQuickReply('Como faço para buscar no acervo?')
      expect(r?.intent).toBe('how_to_use')
      expect(r?.reply.toLowerCase()).toContain('toggles')
    })

    it('detecta social: "oi"', () => {
      const r = detectQuickReply('Oi')
      expect(r?.intent).toBe('social_greeting')
    })

    it('detecta social: "obrigado"', () => {
      const r = detectQuickReply('Obrigado!')
      expect(r?.intent).toBe('social_thanks')
    })

    it('detecta social: "tchau"', () => {
      const r = detectQuickReply('Tchau')
      expect(r?.intent).toBe('social_bye')
    })

    it('NÃO responde para texto longo (pergunta jurídica complexa)', () => {
      const long = 'Preciso de uma análise detalhada sobre a aplicação do art. 37 da Constituição Federal em casos de nepotismo cruzado, considerando a jurisprudência recente do STF sobre a matéria, especialmente os julgados de 2024 e 2025 que reformularam o entendimento'
      expect(detectQuickReply(long)).toBeNull()
    })

    it('NÃO responde para string vazia', () => {
      expect(detectQuickReply('')).toBeNull()
    })
  })

  describe('isAboutItselfClient (compatibilidade)', () => {
    it('retorna true para qualquer categoria de quick reply', () => {
      expect(isAboutItselfClient('Quem é você?')).toBe(true)
      expect(isAboutItselfClient('Quais suas funções?')).toBe(true)
      expect(isAboutItselfClient('Como funciona?')).toBe(true)
      expect(isAboutItselfClient('Oi')).toBe(true)
    })
    it('retorna false para perguntas juridicas', () => {
      expect(isAboutItselfClient('Qual jurisprudência do STJ sobre X?')).toBe(false)
    })
  })

  describe('getIdentityResponseClient (compatibilidade)', () => {
    it('retorna resposta com COFRITO, CAOCIPP, MPRS', () => {
      const r = getIdentityResponseClient()
      expect(r).toContain('Cofrito')
      expect(r).toContain('CAOCIPP')
      expect(r).toContain('MPRS')
    })
  })
})
