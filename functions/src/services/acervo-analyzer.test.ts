/**
 * Testes do acervo-analyzer.
 *
 * Mockamos o LLM provider para evitar chamadas reais.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock do LLM provider
vi.mock('./llm-providers', () => ({
  generateWithProvider: vi.fn(),
}))

import { generateWithProvider } from './llm-providers'
import {
  classifyAcervoDoc,
  generateEmentaForAcervo,
  extractKeyPointsForAcervo,
  analyzeAcervoDoc,
} from './acervo-analyzer'

const mockLLM = {
  provider: 'openrouter' as const,
  model: 'test-model',
  apiKey: 'test-key',
}

const mockInput = {
  uid: 'user-1',
  docId: 'doc-1',
  fileName: 'parecer_nepotismo.pdf',
  text: 'Este parecer trata de nepotismo no serviço público...',
  llmConfig: mockLLM,
}

describe('acervo-analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('classifyAcervoDoc', () => {
    it('parseia resposta JSON valida do classificador', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: JSON.stringify({
          natureza: 'consultivo',
          area_direito: ['Direito Administrativo'],
          assuntos: ['Nepotismo'],
          tipo_documento: 'Parecer',
          contexto: ['Cargo em comissão'],
        }),
        tokens: { input: 100, output: 50, total: 150 },
      })
      const result = await classifyAcervoDoc(mockInput)
      expect(result.natureza).toBe('consultivo')
      expect(result.areaDireito).toContain('Direito Administrativo')
      expect(result.assuntos).toContain('Nepotismo')
      expect(result.tipoDocumento).toBe('Parecer')
    })

    it('extrai JSON de markdown code blocks', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: '```json\n{"natureza":"decisorio","area_direito":[],"assuntos":[],"tipo_documento":"Sentença","contexto":[]}\n```',
        tokens: { input: 100, output: 50, total: 150 },
      })
      const result = await classifyAcervoDoc(mockInput)
      expect(result.natureza).toBe('decisorio')
      expect(result.tipoDocumento).toBe('Sentença')
    })

    it('retorna default se JSON invalido', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: 'isso nao e json',
        tokens: { input: 100, output: 50, total: 150 },
      })
      const result = await classifyAcervoDoc(mockInput)
      expect(result.natureza).toBe('consultivo')  // default
    })

    it('valida natureza contra valores permitidos', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: JSON.stringify({ natureza: 'invalido', area_direito: [], assuntos: [], tipo_documento: '', contexto: [] }),
        tokens: { input: 100, output: 50, total: 150 },
      })
      const result = await classifyAcervoDoc(mockInput)
      expect(result.natureza).toBe('consultivo')  // fallback
    })
  })

  describe('generateEmentaForAcervo', () => {
    it('parseia ementa valida', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: JSON.stringify({
          tipo: 'Parecer',
          assunto: 'Nepotismo',
          sintese: 'Análise de caso de nepotismo cruzado',
          areas: ['Direito Administrativo'],
          topicos: ['SV 13', 'Cargo em comissão'],
          conclusao: 'Configurado nepotismo',
          keywords: ['nepotismo', 'cargo político'],
        }),
        tokens: { input: 100, output: 80, total: 180 },
      })
      const result = await generateEmentaForAcervo(mockInput)
      expect(result.tipo).toBe('Parecer')
      expect(result.assunto).toBe('Nepotismo')
      expect(result.keywords).toContain('nepotismo')
    })

    it('adiciona keywords do filename', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: JSON.stringify({
          tipo: 'Outro', assunto: '', sintese: '', areas: [], topicos: [], conclusao: '',
          keywords: ['manual'],
        }),
        tokens: { input: 100, output: 80, total: 180 },
      })
      const result = await generateEmentaForAcervo({ ...mockInput, fileName: '20260811 - IMPROBIDADE. Servidor. Cargo.pdf' })
      expect(result.keywords).toContain('improbidade')
      expect(result.keywords).toContain('servidor')
      expect(result.keywords).toContain('cargo')
    })

    it('retorna default se LLM falhar', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({ content: '', tokens: { input: 0, output: 0, total: 0 } })
      const result = await generateEmentaForAcervo(mockInput)
      expect(result.tipo).toBe('Outro')
      expect(result.keywords).toEqual([])
    })
  })

  describe('extractKeyPointsForAcervo', () => {
    it('parseia key points validos', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: JSON.stringify({
          key_points: ['Ponto 1', 'Ponto 2', 'Ponto 3'],
          reusable_content: 'Trecho citável do documento...',
        }),
        tokens: { input: 100, output: 80, total: 180 },
      })
      const result = await extractKeyPointsForAcervo(mockInput)
      expect(result.items).toHaveLength(3)
      expect(result.reusableContent).toContain('citável')
    })

    it('limita key_points a 8', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: JSON.stringify({
          key_points: ['1','2','3','4','5','6','7','8','9','10','11'],
          reusable_content: '',
        }),
        tokens: { input: 100, output: 80, total: 180 },
      })
      const result = await extractKeyPointsForAcervo(mockInput)
      expect(result.items).toHaveLength(8)
    })
  })

  describe('analyzeAcervoDoc (orquestrador paralelo)', () => {
    it('roda os 3 agentes em paralelo e consolida resultado', async () => {
      vi.mocked(generateWithProvider)
        .mockResolvedValueOnce({ content: JSON.stringify({ natureza: 'consultivo', area_direito: [], assuntos: [], tipo_documento: 'Parecer', contexto: [] }), tokens: { input: 100, output: 50, total: 150 } })
        .mockResolvedValueOnce({ content: JSON.stringify({ tipo: 'Parecer', assunto: 'Nepotismo', sintese: '', areas: [], topicos: [], conclusao: '', keywords: ['nepotismo'] }), tokens: { input: 100, output: 80, total: 180 } })
        .mockResolvedValueOnce({ content: JSON.stringify({ key_points: ['P1'], reusable_content: 'trecho' }), tokens: { input: 100, output: 50, total: 150 } })

      const result = await analyzeAcervoDoc(mockInput)
      expect(result.classification.natureza).toBe('consultivo')
      expect(result.ementa.assunto).toBe('Nepotismo')
      expect(result.keyPoints.items).toEqual(['P1'])
    })

    it('retorna defaults se todos os agentes falharem', async () => {
      vi.mocked(generateWithProvider).mockRejectedValue(new Error('LLM indisponivel'))
      const result = await analyzeAcervoDoc(mockInput)
      expect(result.classification.natureza).toBe('consultivo')
      expect(result.ementa.tipo).toBe('Outro')
      expect(result.keyPoints.items).toEqual([])
    })
  })
})
