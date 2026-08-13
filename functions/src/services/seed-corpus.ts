/**
 * Seed do Corpus — documentos institucionais fundacionais.
 *
 * Insere (apenas se nao existir) um conjunto de documentos base do CAOCIPP
 * no corpus, garantindo que o agente SEMPRE tenha material para responder
 * perguntas fundamentais (quem e o Cofrito, o que faz o CAOCIPP, etc).
 *
 * Esses documentos sao FUNDACIONAIS:
 *  - "Sobre o Cofrito" - explica o que e o agente, como funciona
 *  - "Sobre o CAOCIPP" - explica o que e o Centro de Apoio
 *  - "Como abrir consulta formal" - fluxo de consulta ao CAOCIPP
 *
 * Esses docs devem ser inseridos ANTES de qualquer outro doc.
 * Sao protegidos (admin-only) e nao podem ser deletados pelo front.
 */
import { logger } from 'firebase-functions'
import { getFirestore } from './firestore'

export const SEED_DOCS = [
  {
    id: 'seed-sobre-o-cofrito',
    fileName: 'Sobre o Cofrito.md',
    title: 'Sobre o Cofrito',
    type: 'manual-institucional',
    area: ['geral'],
    tags: ['cofrito', 'identidade', 'manual', 'ia-conversacional', 'auto-descricao'],
    content: `# Sobre o Cofrito

## O que é o Cofrito

O **Cofrito** é um agente de inteligência artificial conversacional criado
no âmbito do **CAOCIPP** (Centro de Apoio Operacional Cível e do Patrimônio
Público) do **Ministério Público do Estado do Rio Grande do Sul (MPRS)**.

O Cofrito foi desenvolvido a partir de 2026 pela equipe de Tecnologia da
Informação do MPRS, com curadoria de conteúdo e orientação de uso pelo
CAOCIPP, para auxiliar Promotores de Justiça, Procuradores, Analistas,
Assistentes e demais usuários autorizados a localizar e compreender o
material institucional do Centro de Apoio.

## Para que serve

O Cofrito ajuda você a:

1. **Localizar material no acervo do CAOCIPP** — atos normativos
   (Provimentos, Ordens de Serviço, Recomendações), teses compiladas,
   modelos de parecer, FAQ, doutrina indexada, legislação correlata.

2. **Compreender o material institucional** — o agente lê e resume o
   conteúdo dos documentos do acervo, sempre com citação literal do
   trecho e referência ao documento de origem.

3. **Navegar pelo acervo** — busca por palavras-chave, similaridade
   semântica, área de atuação, tipo de documento.

4. **Identificar rapidamente** se há (ou não há) material do CAOCIPP
   sobre determinado tema, sem precisar vasculhar manualmente.

5. **Formular consultas formais** ao CAOCIPP quando o material
   disponível for insuficiente — o agente pode abrir o procedimento
   de consulta formal diretamente.

## O que o Cofrito NÃO faz

Para evitar confusões, o Cofrito tem limites explícitos:

- **Não emite pareceres jurídicos novos.** As manifestações do CAOCIPP
  são meramente sugestivas e feitas por Promotores de Justiça, conforme
  a Ordem de Serviço nº 002/2015 (art. 2º, IV). O Cofrito é uma
  ferramenta de **localização e orientação**, não de produção de
  conteúdo.

- **Não substitui a análise humana** do Promotor de Justiça. Quando
  o caso exige análise crítica, considere abrir uma consulta formal
  ao CAOCIPP.

- **Não analisa casos concretos.** O Cofrito identifica e transcreve
  material do acervo, mas não faz análise fático-probatória de
  situações específicas.

- **Não inventa informação jurídica.** Se não há material no acervo
  sobre um tema, o Cofrito diz isso claramente — em vez de "chutar"
  com base em conhecimento geral.

- **Não cita leis, súmulas ou doutrinadores que não estejam no
  material fornecido.** Toda citação vem do acervo, com link para
  o documento original.

## Como funciona (resumo técnico)

O Cofrito roda como aplicação web em **cofrito.web.app**, hospedada no
**Firebase** (Hosting + Cloud Functions Gen 2 + Firestore).

A camada de IA conversacional é **multi-agente**:

1. **Orquestrador** — analisa a pergunta do usuário e planeja a pesquisa
   (quais pontos investigar, quais fontes consultar).
2. **Pesquisador interno** — busca no corpus do CAOCIPP usando 3 camadas:
   - Filtro por palavras-chave estruturadas (custo zero)
   - Similaridade por embeddings (custo de 1 embedding)
   - Rerank semântico com LLM (só se houver ambiguidade)
3. **Pesquisador externo** (opcional) — busca em fontes públicas
   (Tavily, Serper, Brave, Perplexity) ou no DataJud, se o usuário ativar
   essa opção.
4. **Compilador** — organiza as fontes encontradas.
5. **Redator jurídico** — elabora a resposta final em markdown, com
   citações literais dos trechos relevantes.
6. **Crítico** — avalia a resposta e pode pedir uma iteração se a
   qualidade for insuficiente.

Cada documento novo enviado para o acervo passa por **análise
automática** com o mesmo LLM, que gera:

- **Classificação** — natureza (consultivo/executório/etc), área do
  direito, assuntos, tipo de documento.
- **Ementa** — síntese estruturada com palavras-chave.
- **Pontos relevantes** — bullet points e trecho citável.

O usuário pode acompanhar o transcorrer do raciocínio do agente em
tempo real pela **timeline visível** (mostra thinking, planning,
searching-acervo, searching-web, answering).

## Como usar

1. Faça login com sua conta Google (precisa ser conta autorizada pelo
   MPRS).
2. Aceite o termo de uso.
3. Digite sua pergunta na barra do chat.
4. Acompanhe a timeline enquanto o agente processa.
5. Leia a resposta com as citações linkadas aos documentos originais.
6. Se quiser, abra uma **consulta formal** ao CAOCIPP usando o botão
   no canto da resposta.

## Em que posso ajudar?

Posso ajudar com:

- Buscar no acervo do CAOCIPP atos normativos, teses, modelos e FAQ
- Identificar legislação federal/estadual sobre matérias cíveis e
  patrimônio público
- Localizar pareceres-modelo sobre temas específicos
- Abrir uma consulta formal ao CAOCIPP, se preferir análise humana
- Esclarecer dúvidas sobre o próprio CAOCIPP e seus procedimentos
- Responder perguntas sobre o que é o Cofrito, como funciona, quem
  pode usar, etc.

## Quem mantém o Cofrito

- **Coordenação e curadoria de conteúdo:** CAOCIPP do MPRS
- **Desenvolvimento técnico:** equipe de TI do MPRS
- **Padrões de qualidade:** baseados em Ordem de Serviço nº 002/2015
  e Provimento PGJ nº 33/2017

## Contato

Em caso de dúvidas sobre o Cofrito, entre em contato com o CAOCIPP
pelo canal institucional do MPRS.
`,
  },
  {
    id: 'seed-sobre-o-caocipp',
    fileName: 'Sobre o CAOCIPP.md',
    title: 'Sobre o CAOCIPP',
    type: 'ato',
    area: ['geral'],
    tags: ['caocipp', 'identidade', 'estrutura', 'mprs'],
    content: `# Sobre o CAOCIPP

## O que é o CAOCIPP

O **CAOCIPP** (Centro de Apoio Operacional Cível e do Patrimônio Público)
é um órgão auxiliar do Ministério Público do Estado do Rio Grande do Sul
(MPRS), vinculado à Procuradoria-Geral de Justiça.

Sua missão institucional é prestar apoio técnico-jurídico, informativo e
operacional aos Promotores de Justiça que atuam nas áreas cível e de
patrimônio público.

## Atribuições principais

Conforme a **Ordem de Serviço nº 002/2015** e o **Provimento PGJ nº
33/2017**, são atribuições do CAOCIPP:

- Prestar apoio técnico aos Promotores de Justiça nas áreas cível e
  de patrimônio público
- Subsidiar a atuação dos Promotores de Justiça em juizados especiais
  e causas cíveis
- Manifestar-se, quando provocado, em consultas institucionais
- Auxiliar no planejamento e execução de projetos institucionais na
  área cível
- Manter banco de teses, modelos de peças, atos normativos
- Acompanhar a produção legislativa federal e estadual
- Manter intercâmbio com outros Ministérios Públicos

## O que o CAOCIPP NÃO faz

O CAOCIPP é meramente sugestivo. Conforme o art. 2º, IV da Ordem de
Serviço nº 002/2015, as manifestações do CAOCIPP **não vinculam** a
atuação dos Promotores de Justiça, que têm independência funcional.

## Como abrir consulta formal ao CAOCIPP

O Promotor de Justiça interessado pode abrir consulta formal diretamente
pelo sistema do MPRS ou pelo Cofrito (agente de IA do CAOCIPP).

A consulta formal é respondida por Promotores de Justiça designados,
que emitem manifestação técnica escrita.

## Contato

- **Endereço:** sede da Procuradoria-Geral de Justiça, Porto Alegre/RS
- **Telefone:** (canal institucional do MPRS)
- **Sistema:** MPRS Online / Cofrito (este agente)
`,
  },
  {
    id: 'seed-como-abrir-consulta-formal',
    fileName: 'Como abrir consulta formal ao CAOCIPP.md',
    title: 'Como abrir consulta formal ao CAOCIPP',
    type: 'manual',
    area: ['geral'],
    tags: ['consulta-formal', 'fluxo', 'procedimento', 'caocipp'],
    content: `# Como abrir consulta formal ao CAOCIPP

## Quando abrir uma consulta formal

Abra uma consulta formal ao CAOCIPP quando:

- O material do acervo (atos, teses, modelos) for insuficiente para a
  sua necessidade
- Você precisa de **análise técnica específica** do CAOCIPP sobre um
  caso ou tema
- Você quer **validação institucional** da sua linha de atuação
- Você tem uma **dúvida jurídica nova** que não está coberta pelo
  acervo

## Como abrir

### Pelo Cofrito (este agente)

1. Digite sua pergunta no chat
2. Se a resposta do agente apontar que não há material suficiente
   sobre o tema, ele oferece automaticamente a opção de abrir
   consulta formal
3. Clique no botão "Abrir consulta formal" que aparece na resposta
4. Preencha o formulário com:
   - Assunto (resumo do tema)
   - Questão objetiva (a pergunta específica)
   - Contexto fático (opcional — descreva a situação concreta se
     houver)
5. Envie — a consulta será registrada e respondida por Promotor
   designado

### Pelo sistema institucional do MPRS

Acesse o MPRS Online → módulo de consultas formais → preencha o
formulário padrão.

## Prazo de resposta

O prazo médio de resposta é de 5 a 10 dias úteis, podendo variar
conforme a complexidade e a demanda.

## Status da consulta

- **Pendente** — registrada, aguardando triagem
- **Em análise** — Promotor designado trabalhando
- **Respondida** — manifestação técnica disponível
- **Arquivada** — caso tenha sido resolvido por outros meios

## Após a resposta

A resposta do CAOCIPP é **meramente sugestiva** (art. 2º, IV da OS
002/2015). Você tem independência funcional para seguir, ou não, a
orientação técnica, mediante motivação.
`,
  },
]

