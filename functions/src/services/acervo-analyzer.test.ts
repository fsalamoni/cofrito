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

// ── Testes da nova estrutura (ementa juridica + pontos relevantes detalhados) ──

describe('acervo-analyzer v2 (ementa juridica + pontos detalhados)', () => {
  it('ementa com numero, data, autor, destinatario', async () => {
    vi.mocked(generateWithProvider).mockResolvedValueOnce({
      content: JSON.stringify({
        classification: { natureza: 'consultivo', area_direito: ['Direito Administrativo'], assuntos: ['Nepotismo'], tipo_documento: 'Parecer', contexto: [] },
        ementa: {
          tipo: 'Parecer',
          tipo_documento: 'Parecer informativo',
          numero: '007/2024',
          data: '2024-03-15',
          autor: 'CAOCIPP',
          destinatario: 'PJ Comarca X',
          assunto: 'Nepotismo',
          sintese: 'Consulta sobre nepotismo na Santa Casa.',
          fundamentacao: 'Art. 37, XI, CF/88 e SV 13 STF.',
          areas: ['Direito Administrativo'],
          topicos: ['SV 13'],
          conclusao: 'Ha indicios de nepotismo.',
          keywords: ['nepotismo', 'SV 13'],
          materias: ['nepotismo', 'improbidade'],
        },
        key_points: { items: [], pessoas_envolvidas: [], relacionamentos: [], citacoes_juridicas: [], reusable_content: '' },
      }),
      tokens: { input: 100, output: 200, total: 300 },
    })
    const result = await analyzeAcervoDoc(mockInput)
    expect(result.ementa?.numero).toBe('007/2024')
    expect(result.ementa?.data).toBe('2024-03-15')
    expect(result.ementa?.autor).toBe('CAOCIPP')
    expect(result.ementa?.destinatario).toBe('PJ Comarca X')
    expect(result.ementa?.materias).toContain('nepotismo')
  })

  it('key_points.items com categoria e tags', async () => {
    vi.mocked(generateWithProvider).mockResolvedValueOnce({
      content: JSON.stringify({
        classification: { natureza: 'consultivo', area_direito: [], assuntos: [], tipo_documento: 'Parecer', contexto: [] },
        ementa: { tipo: 'Parecer', assunto: 'Nepotismo', sintese: '', areas: [], topicos: [], conclusao: '', keywords: [] },
        key_points: {
          items: [
            { categoria: 'fato_principal', titulo: 'Nomeacao irregular', descricao: 'Prefeito nomeou irmao', tags: ['nepotismo'] },
            { categoria: 'relacionamento', titulo: 'Parentesco', descricao: 'Irmaos', tags: ['parentesco'] },
          ],
          pessoas_envolvidas: [],
          relacionamentos: [],
          citacoes_juridicas: [],
          reusable_content: '',
        },
      }),
      tokens: { input: 100, output: 200, total: 300 },
    })
    const result = await analyzeAcervoDoc(mockInput)
    expect(result.keyPoints.items).toHaveLength(2)
    expect(result.keyPoints.items[0].categoria).toBe('fato_principal')
    expect(result.keyPoints.items[0].tags).toContain('nepotismo')
  })

  it('key_points.pessoasEnvolvidas, relacionamentos, citacoesJuridicas', async () => {
    vi.mocked(generateWithProvider).mockResolvedValueOnce({
      content: JSON.stringify({
        classification: { natureza: 'consultivo', area_direito: [], assuntos: [], tipo_documento: 'Parecer', contexto: [] },
        ementa: { tipo: 'Parecer', assunto: 'Nepotismo', sintese: '', areas: [], topicos: [], conclusao: '', keywords: [] },
        key_points: {
          items: [],
          pessoas_envolvidas: [
            { nome: 'Joao Silva', cargo: 'Prefeito', papel: 'autoridade', contexto: 'Gestor 2021-2024' },
            { nome: 'Maria Silva', cargo: 'Secretaria', papel: 'servidor', contexto: 'Irma do prefeito' },
          ],
          relacionamentos: [
            { tipo: 'parentesco_consanguineo', grau: 'irmao', pessoas: ['Joao Silva', 'Maria Silva'], descricao: 'Irmaos' },
          ],
          citacoes_juridicas: [
            { tipo: 'legislacao', referencia: 'Art. 37, XI, CF/88', interpretacao: 'Vedacao ao nepotismo' },
            { tipo: 'sumula', referencia: 'SV 13 STF', interpretacao: 'Vedacao conjugue/parente' },
          ],
          reusable_content: 'INFORMACAO TECNICO-JURIDICA...',
        },
      }),
      tokens: { input: 100, output: 200, total: 300 },
    })
    const result = await analyzeAcervoDoc(mockInput)
    expect(result.keyPoints.pessoasEnvolvidas).toHaveLength(2)
    expect(result.keyPoints.pessoasEnvolvidas[0].papel).toBe('autoridade')
    expect(result.keyPoints.relacionamentos).toHaveLength(1)
    expect(result.keyPoints.relacionamentos[0].grau).toBe('irmao')
    expect(result.keyPoints.citacoesJuridicas).toHaveLength(2)
    expect(result.keyPoints.reusableContent).toContain('INFORMACAO')
  })

  it('getHeuristicAnalysis gera dados ricos para nepotismo', async () => {
    const { getHeuristicAnalysis } = await import('./acervo-analyzer')
    const text = `O prefeito Joao Silva nomeou seu irmao Pedro Silva para cargo em comissao. O irmao do prefeito recebeu R$ 8.000. Configura nepotismo conforme Art. 37, XI, CF/88 e SV 13 STF.`
    const result = getHeuristicAnalysis('007110004292025 - Manifesta.pdf', text)
    expect(result.ementa.tipo).toBe("Outro")
    expect(result.keyPoints.citacoesJuridicas.length).toBeGreaterThan(0)
    expect(result.keyPoints.citacoesJuridicas.length).toBeGreaterThan(0)
  })
})
