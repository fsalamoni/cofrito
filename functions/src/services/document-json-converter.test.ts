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

  it('remove cabecalho/rodape institucional real (MP-RS) e reune paragrafo partido', () => {
    // Cada pagina do pdf-parse traz o cabecalho no topo e o rodape embaixo, em
    // linhas fisicas separadas (sem \f). O rodape muda so' no numero da pagina.
    const header = [
      'ESTADO DO RIO GRANDE DO SUL',
      'MINISTÉRIO PÚBLICO',
      'CAO DE PROTEÇÃO DO PATRIMÔNIO PÚBLICO E DA MORALIDADE ADMINISTRATIVA, CÍVEL, FAMÍLIA E SUCESSÕES',
      'Procedimento nº 00916.001.061/2025 — Procedimento de Gestão Administrativa',
    ]
    const footer = (pag: number) => [
      'Av. Aureliano de Figueiredo Pinto, 80 - 10º - Torre Norte, Bairro Praia de Belas, CEP 90050-190, Porto Alegre, Rio Grande do Sul',
      'Tel. (51) 32951024 ramal 1024 — E-mail caocivel@mprs.mp.br',
      'Documento assinado digitalmente ·  Chave: 000047293778@SIN · CRC: 26.1842.0248',
      `Procedimento 00916.001.061/2025  –  Evento 0014  –  Página ${pag}`,
    ]
    const page1 = [
      ...header,
      'Trata-se de consulta sobre nepotismo por afinidade em terceiro grau.',
      'A extinção da união estável, em razão do falecimento da tia, faz cessar',
      ...footer(1),
    ]
    const page2 = [
      ...header,
      'a relação de afinidade entre o prefeito e a nomeada, para fins da Súmula Vinculante 13.',
      'Em 2025 houve a contratação da sobrinha por afinidade (3º grau).',
      ...footer(2),
    ]
    const page3 = [
      ...header,
      'A Súmula Vinculante nº 13 do STF veda o nepotismo na administração pública.',
      ...footer(3),
    ]
    const text = [...page1, ...page2, ...page3].join('\n')
    const result = textToStructuredJsonV2(text, '009160010612025_-_Manifesta__o_Final.pdf', 3)

    // Cabecalho/rodape descartados
    expect(result.meta.headersRemoved).toBeGreaterThan(0)
    expect(result.fullText).not.toContain('ESTADO DO RIO GRANDE')
    expect(result.fullText).not.toContain('MINISTÉRIO PÚBLICO')
    expect(result.fullText).not.toContain('caocivel@mprs.mp.br')
    expect(result.fullText).not.toContain('CRC')
    expect(result.fullText).not.toContain('Página')
    expect(result.fullText).not.toContain('CAO DE PROTEÇÃO')
    // Paragrafo partido pela virada de pagina foi reunido
    expect(result.fullText).toContain('faz cessar a relação de afinidade entre o prefeito')
    // Conteudo preservado
    expect(result.fullText).toContain('Súmula Vinculante')
    expect(result.fullText).toContain('nepotismo por afinidade em terceiro grau')
  })

  it('reune palavra silabada na virada de pagina (hifen)', () => {
    const header = ['ÓRGÃO PÚBLICO XYZ', 'DEPARTAMENTO DE CONTROLE', 'Documento assinado digitalmente']
    const footer = (p: number) => ['Rua Exemplo, 100, CEP 90000-000', `Página ${p} de 3`]
    const p1 = [...header, 'O servidor exerceu funcao de chefia na adminis-', ...footer(1)]
    const p2 = [...header, 'tração pública municipal durante o exercício de 2024.', ...footer(2)]
    const p3 = [...header, 'Conclusão pela regularidade do ato.', ...footer(3)]
    const text = [...p1, ...p2, ...p3].join('\n')
    const result = textToStructuredJsonV2(text, 'doc.pdf', 3)
    expect(result.fullText).toContain('administração pública municipal')
    expect(result.fullText).not.toContain('adminis-')
    expect(result.fullText).not.toContain('Página')
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
