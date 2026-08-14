import { describe, it, expect } from 'vitest'
import { textToStructuredJsonV2, parseStructuredJson, resolveTextContent, serializeStructuredJson, getStructuredSections } from './document-json-converter'

describe('document-json-converter v2', () => {
  it('gera JSON v2 basico', () => {
    const text = `INFORMAÇÃO TÉCNICO-JURÍDICA. Objeto: Possibilidade de configuração de nepotismo na Santa Casa de Alegrete. O principio da moralidade exige transparencia.`
    const result = textToStructuredJsonV2(text, 'teste.pdf', 1)
    expect(result.v).toBe(2)
    expect(result.paragraphs.length).toBeGreaterThan(0)
    expect(result.fullText).toContain('nepotismo')
    expect(result.meta.headersRemoved).toBe(0)
  })

  it('remove headers/footers repetidos', () => {
    const pages = [
      `INFORMAÇÃO TÉCNICO-JURÍDICA. Texto da pagina 1 com conteudo relevante.`,
      `CABEÇALHO REPETIDO\nTexto da pagina 2 com conteudo relevante.\nRODAPÉ REPETIDO`,
      `CABEÇALHO REPETIDO\nTexto da pagina 3 com mais conteudo.\nRODAPÉ REPETIDO`,
      `CABEÇALHO REPETIDO\nTexto da pagina 4 com mais conteudo.\nRODAPÉ REPETIDO`,
    ]
    const text = pages.join('\f')
    const result = textToStructuredJsonV2(text, 'teste.pdf', 4)
    expect(result.meta.headersRemoved).toBeGreaterThan(0)
    expect(result.fullText).not.toContain('CABEÇALHO REPETIDO')
    expect(result.fullText).not.toContain('RODAPÉ REPETIDO')
  })

  it('junta paragrafos quebrados entre paginas', () => {
    const text = `O Ministerio Publico do Estado do Rio Grande do Sul,
UNIVERSIDADE FEDERAL, atraves de seu representante legal,
instaurou Inquerito Civil para apurar suposto ato de
improbidade administrativa em Alegrete.\fO caso envolve
nomeacao de parente para cargo em comissao.`
    const result = textToStructuredJsonV2(text, 'teste.pdf', 1)
    expect(result.meta.paragraphsJoined).toBeGreaterThan(0)
  })

  it('detecta secoes (titulos em CAIXA ALTA)', () => {
    const text = `DOCUMENTO INICIAL.
Texto do documento inicial.

INFORMACAO TECNICO-JURIDICA.
Texto da informacao relevante sobre o caso.

CONCLUSAO.
Texto da conclusao final.`
    const result = textToStructuredJsonV2(text, 'teste.pdf', 1)
    expect(result.sections.length).toBeGreaterThan(0)
    expect(result.sections.some(s => s.title.includes('INFORMACAO'))).toBe(true)
  })

  it('mantem compatibilidade com v1 (parseStructuredJson)', () => {
    const v1Json = JSON.stringify({
      v: 1,
      meta: { filename: 'teste.pdf', format: 'pdf', paragraphs: 1, charsOriginal: 10, charsStored: 10, compressionRatio: 0 },
      sections: [],
      fullText: 'Texto de teste',
    })
    const result = parseStructuredJson(v1Json)
    expect(result).not.toBeNull()
    expect(result?.v).toBe(2)
    expect(result?.fullText).toBe('Texto de teste')
  })

  it('resolveTextContent funciona para v1, v2 e legado', () => {
    const v1Json = JSON.stringify({
      v: 1,
      meta: { filename: 't', format: 'pdf', paragraphs: 0, charsOriginal: 5, charsStored: 5, compressionRatio: 0 },
      sections: [],
      fullText: 'conteudo v1 teste longo',
    })
    const v2 = serializeStructuredJson(textToStructuredJsonV2('conteudo v2 teste longo o suficiente', 't.pdf'))
    expect(resolveTextContent(v1Json)).toBe('conteudo v1 teste longo')
    expect(resolveTextContent(v2)).toBe('conteudo v2 teste longo o suficiente')
    expect(resolveTextContent('texto legado puro')).toBe('texto legado puro')
  })

  it('detect certification/heading/body types', () => {
    const text = `INFORMAÇÃO TÉCNICO-JURÍDICA
Conteudo do documento importante sobre Direito Constitucional.

Documento eletronico assinado digitalmente conforme MP no 2.200-2/2001 de 24/08/2001.`
    const result = textToStructuredJsonV2(text, 'teste.pdf', 1)
    const types = result.paragraphs.map(p => p.type)
    expect(types).toContain('certification')
  })

  it('getStructuredSections retorna secoes', () => {
    const v2 = serializeStructuredJson(textToStructuredJsonV2(`DOCUMENTO INICIAL.\n\nTexto do documento relevante.\n\nCONCLUSAO FINAL.\n\nTexto final relevante.`, 't.pdf'))
    const sections = getStructuredSections(v2)
    expect(sections.length).toBeGreaterThan(0)
  })
})
