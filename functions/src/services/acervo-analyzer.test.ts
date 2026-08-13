/**
 * Testes do acervo-analyzer (versao agente unificado).
 *
 * Mock do LLM provider: o agente faz 1 UNICA chamada que retorna
 * as 3 skills (classification + ementa + key_points) em JSON.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./llm-providers', () => ({
  generateWithProvider: vi.fn(),
}))

import { generateWithProvider } from './llm-providers'
import { analyzeAcervoDoc } from './acervo-analyzer'

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

/**
 * Helper: monta o JSON unificado valido que o LLM deveria retornar.
 */
function unifiedJson(opts: {
  natureza?: string
  area_direito?: string[]
  assuntos?: string[]
  tipo_documento?: string
  contexto?: string[]
  tipo?: string
  assunto?: string
  sintese?: string
  areas?: string[]
  topicos?: string[]
  conclusao?: string
  keywords?: string[]
  items?: string[]
  reusable_content?: string
} = {}): string {
  return JSON.stringify({
    classification: {
      natureza: opts.natureza ?? 'consultivo',
      area_direito: opts.area_direito ?? ['Direito Administrativo'],
      assuntos: opts.assuntos ?? ['Nepotismo'],
      tipo_documento: opts.tipo_documento ?? 'Parecer',
      contexto: opts.contexto ?? ['Cargo em comissão'],
    },
    ementa: {
      tipo: opts.tipo ?? 'Parecer',
      assunto: opts.assunto ?? 'Nepotismo',
      sintese: opts.sintese ?? 'Análise de nepotismo cruzado.',
      areas: opts.areas ?? ['Direito Administrativo'],
      topicos: opts.topicos ?? ['SV 13', 'Cargo em comissão'],
      conclusao: opts.conclusao ?? 'Configurado nepotismo',
      keywords: opts.keywords ?? ['nepotismo', 'cargo político'],
    },
    key_points: {
      items: opts.items ?? ['Ponto 1', 'Ponto 2', 'Ponto 3'],
      reusable_content: opts.reusable_content ?? 'Trecho citável do documento...',
    },
  })
}

describe('acervo-analyzer (agente unificado)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('analyzeAcervoDoc', () => {
    it('faz APENAS 1 chamada LLM (nao 3 paralelas)', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: unifiedJson(),
        tokens: { input: 100, output: 200, total: 300 },
      })
      await analyzeAcervoDoc(mockInput)
      expect(generateWithProvider).toHaveBeenCalledTimes(1)  // <<< 1, nao 3
    })

    it('parseia o JSON unificado e distribui nas 3 skills', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: unifiedJson(),
        tokens: { input: 100, output: 200, total: 300 },
      })
      const result = await analyzeAcervoDoc(mockInput)
      expect(result.classification.natureza).toBe('consultivo')
      expect(result.ementa.assunto).toBe('Nepotismo')
      expect(result.keyPoints.items).toHaveLength(3)
    })

    it('extrai JSON de markdown code blocks', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: '```json\n' + unifiedJson() + '\n```',
        tokens: { input: 100, output: 200, total: 300 },
      })
      const result = await analyzeAcervoDoc(mockInput)
      expect(result.classification.natureza).toBe('consultivo')
    })

    it('extrai JSON de resposta com texto adicional ao redor', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: 'Aqui está a análise:\n\n' + unifiedJson() + '\n\nEspero ter ajudado!',
        tokens: { input: 100, output: 200, total: 300 },
      })
      const result = await analyzeAcervoDoc(mockInput)
      expect(result.ementa.assunto).toBe('Nepotismo')
    })

    it('valida natureza contra valores permitidos', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: unifiedJson({ natureza: 'invalido' }),
        tokens: { input: 100, output: 200, total: 300 },
      })
      const result = await analyzeAcervoDoc(mockInput)
      expect(result.classification.natureza).toBe('consultivo')  // fallback
    })

    it('limita key_points.items a 8', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: unifiedJson({ items: ['1','2','3','4','5','6','7','8','9','10','11'] }),
        tokens: { input: 100, output: 200, total: 300 },
      })
      const result = await analyzeAcervoDoc(mockInput)
      expect(result.keyPoints.items).toHaveLength(8)
    })

    it('limita reusable_content a 2000 chars', async () => {
      const longText = 'a'.repeat(5000)
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: unifiedJson({ reusable_content: longText }),
        tokens: { input: 100, output: 200, total: 300 },
      })
      const result = await analyzeAcervoDoc(mockInput)
      expect(result.keyPoints.reusableContent.length).toBe(2000)
    })

    it('adiciona keywords do filename na ementa.keywords', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: unifiedJson({ keywords: ['manual'] }),
        tokens: { input: 100, output: 200, total: 300 },
      })
      const result = await analyzeAcervoDoc({ ...mockInput, fileName: '20260811 - IMPROBIDADE. Servidor. Cargo.pdf' })
      expect(result.ementa.keywords).toContain('improbidade')
      expect(result.ementa.keywords).toContain('servidor')
      expect(result.ementa.keywords).toContain('cargo')
    })

    it('remove prefixo YYYYMMDD- do filename nas keywords', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: unifiedJson({ keywords: [] }),
        tokens: { input: 100, output: 200, total: 300 },
      })
      const result = await analyzeAcervoDoc({ ...mockInput, fileName: '20260811 - LAI. Acesso. Informação.pdf' })
      // '20260811' (8 chars) nao aparece, mas 'lai', 'acesso', 'informação' aparecem
      expect(result.ementa.keywords).not.toContain('20260811')
      expect(result.ementa.keywords).toContain('lai')
    })

    it('usa heuristica de fallback se LLM falhar (throw)', async () => {
      vi.mocked(generateWithProvider).mockRejectedValue(new Error('API indisponivel'))
      const result = await analyzeAcervoDoc(mockInput)
      // Heuristica SEMPRE retorna dados uteis (nunca defaults vazios)
      expect(result.classification.tipoDocumento).toBeTruthy()
      expect(result.classification.areaDireito.length).toBeGreaterThan(0)
      expect(result.ementa.tipo).toBeTruthy()
      expect(result.ementa.keywords.length).toBeGreaterThan(0)
      expect(result.keyPoints.items.length).toBeGreaterThan(0)
    })

    it('usa heuristica de fallback se resposta nao tem JSON', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: 'Desculpe, nao consegui analisar o documento.',
        tokens: { input: 100, output: 200, total: 300 },
      })
      const result = await analyzeAcervoDoc(mockInput)
      expect(result.classification.tipoDocumento).toBeTruthy()
      expect(result.ementa.tipo).toBeTruthy()
    })

    it('usa heuristica de fallback se JSON esta malformado', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: '{classification: "errado"}',  // aspas no lugar errado
        tokens: { input: 100, output: 200, total: 300 },
      })
      const result = await analyzeAcervoDoc(mockInput)
      expect(result.classification.tipoDocumento).toBeTruthy()
    })

    it('reporta tokens consumidos', async () => {
      vi.mocked(generateWithProvider).mockResolvedValueOnce({
        content: unifiedJson(),
        tokens: { input: 500, output: 350, total: 850 },
      })
      const result = await analyzeAcervoDoc(mockInput)
      expect(result.tokens).toEqual({ input: 500, output: 350, total: 850 })
    })

    it('reporta latencia', async () => {
      vi.mocked(generateWithProvider).mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 80))
        return { content: unifiedJson(), tokens: { input: 100, output: 200, total: 300 } }
      })
      const result = await analyzeAcervoDoc(mockInput)
      // Margem ampla para evitar flakiness em CI (timing pode oscilar)
      expect(result.totalLatencyMs).toBeGreaterThanOrEqual(40)
      expect(result.totalLatencyMs).toBeLessThan(500)
    })
  })
})


