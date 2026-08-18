import { describe, it, expect, vi } from 'vitest'

// Mock do acervo (corpus) com docs analisados (classification + ementa + keyPoints)
const mockDocs: Array<{ id: string; data: () => any }> = [
  {
    id: 'doc-nepotismo',
    data: () => ({
      fileName: '009160010612025_-_Manifesta__o_Final.pdf',
      title: 'Informação Técnico-Jurídica sobre nepotismo',
      type: 'parecer',
      area: ['Direito Administrativo'],
      classification: {
        natureza: 'consultivo',
        areaDireito: ['Direito Administrativo'],
        assuntos: ['Nepotismo', 'Cargo em comissão'],
        tipoDocumento: 'Informação Técnico-Jurídica',
      },
      ementa: {
        assunto: 'Nepotismo por afinidade',
        sintese: 'Contratação de sobrinha da ex-companheira falecida do prefeito.',
        fundamentacao: 'Súmula Vinculante 13 do STF veda nepotismo até terceiro grau por afinidade.',
        conclusao: 'Configurado nepotismo; a nomeação deve ser anulada.',
        keywords: ['nepotismo', 'sobrinha', 'afinidade', 'sv13'],
      },
      keyPoints: {
        items: [{ titulo: 'Parentesco por afinidade em 3º grau', descricao: 'sobrinha da companheira' }],
      },
      updatedAt: new Date().toISOString(),
    }),
  },
  {
    id: 'doc-tributario',
    data: () => ({
      fileName: 'tributacao.pdf',
      title: 'Parecer tributário',
      type: 'parecer',
      classification: { natureza: 'consultivo', areaDireito: ['Direito Tributário'], assuntos: ['ICMS'], tipoDocumento: 'Parecer' },
      ementa: { assunto: 'ICMS', sintese: 'Base de cálculo do ICMS na importação.', keywords: ['icms', 'importação'] },
      keyPoints: { items: [] },
      updatedAt: new Date().toISOString(),
    }),
  },
]

vi.mock('./firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      select: () => ({
        limit: () => ({
          get: async () => ({ docs: mockDocs.map(d => ({ id: d.id, data: d.data })) }),
        }),
      }),
    }),
  }),
}))

import { retrieveRelevantChunks } from './retrieval'

describe('retrieveRelevantChunks (busca por metadados do acervo)', () => {
  it('encontra o documento de nepotismo para a consulta do usuario', async () => {
    const chunks = await retrieveRelevantChunks('Há material sobre nepotismo envolvendo sobrinha?', { topK: 5 })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0].docId).toBe('doc-nepotismo')
    // a similaridade do melhor resultado passa o corte padrao (0.55)
    expect(chunks[0].similarity).toBeGreaterThanOrEqual(0.55)
    // o texto do chunk traz conteudo para o LLM discorrer
    expect(chunks[0].text).toContain('Nepotismo')
    expect(chunks[0].text.toLowerCase()).toContain('súmula vinculante 13'.toLowerCase())
  })

  it('encontra por "contratação de filha" (afinidade/parentesco)', async () => {
    const chunks = await retrieveRelevantChunks('Procuro material sobre nepotismo, relacionado a contratação de filha.', { topK: 5 })
    expect(chunks.some(c => c.docId === 'doc-nepotismo')).toBe(true)
  })

  it('retorna vazio quando nada casa (deixa o pipeline decidir o fallback)', async () => {
    const chunks = await retrieveRelevantChunks('receita de bolo de cenoura', { topK: 5 })
    expect(chunks).toEqual([])
  })

  it('respeita topK', async () => {
    const chunks = await retrieveRelevantChunks('parecer consultivo', { topK: 1 })
    expect(chunks.length).toBeLessThanOrEqual(1)
  })
})