/**
 * Insere os documentos seed no Firestore, APENAS SE nao existirem.
 * Idempotente: pode ser chamado multiplas vezes sem duplicar.
 *
 * Cria a estrutura padrao do corpus V1 (Fase 2a) e o classification +
 * ementa + keyPoints (Fase 2b) para que sejam pesquisaveis.
 */
export async function ensureSeedCorpus(): Promise<{
  created: number
  skipped: number
}> {
  const db = getFirestore()
  let created = 0
  let skipped = 0

  for (const seed of SEED_DOCS) {
    const docRef = db.doc(`corpus/${seed.id}`)
    const existing = await docRef.get()
    if (existing.exists) {
      logger.info('seed-corpus.skip', { id: seed.id })
      skipped++
      continue
    }

    const now = new Date()
    const searchKeywords = [
      'cofrito', 'caocipp', 'identidade', 'manual', 'institucional',
      'sobre', 'agente', 'conversacional', 'ia', 'inteligencia',
      'mprs', 'centro', 'apoio', 'operacional', 'civel', 'patrimonio',
      seed.id.replace('seed-', ''),
    ]

    await docRef.set({
      id: seed.id,
      title: seed.title,
      fileName: seed.fileName,
      type: seed.type,
      area: seed.area,
      tags: seed.tags,
      status: 'ativo',
      version: 1,
      fullText: seed.content,
      summary: seed.content.slice(0, 240),
      classification: {
        natureza: 'consultivo',
        areaDireito: ['Direito Institucional'],
        assuntos: ['CAOCIPP', 'Cofrito', 'Identidade'],
        tipoDocumento: seed.type,
        contexto: ['Documento institucional fundacional'],
      },
      ementa: {
        tipo: 'Manual',
        assunto: seed.title,
        sintese: seed.content.slice(0, 200),
        areas: ['Direito Institucional'],
        topicos: seed.tags,
        conclusao: `Documento institucional sobre ${seed.title.toLowerCase()}.`,
        keywords: searchKeywords,
      },
      keyPoints: {
        items: [
          `Documento institucional fundacional: ${seed.title}`,
          `Tags: ${seed.tags.join(', ')}`,
          'Disponivel como referencia para o agente do Cofrito',
        ],
        reusableContent: seed.content.slice(0, 1000),
      },
      searchKeywords,
      source: 'seed-corpus',
      storagePath: null,
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
    })
    // Cria 1 chunk para o doc
    const chunkRef = docRef.collection('chunks').doc('chunk-0')
    await chunkRef.set({
      text: seed.content,
      section: seed.title,
      position: 0,
      tokens: Math.ceil(seed.content.length / 4),
      type: seed.type,
      area: seed.area,
      tags: seed.tags,
      documentId: seed.id,
      documentTitle: seed.title,
      searchKeywords,
      createdAt: now,
    })
    logger.info('seed-corpus.created', { id: seed.id })
    created++
  }

  logger.info('seed-corpus.done', { created, skipped })
  return { created, skipped }
}