describe('acervo-analyzer com pipelineFlags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna classification null quando enableClassifier=false', async () => {
    vi.mocked(generateWithProvider).mockResolvedValueOnce({
      content: JSON.stringify({
        classification: { natureza: 'consultivo', areaDireito: [], assuntos: [], tipoDocumento: 'Parecer', contexto: [] },
        ementa: { tipo: 'Parecer', assunto: 'X', sintese: '', areas: [], topicos: [], conclusao: '', keywords: ['x'] },
        key_points: { items: ['P1'], reusable_content: 'trecho' },
      }),
      tokens: { input: 100, output: 200, total: 300 },
    })
    const result = await analyzeAcervoDoc({
      ...mockInput,
      pipelineFlags: { enableClassifier: false },
    })
    expect(result.classification).toBeNull()
    // Outros agentes ainda rodam
    expect(result.ementa).not.toBeNull()
    expect(result.keyPoints.items).toHaveLength(1)
  })

  it('retorna ementa null quando enableEmenta=false', async () => {
    vi.mocked(generateWithProvider).mockResolvedValueOnce({
      content: JSON.stringify({
        classification: { natureza: 'consultivo', areaDireito: [], assuntos: [], tipoDocumento: '', contexto: [] },
        ementa: { tipo: 'Parecer', assunto: 'X', sintese: '', areas: [], topicos: [], conclusao: '', keywords: [] },
        key_points: { items: [], reusable_content: '' },
      }),
      tokens: { input: 100, output: 200, total: 300 },
    })
    const result = await analyzeAcervoDoc({
      ...mockInput,
      pipelineFlags: { enableEmenta: false },
    })
    expect(result.ementa).toBeNull()
    expect(result.classification).not.toBeNull()
  })

  it('retorna keyPoints vazio quando enableKeyPoints=false', async () => {
    vi.mocked(generateWithProvider).mockResolvedValueOnce({
      content: JSON.stringify({
        classification: { natureza: 'consultivo', areaDireito: [], assuntos: [], tipo_documento: '', contexto: [] },
        ementa: { tipo: '', assunto: '', sintese: '', areas: [], topicos: [], conclusao: '', keywords: [] },
        key_points: { items: ['P1'], reusable_content: 't' },
      }),
      tokens: { input: 100, output: 200, total: 300 },
    })
    const result = await analyzeAcervoDoc({
      ...mockInput,
      pipelineFlags: { enableKeyPoints: false },
    })
    expect(result.keyPoints.items).toEqual([])
    expect(result.keyPoints.reusableContent).toBe('')
  })

  it('funciona normalmente sem pipelineFlags (default tudo ON)', async () => {
    vi.mocked(generateWithProvider).mockResolvedValueOnce({
      content: JSON.stringify({
        classification: { natureza: 'consultivo', area_direito: [], assuntos: [], tipo_documento: '', contexto: [] },
        ementa: { tipo: '', assunto: '', sintese: '', areas: [], topicos: [], conclusao: '', keywords: [] },
        key_points: { items: ['P1'], reusable_content: '' },
      }),
      tokens: { input: 100, output: 200, total: 300 },
    })
    const result = await analyzeAcervoDoc(mockInput)
    expect(result.classification).not.toBeNull()
    expect(result.ementa).not.toBeNull()
    expect(result.keyPoints.items).toHaveLength(1)
  })
})
