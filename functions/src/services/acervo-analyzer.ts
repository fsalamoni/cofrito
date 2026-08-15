/**
 * Acervo Analyzer — analise automatica de documentos do acervo via LLM.
 *
 * ARQUITETURA: agente unico com 3 skills (classification + ementa + keyPoints)
 * executadas em UMA UNICA chamada LLM, retornando JSON estruturado.
 *
 * Skills:
 *  - classification: tags estruturadas (natureza, area, assuntos, tipo, contexto)
 *  - ementa: ementa JURIDICA completa (sintese, fundamentacao, conclusao, materias, topicos)
 *  - keyPoints: pontos relevantes DETALHADOS (pessoas, vinculos, fundamentos, citacoes, decisao)
 *
 * Por que agente unico (em vez de 3 agentes paralelos)?
 *  - 1 round-trip a API (em vez de 3) = ~3x menos latencia
 *  - texto enviado 1 vez = ~3x menos tokens de input
 *  - 1 cadeia de raciocinio coerente (em vez de 3 independentes que podem contradizer)
 *  - usa o LLM config JA CARREGADO (do configToUse global do admin)
 *
 * Porta os prompts da Lexio (https://github.com/fsalamoni/Lexio).
 */
import { logger } from 'firebase-functions'
import { generateWithProvider, type LLMConfigLike } from './llm-providers'

// ── Tipos ──────────────────────────────────────────────────────────────

export type Natureza = 'consultivo' | 'executorio' | 'transacional' | 'negocial' | 'doutrinario' | 'decisorio'

export interface Classification {
  natureza: Natureza
  areaDireito: string[]
  assuntos: string[]
  tipoDocumento: string
  contexto: string[]
}

/**
 * Ementa juridica completa do documento.
 * Estrutura inspirada na pratica juridica brasileira (CAO/MP-RS).
 */
export interface Ementa {
  /** Tipo generico do documento (Parecer, Sentenca, Acordao, etc) */
  tipo: string
  /** Tipo especifico (parecer informativo, sentenca absolutoria, etc) */
  tipoDocumento?: string
  /** Numero do documento (se houver) */
  numero?: string
  /** Data do documento (ISO) */
  data?: string
  /** Autor / origem (quem produziu) */
  autor?: string
  /** Destinatario (a quem se dirige) */
  destinatario?: string
  /** Tema principal em 1-2 palavras (para busca) */
  assunto: string
  /** Sintese curta do caso (1-3 frases) */
  sintese: string
  /** Fundamentacao juridica principal (tese, ratio, argumentos) */
  fundamentacao: string
  /** Areas do direito envolvidas */
  areas: string[]
  /** Topicos / materias especificas (SV 13, etc) */
  topicos: string[]
  /** Conclusao em 1-2 frases */
  conclusao: string
  /** Palavras-chave para busca (incluindo sinonimos) */
  keywords: string[]
  /** Materias para busca semantica no chat (tags mais amplas) */
  materias: string[]
}

/**
 * Pessoas envolvidas no caso (partes, autoridades, testemunhas, etc).
 */
export interface PersonEnvolvida {
  /** Nome (pode ser "anonimo" se nao identificado) */
  nome: string
  /** Cargo / funcao / papel no caso */
  cargo?: string
  /** Tipo de vinculo (autoridade, servidor, particular, testemunha, etc) */
  papel: 'autoridade' | 'servidor' | 'particular' | 'investigado' | 'denunciante' | 'testemunha' | 'parte' | 'advogado' | 'membro_mp' | 'membro_poder_judiciario' | 'outro'
  /** Contexto da participacao (ex: "nomeado em 2023", "contratou sem licitacao") */
  contexto?: string
}

/**
 * Relacao familiar ou de proximidade mapeada no caso.
 */
export interface Relacionamento {
  /** Tipo de vinculo (parentesco, afinidade, amizade, compadrio, etc) */
  tipo: 'parentesco_consanguineo' | 'parentesco_afim' | 'conjugue' | 'uniao_estavel' | 'amizade' | 'compadrio' | 'societario' | 'profissional' | 'politico' | 'outro'
  /** Grau de parentesco (se aplicavel) */
  grau?: string
  /** Pessoas envolvidas (nomes ou identificadores) */
  pessoas: string[]
  /** Descricao breve do vinculo */
  descricao?: string
}

/**
 * Citacao a dispositivo legal, sumula ou precedente.
 */
export interface CitacaoJuridica {
  /** Tipo: legislacao, sumula, jurisprudencia, doutrina */
  tipo: 'legislacao' | 'sumula' | 'jurisprudencia' | 'doutrina' | 'outro'
  /** Referencia completa (ex: "Art. 37, XI, CF/88", "SV 13 STF", "Tema 1018 RG") */
  referencia: string
  /** Citacao literal do texto (se houver) */
  citacao?: string
  /** Tese/interpretacao aplicada */
  interpretacao?: string
}

/**
 * Ponto relevante detalhado.
 * NAO apenas resumo superficial: cada ponto mapeia o que torna o caso UNICO.
 */
export interface PontoRelevante {
  /** Categoria do ponto */
  categoria: 'fato_principal' | 'pessoa_envolvida' | 'relacionamento' | 'fundamento_juridico' | 'prova' | 'decisao' | 'circunstancia' | 'observacao'
  /** Titulo do ponto (1 frase curta) */
  titulo: string
  /** Descricao detalhada */
  descricao: string
  /** Citacao literal (se houver) */
  citacao?: string
  /** Trecho reutilizavel (100-500 chars, linguagem original) */
  trechoReutilizavel?: string
  /** Tags do ponto */
  tags: string[]
}

export interface KeyPoints {
  /** Lista de pontos relevantes detalhados */
  items: PontoRelevante[]
  /** Pessoas envolvidas no caso */
  pessoasEnvolvidas: PersonEnvolvida[]
  /** Relacionamentos mapeados (parentesco, afinidade, etc) */
  relacionamentos: Relacionamento[]
  /** Citacoes juridicas (legislacao, sumulas, jurisprudencia) */
  citacoesJuridicas: CitacaoJuridica[]
  /** Trecho citavel para reuso (geralmente ementa ou sumula do caso) */
  reusableContent: string
}

export interface AcervoPipelineFlags {
  enableClassifier?: boolean
  enableEmenta?: boolean
  enableKeyPoints?: boolean
}

export interface AcervoAnalyzerInput {
  uid: string
  docId: string
  fileName: string
  text: string
  /** LLM config JÁ CARREGADO (do configToUse global) */
  llmConfig: LLMConfigLike
  /** Toggles do pipeline (opcional, default: tudo ON) */
  pipelineFlags?: AcervoPipelineFlags
  /** Instruções extras (skills configuradas do agente de acervo) anexadas ao system prompt. */
  extraInstructions?: string
}

export interface AcervoAnalysisResult {
  classification: Classification | null
  ementa: Ementa | null
  keyPoints: KeyPoints
  /** Latencia total (incluindo retry se houver) */
  totalLatencyMs: number
  /** Tokens consumidos (input + output) */
  tokens: { input: number; output: number; total: number }
  /** Como o resultado foi produzido: LLM real ou heuristica de fallback. */
  method: 'llm' | 'heuristic'
  /**
   * Motivo do fallback para heuristica (se method === 'heuristic' apos tentar o LLM).
   * Vazio quando method === 'llm'. Persistido em corpus/{docId}.analysisLlmError para
   * que o admin consiga DIAGNOSTICAR por que a ementa saiu generica (chave ausente,
   * erro do provedor, JSON truncado, etc).
   */
  error?: string
  /**
   * True quando a resposta do LLM veio truncada e foi reparada (fechamento de chaves).
   * Nesse caso classification+ementa costumam estar OK, mas key_points pode estar parcial.
   */
  repaired?: boolean
}

// ── Constants ──────────────────────────────────────────────────────────

const MAX_SOURCE_CHARS = 20000  // cobertura maior p/ análise exaustiva (1 envio p/ 3 skills)
const MAX_KEY_POINTS = 15       // pontos relevantes: mapeamento exaustivo do caso
/**
 * Orcamento de saida GENEROSO. O JSON unificado (classification + ementa + ate 15
 * key_points com pessoas/relacionamentos/citacoes/reusable_content) e' grande;
 * com 3000 tokens ele TRUNCAVA no meio de key_points -> JSON.parse falhava ->
 * caia na heuristica (ementa generica "Analise LLM nao disponivel"). 8000 tokens
 * cobrem a saida completa com folga. Se ainda assim truncar, o parser repara.
 */
const ANALYSIS_MAX_TOKENS = 8000
const NATUREZA_VALUES: Natureza[] = ['consultivo', 'executorio', 'transacional', 'negocial', 'doutrinario', 'decisorio']

// ── Prompt do agente unificado (3 skills em 1 chamada) ─────────────────

const UNIFIED_SYSTEM_PROMPT = [
  'Voce e um analista juridico especializado. Sua tarefa e analisar o documento fornecido',
  'e gerar TRES produtos estruturados de uma so vez, em um unico JSON.',
  '',
  'O DOCUMENTO PODE SER DE QUALQUER AREA DO DIREITO:',
  '- Direito Penal, Processo Penal, Execucao Penal',
  '- Direito Civil, Processo Civil, Familia, Sucessoes',
  '- Direito Constitucional, Administrativo, Tributario, Financeiro',
  '- Direito do Trabalho, Processo do Trabalho, Sindical',
  '- Direito Ambiental, Urbanistico, Agrario, Minerario',
  '- Direito do Consumidor, Empresarial, Falimentar',
  '- Direito Pre-Cambial, Cambiario, Empresarial Internacional',
  '- Direito Internacional Publico e Privado, Mercosul, Tratados',
  '- etc.',
  '',
  'Identifique o caso concreto. Extraia pessoas, vinculos, autoridades, cargos, datas, valores.',
  '',
  '═══════════════════════════════════════════════════════════════════',
  'SKILL 1: CLASSIFICACAO (TAGS ESTRUTURADAS)',
  '═══════════════════════════════════════════════════════════════════',
  'Tags estruturadas para indexacao e busca do documento.',
  '',
  'Campo "natureza" (EXATAMENTE UM valor):',
  '- consultivo: emissoes de opiniao (parecer, informativo, manifestacao, nota tecnica, consulta)',
  '- executorio: movimentacao processual ativa (peticao, denuncia, recurso, contrarrazoes, impugnacao)',
  '- transacional: acordo ou transacao (ANPC, ANPP, TAC, acordo processual, termo de compromisso)',
  '- negocial: relacao contratual (minuta de contrato, edital, termo de referencia, aditivo)',
  '- doutrinario: producao teorica (artigo, livro, tese, monografia, estudo, comentario)',
  '- decisorio: atos decisorios (sentenca, acordao, jurisprudencia, despacho, decisao interlocutoria)',
  '',
  'Campo "tipo_documento": tipo especifico (Parecer, Sentenca, Acordao, Despacho, Peticao, TAC, Contrato, etc).',
  'Campo "area_direito": 1-5 areas do direito envolvidas.',
  'Campo "assuntos": 2-8 materias/temas objeto da fundamentacao.',
  'Campo "contexto": 1-5 circunstancias facticas (ex: "Municipio celebrou contrato sem licitacao em 2023").',
  '',
  '═══════════════════════════════════════════════════════════════════',
  'SKILL 2: EMENTA JURIDICA',
  '═══════════════════════════════════════════════════════════════════',
  'Ementa juridica do documento, estruturada conforme a pratica do Ministerio Publico.',
  'A ementa deve refletir o CONTEUDO do documento, nao o trabalho do LLM.',
  '',
  'Campos:',
  '- tipo: tipo generico (Parecer, Sentenca, Acordao, etc)',
  '- tipo_documento: tipo especifico (parecer informativo, sentenca absolutoria, etc)',
  '- numero: numero do documento (se houver)',
  '- data: data do documento em ISO (se houver)',
  '- autor: orgao/pessoa que produziu',
  '- destinatario: a quem se dirige',
  '- assunto: tema principal em 1-2 palavras (PARA BUSCA RAPIDA)',
  '- sintese: 2-4 frases resumindo o caso concreto (assunto principal + assuntos complementares + partes/autoridades + vinculos relevantes)',
  '- fundamentacao: FUNDAMENTOS JURIDICOS de forma substantiva. Registre COMO o redator tratou cada ponto relevante',
  '  e QUAIS fundamentos (tese central, ratio decidendi, principios, dispositivos legais, sumulas, precedentes) foram',
  '  determinantes para a tomada de decisao/conclusao. 3-6 frases.',
  '- areas: areas do direito (mesmo de classification)',
  '- topicos: referencias especificas (SV 13 STF, Tema 1018 RG, Art. 37 CF, etc)',
  '- conclusao: 1-2 frases com a conclusao/decisao final e o porque (fundamento decisivo)',
  '- keywords: 5-25 palavras-chave para busca, incluindo sinonimos',
  '- materias: 3-10 tags mais amplas (para busca semantica no chat) - ex: "nepotismo", "improbidade", "licitacao"',
  '',
  '═══════════════════════════════════════════════════════════════════',
  'SKILL 3: PONTOS RELEVANTES DETALHADOS',
  '═══════════════════════════════════════════════════════════════════',
  'Mapeamento EXAUSTIVO do que torna este caso UNICO.',
  'NAO faca resumo superficial - mapeie TODOS os detalhes relevantes (5-15 pontos).',
  '',
  '3.0. ASSUNTO PRINCIPAL E COMPLEMENTARES: identifique o assunto PRINCIPAL do documento e os',
  'assuntos COMPLEMENTARES (temas secundarios que tambem aparecem). Cada um vira um item ou tag.',
  'Registre TODAS as circunstancias e peculiaridades que tornam o caso concreto unico.',
  'Exemplo (nepotismo): a autoridade envolvida (prefeito, secretario, procurador, vereador, presidente',
  'da camara, cargo em comissao), o GRAU de parentesco (esposa, irmao, pai, filho, primo, sogro, tio,',
  'sobrinho, etc.) e outras formas de vinculo/familiaridade (amigo, compadre, namorada, noiva, socio).',
  'Para CADA circunstancia relevante, registre COMO o redator a tratou e qual o fundamento aplicado.',
  '',
  '3.1. PESSOAS ENVOLVIDAS: identifique TODAS as pessoas mencionadas, com cargo/funcao.',
  'Exemplos: prefeito, vice-prefeito, secretarios, vereadores, procuradores, servidores comissionados,',
  'contratados, fornecedores, testemunhas, denunciantes, etc.',
  'Para cada pessoa: nome, cargo, papel no caso, contexto.',
  '',
  '3.2. RELACIONAMENTOS: parentesco, afinidade, amizade, compadrio, vinculo societario, etc.',
  'Exemplos: "esposa do prefeito", "irmao do vereador", "sogro do secretario", "socio da empresa X".',
  'Para cada relacao: tipo, grau, pessoas, descricao.',
  '',
  '3.3. CITACOES JURIDICAS: legislacao, sumulas, jurisprudencia, doutrina.',
  'Exemplos: "Art. 37, XI, CF/88", "SV 13 STF", "Tema 1018 RG", "Lei 8.666/93, art. 3".',
  'Para cada citacao: tipo, referencia, citacao literal (se houver), interpretacao.',
  '',
  '3.4. PONTOS RELEVANTES (ITEMS): fatos principais, circunstancias, decisoes tomadas.',
  'Cada item deve ser OBJETIVO e ESPECIFICO, nao generico.',
  'Bom: "Prefeito nomeou irmao da esposa para cargo em comissao de R$ 8.000, em 03/2023"',
  'Ruim: "Houve nomeacao irregular"',
  'Cada item inclui: categoria, titulo, descricao, citacao literal (opcional), trecho reutilizavel (opcional), tags.',
  '',
  '3.5. REUSABLE_CONTENT: trecho citavel (1-3 paragrafos, 200-1500 chars) - copie do original.',
  '',
  '═══════════════════════════════════════════════════════════════════',
  'FORMATO DE SAIDA (JSON PURO, sem markdown, sem texto adicional)',
  '═══════════════════════════════════════════════════════════════════',
  '{',
  '  "classification": {',
  '    "natureza": "consultivo|executorio|transacional|negocial|doutrinario|decisorio",',
  '    "area_direito": ["Direito Administrativo", "Direito Constitucional"],',
  '    "assuntos": ["Licitacao", "Dispensa de licitacao"],',
  '    "tipo_documento": "Parecer",',
  '    "contexto": ["Municipio celebrou contrato sem licitacao"]',
  '  },',
  '  "ementa": {',
  '    "tipo": "Parecer",',
  '    "tipo_documento": "Parecer informativo",',
  '    "numero": "007/2024",',
  '    "data": "2024-03-15",',
  '    "autor": "Centro de Apoio Operacional Civel e Patrimonio Publico",',
  '    "destinatario": "Promotor de Justiça da Comarca X",',
  '    "assunto": "Nepotismo",',
  '    "sintese": "Consulta sobre possibilidade de configuracao de nepotismo na Santa Casa de Alegrete. Vínculo entre servidores da entidade pública e o Ministério Público é analisado.",',
  '    "fundamentacao": "A vedação ao nepotismo decorre do art. 37, XI, da CF/88 e da SV 13 do STF, alcançando entidades do Sistema Único de Saúde (Lei 8.080/90). No caso, há indicios de parentesco entre o Secretario Municipal de Saude e contratados.",',
  '    "areas": ["Direito Administrativo", "Direito Constitucional"],',
  '    "topicos": ["SV 13 STF", "Art. 37, XI, CF/88", "Lei 8.080/90"],',
  '    "conclusao": "Ha indicios de nepotismo, devendo o caso ser apurado em Inquerito Civil.",',
  '    "keywords": ["nepotismo", "cargo comissionado", "SUS", "SAUDE", "santa casa", "parentesco", "SV 13"],',
  '    "materias": ["nepotismo", "improbidade", "patrimonio publico"]',
  '  },',
  '  "key_points": {',
  '    "items": [',
  '      { "categoria": "fato_principal", "titulo": "Nomeacao de parente em cargo comissionado", "descricao": "Em marco/2023, o Secretario Municipal de Saude, Ricardo Colpo Marchesan, nomeou seu irmao Joao Pedro Marchesan para o cargo em comissao de Assessor Tecnico II, com remuneracao de R$ 8.000.", "citacao": null, "trechoReutilizavel": null, "tags": ["nepotismo", "nomeacao", "parentesco"] },',
  '      { "categoria": "relacionamento", "titulo": "Vinculo de parentesco", "descricao": "O irmao do Secretario Municipal de Saude foi nomeado para cargo em comissao na mesma secretaria.", "tags": ["parentesco", "irmao"] },',
  '      { "categoria": "fundamento_juridico", "titulo": "Vedacao constitucional ao nepotismo", "descricao": "Art. 37, XI, CF/88 e SV 13 STF vedam nomeacao de parentes para cargos em comissao de livre nomeacao.", "tags": ["CF88", "SV13", "nepotismo"] }',
  '    ],',
  '    "pessoas_envolvidas": [',
  '      { "nome": "Ricardo Colpo Marchesan", "cargo": "Secretario Municipal de Saude", "papel": "autoridade", "contexto": "Responsavel pelas contratacoes da Secretaria de Saude" },',
  '      { "nome": "Joao Pedro Marchesan", "cargo": "Assessor Tecnico II", "papel": "servidor", "contexto": "Nomeado em 03/2023, remuneracao R$ 8.000" }',
  '    ],',
  '    "relacionamentos": [',
  '      { "tipo": "parentesco_consanguineo", "grau": "irmao", "pessoas": ["Ricardo Colpo Marchesan", "Joao Pedro Marchesan"], "descricao": "Irmaos" }',
  '    ],',
  '    "citacoes_juridicas": [',
  '      { "tipo": "legislacao", "referencia": "Art. 37, XI, CF/88", "interpretacao": "Vedacao ao nepotismo em cargos em comissao" },',
  '      { "tipo": "sumula", "referencia": "SV 13 STF", "interpretacao": "Vedacao a nomeacao de conjugue ou parente para cargo em comissao" }',
  '    ],',
  '    "reusable_content": "INFORMACAO TECNICO-JURIDICA. Objeto: Possibilidade de configuracao de nepotismo na Santa Casa de Alegrete. O principio da moralidade..."',
  '  }',
  '}',
  '',
  '═══════════════════════════════════════════════════════════════════',
  'REGRAS GERAIS',
  '═══════════════════════════════════════════════════════════════════',
  '- classification.natureza: EXATAMENTE um dos 6 valores acima (sem variacoes).',
  '- classification.area_direito: 1-5 areas.',
  '- classification.assuntos: 2-8 materias/temas objeto da fundamentacao.',
  '- classification.tipo_documento: tipo especifico (ex: Parecer, Peticao inicial, Sentenca, TAC, Contrato).',
  '- classification.contexto: 1-5 circunstancias facticas.',
  '- ementa.assunto: CURTO (1-2 palavras), ideal para busca rapida.',
  '- ementa.sintese: 1-3 frases, descritiva do CONTEUDO do documento.',
  '- ementa.fundamentacao: registre COMO o redator tratou os pontos e QUAIS fundamentos foram decisivos (tese, ratio, dispositivos, sumulas, precedentes).',
  '- ementa.materias: tags SEMANTICAS amplas para busca por tema no chat (assunto principal + complementares).',
  '- ementa.keywords: TODAS as palavras relevantes, incluindo sinonimos (min 5, max 25).',
  '- key_points.items: 5-15 pontos OBJETIVOS e ESPECIFICOS, mapeando o que torna o caso UNICO (assunto principal, complementares, circunstancias, autoridades, vinculos, valores, datas, decisao e seus fundamentos).',
  '- key_points.pessoas_envolvidas: TODAS as pessoas mencionadas, com cargo/funcao.',
  '- key_points.relacionamentos: parentesco, afinidade, amizade, compadrio, vinculo societario.',
  '- key_points.citacoes_juridicas: legislacao, sumulas, jurisprudencia, doutrina.',
  '- key_points.reusable_content: copie trechos LITERAIS do documento (200-1500 chars).',
  '',
  'IMPORTANTE: Faca tudo em uma unica cadeia de raciocinio. Os 3 produtos devem ser',
  'CONSISTENTES entre si (a ementa deve refletir a classification, os keywords devem',
  'cobrir os assuntos, as pessoas_envolvidas devem ser as mesmas nos pontos relevantes).',
].join('\n')



/**
 * Constroi o prompt do sistema condicionalmente baseado nos toggles.
 * Se um agente esta desativado, seu output eh null (mas o LLM ainda roda 1 unica chamada).
 */
function buildSystemPrompt(flags?: AcervoPipelineFlags): string {
  const enableClassifier = flags?.enableClassifier !== false
  const enableEmenta = flags?.enableEmenta !== false
  const enableKeyPoints = flags?.enableKeyPoints !== false
  const skills: string[] = []
  if (enableClassifier) skills.push('classification')
  if (enableEmenta) skills.push('ementa')
  if (enableKeyPoints) skills.push('key_points')
  if (skills.length === 0) {
    // Edge case: tudo desativado. Nao roda LLM.
    return 'Todos os agentes estao desativados. Responda com JSON vazio: {}'
  }
  // Substitui os titulos das secoes no UNIFIED_SYSTEM_PROMPT
  let prompt = UNIFIED_SYSTEM_PROMPT
  if (!enableClassifier) {
    prompt = prompt.replace(/═══════════════════════════════════════════════════════════════════\nSKILL 1: CLASSIFICAÇÃO[\s\S]*?(?=═══════════════════════════════════════════════════════════════════)/,
                            '═══════════════════════════════════════════════════════════════════\nSKILL 1: CLASSIFICAÇÃO [DESATIVADA]\n(classification deve ser null)\n')
  }
  if (!enableEmenta) {
    prompt = prompt.replace(/═══════════════════════════════════════════════════════════════════\nSKILL 2: EMENTA[\s\S]*?(?=═══════════════════════════════════════════════════════════════════)/,
                            '═══════════════════════════════════════════════════════════════════\nSKILL 2: EMENTA [DESATIVADA]\n(ementa deve ser null)\n')
  }
  if (!enableKeyPoints) {
    prompt = prompt.replace(/═══════════════════════════════════════════════════════════════════\nSKILL 3: PONTOS RELEVANTES DETs\S]*?(?=═══════════════════════════════════════════════════════════════════)/,
                            '═══════════════════════════════════════════════════════════════════\nSKILL 3: PONTOS RELEVANTES [DESATIVADA]\n(key_points deve ser null)\n')
  }
  return prompt
}

// ── Funcao principal (orquestra 1 chamada) ─────────────────────────────

/**
 * Roda a analise completa em UMA chamada LLM (3 skills em paralelo dentro do prompt).
 * Retorna {classification, ementa, keyPoints} ou defaults se o LLM falhar.
 */
export async function analyzeAcervoDoc(input: AcervoAnalyzerInput): Promise<AcervoAnalysisResult> {
  const start = Date.now()
  logger.info('acervo-analyzer.start', {
    docId: input.docId,
    fileName: input.fileName,
    model: input.llmConfig.model,
  })

  // 1. Preparar input
  const sourceText = input.text.slice(0, MAX_SOURCE_CHARS)
  const userPrompt = `Arquivo: ${input.fileName}\n\n<texto>\n${sourceText}\n</texto>\n\nGere a análise estruturada (classification + ementa + key_points) para este documento.`

  // 2. UMA chamada LLM
  const baseSystemPrompt = buildSystemPrompt(input.pipelineFlags)
  const systemPrompt = input.extraInstructions && input.extraInstructions.trim()
    ? `${baseSystemPrompt}\n\n${input.extraInstructions.trim()}`
    : baseSystemPrompt
  let result: { content: string; tokens: { input: number; output: number; total: number } }
  try {
    result = await generateWithProvider({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      // maxTokens generoso: cobre a saida unificada completa (evita truncamento).
      config: { ...input.llmConfig, maxTokens: ANALYSIS_MAX_TOKENS, temperature: 0.1 },
    })
  } catch (err) {
    const reason = `LLM indisponivel: ${(err as Error).message}`
    logger.warn('analyzeAcervoDoc: LLM falhou, usando heuristica de fallback', { err: (err as Error).message })
    const heuristic = getHeuristicAnalysis(input.fileName, input.text)
    return {
      classification: heuristic.classification,
      ementa: heuristic.ementa,
      keyPoints: heuristic.keyPoints,
      totalLatencyMs: Date.now() - start,
      tokens: { input: 0, output: 0, total: 0 },
      method: 'heuristic',
      error: reason,
    }
  }

  // 3. Parsear JSON unificado (com reparo de truncamento).
  const parsed = tryParseUnifiedJson(result.content)
  if (!parsed.ok) {
    const reason = `Resposta do LLM nao pode ser interpretada como JSON: ${parsed.error}`
    logger.warn('analyzeAcervoDoc: JSON invalido, usando heuristica de fallback', {
      error: parsed.error,
      preview: (result.content || '').slice(0, 300),
    })
    const heuristic = getHeuristicAnalysis(input.fileName, input.text)
    return {
      classification: heuristic.classification,
      ementa: heuristic.ementa,
      keyPoints: heuristic.keyPoints,
      totalLatencyMs: Date.now() - start,
      tokens: result.tokens,
      method: 'heuristic',
      error: reason,
    }
  }

  // 4. Normalizar cada skill (respeitando os toggles)
  const enableClassifier = input.pipelineFlags?.enableClassifier !== false
  const enableEmenta = input.pipelineFlags?.enableEmenta !== false
  const enableKeyPoints = input.pipelineFlags?.enableKeyPoints !== false
  const classification = enableClassifier ? normalizeClassification(parsed.value.classification) : null
  const ementa = enableEmenta ? normalizeEmenta(parsed.value.ementa, input.fileName) : null
  const keyPoints = enableKeyPoints ? normalizeKeyPoints(parsed.value.key_points) : getDefaultKeyPoints()

  const totalLatencyMs = Date.now() - start
  logger.info('acervo-analyzer.done', {
    docId: input.docId,
    totalLatencyMs,
    tokens: result.tokens.total,
  })

  return {
    classification,
    ementa,
    keyPoints,
    totalLatencyMs,
    tokens: result.tokens,
    method: 'llm',
    repaired: parsed.repaired === true,
    error: parsed.repaired ? 'Resposta do LLM veio truncada e foi reparada (key_points podem estar parciais).' : undefined,
  }
}

// ── Heuristica melhorada (fallback) ───────────────────────────────────

/**
 * Heuristica de fallback: gera classification + ementa + keyPoints
 * com base em regex e palavras-chave, quando o LLM nao esta disponivel.
 * Gera dados RICOS (nunca defaults vazios).
 */
export function getHeuristicAnalysis(fileName: string, text: string): { classification: Classification; ementa: Ementa; keyPoints: KeyPoints } {
  const lower = fileName.toLowerCase()
  const textLower = (text || '').toLowerCase().slice(0, 10000)

  // === Classification ===
  let tipoDocumento = 'Outro'
  let natureza: Natureza = 'consultivo'
  if (/parecer|informativo|nota\s+t[eé]cnic|manifesta[cç][aã]o|consulta/i.test(lower + ' ' + textLower)) {
    tipoDocumento = 'Parecer'; natureza = 'consultivo'
  } else if (/senten[cç]a|julgad|conden|absolvi/i.test(lower + ' ' + textLower)) {
    tipoDocumento = 'Sentença'; natureza = 'decisorio'
  } else if (/ac[oó]rd[aã]o|tribunal|recurso|apel/i.test(lower + ' ' + textLower)) {
    tipoDocumento = 'Acórdão'; natureza = 'decisorio'
  } else if (/despacho/i.test(lower + ' ' + textLower)) {
    tipoDocumento = 'Despacho'; natureza = 'decisorio'
  } else if (/peti[cç][aã]o|inicial|den[uú]ncia|recurso|contrarraz/i.test(lower + ' ' + textLower)) {
    tipoDocumento = 'Petição'; natureza = 'executorio'
  } else if (/tac|anpc|anpp|acordo|termo\s+de\s+(ajuste|compromisso)/i.test(lower + ' ' + textLower)) {
    tipoDocumento = 'TAC'; natureza = 'transacional'
  } else if (/contrato|edital|termo\s+de\s+refer/i.test(lower + ' ' + textLower)) {
    tipoDocumento = 'Contrato'; natureza = 'negocial'
  } else if (/artigo|doutrina|tese|monografia|estudo/i.test(lower + ' ' + textLower)) {
    tipoDocumento = 'Artigo'; natureza = 'doutrinario'
  } else if (/not[ií]cia|m[ií]dia|jornal/i.test(lower + ' ' + textLower)) {
    tipoDocumento = 'Notícia'; natureza = 'doutrinario'
  } else if (/jurisprud|precedent|s[uú]mula/i.test(lower + ' ' + textLower)) {
    tipoDocumento = 'Jurisprudência'; natureza = 'decisorio'
  } else if (/livro|manual|guia/i.test(lower + ' ' + textLower)) {
    tipoDocumento = 'Livro'; natureza = 'doutrinario'
  }

  // Detectar área
  const areas: string[] = []
  const areaPatterns: Array<[RegExp, string]> = [
    [/administrativo|licita[cç][aã]o|contrat/i, 'Direito Administrativo'],
    [/constitucional|adi|adc/i, 'Direito Constitucional'],
    [/civil|responsabilidade\s+civil|obriga[cç][aã]o/i, 'Direito Civil'],
    [/penal|criminal|delito/i, 'Direito Penal'],
    [/processual\s+civil|cpc/i, 'Direito Processual Civil'],
    [/processual\s+penal|cpp/i, 'Direito Processual Penal'],
    [/tribut|icms|ipi|ir|iss/i, 'Direito Tributário'],
    [/trabalhista|clt|trabalho/i, 'Direito do Trabalho'],
    [/previdenci|inss|aposentador/i, 'Direito Previdenciário'],
    [/ambiental|crime\s+ambiental/i, 'Direito Ambiental'],
    [/consumidor|cdc/i, 'Direito do Consumidor'],
    [/improbidade/i, 'Improbidade Administrativa'],
    [/patrim[oô]nio\s+p[úu]blico/i, 'Patrimônio Público'],
  ]
  for (const [pattern, area] of areaPatterns) {
    if (pattern.test(lower + ' ' + textLower)) areas.push(area)
  }

  // Detectar assuntos
  const assuntos: string[] = []
  const assuntoPatterns = [
    'Nepotismo', 'Licitação', 'Improbidade', 'Improbidade Administrativa',
    'Patrimônio Público', 'Mandado de Segurança', 'Habeas Corpus',
    'Ação Popular', 'Ação Civil Pública', 'Regressão',
    'Súmula Vinculante', 'Jurisprudência', 'Precedente',
    'Inconstitucionalidade', 'Modulação de Efeitos', 'Repercussão Geral',
    'Concurso Público', 'Cargo em Comissão', 'Função de Confiança',
    'Contrato Administrativo', 'Dispensa de Licitação', 'Inexigibilidade',
    'Convênio', 'Termo de Ajustamento de Conduta',
  ]
  for (const a of assuntoPatterns) {
    if (textLower.includes(a.toLowerCase())) assuntos.push(a)
  }

  // Topicos
  const topicos: string[] = []
  if (/sv\s*13|sumula\s+vinculante\s+13/i.test(textLower)) topicos.push('SV 13')
  if (/sv\s*10|sumula\s+vinculante\s+10/i.test(textLower)) topicos.push('SV 10')
  if (/sumula\s+vinculante/i.test(textLower) && topicos.length === 0) topicos.push('Súmula Vinculante')
  if (/art\.\s*\d+|artigo\s+\d+/i.test(textLower)) {
    const m = textLower.match(/art\.\s*(\d+)/i)
    if (m) topicos.push(`Art. ${m[1]}`)
  }

  // Limpar filename
  const filenameClean = fileName
    .replace(/^\d{8}\s*-\s*/, '')
    .replace(/^\d+\s*-\s*/, '')
    .replace(/\.(docx?|pdf|txt|md|html|rtf)$/i, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Keywords
  const stopWords = new Set(['de', 'da', 'do', 'e', 'a', 'o', 'que', 'para', 'em', 'no', 'na', 'os', 'as', 'um', 'uma', 'com', 'por', 'se', 'ou', 'dos', 'das', 'ao', 'aos', 'pelo', 'pela', 'pelos', 'pelas', 'sua', 'seu', 'ser', 'foi', 'são', 'ter', 'tem', 'mais', 'mas', 'como', 'sobre', 'entre', 'até', 'após', 'sem', 'será', 'esta', 'este', 'isso', 'isto', 'pode', 'podem', 'deve', 'devem', 'ainda', 'também', 'já', 'haver', 'nosso', 'nossa', 'seus', 'suas', 'meu', 'minha', 'nos', 'sob', 'contra', 'desde', 'perante', 'segundo', 'apenas', 'outro', 'outra', 'mesmo', 'mesma', 'tais', 'qual', 'quais', 'onde', 'cuja', 'cujas', 'cujo', 'cujos'])
  const wordCount = new Map<string, number>()
  const textWords = textLower.split(/[\s,;.\n\r:(){}"'.]+/).filter(w => w.length >= 4 && !stopWords.has(w))
  for (const w of textWords) {
    wordCount.set(w, (wordCount.get(w) || 0) + 1)
  }
  const keywords = Array.from(wordCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([w]) => w)

  // Detectar pessoas (heuristica)
  const pessoasEnvolvidas: PersonEnvolvida[] = []
  const pessoasSet = new Set<string>()
  const cargoPatterns: Array<[RegExp, string]> = [
    [/prefeito(?:sa)?/i, 'Prefeito(a)'],
    [/vice[-s]?prefeito/i, 'Vice-Prefeito(a)'],
    [/secret[aá]rio(?:\s+municipal)?(?:\s+de\s+\w+)?/i, 'Secretário(a) Municipal'],
    [/veread(or|ora)/i, 'Vereador(a)'],
    [/procurador(?:\s+municipal)?/i, 'Procurador(a)'],
    [/presidente\s+da\s+c[aâ]mara/i, 'Presidente da Câmara'],
    [/juiz(?:a)?/i, 'Juiz(a)'],
    [/promotor(?:\s+de\s+justi[cç]a)?/i, 'Promotor(a) de Justiça'],
    [/desembargador/i, 'Desembargador(a)'],
    [/servidor(?:\s+p[úu]blico)?/i, 'Servidor(a) Público'],
    [/comissionado/i, 'Cargo em Comissão'],
  ]
  for (const [pattern, cargo] of cargoPatterns) {
    if (pattern.test(textLower)) {
      const papel: PersonEnvolvida['papel'] =
        /prefeito|secret|veread|procurad|presidente/i.test(cargo) ? 'autoridade' :
        /juiz|desembargad|promotor/i.test(cargo) ? 'membro_poder_judiciario' :
        /servidor|comissionado/i.test(cargo) ? 'servidor' : 'parte'
      const key = cargo
      if (!pessoasSet.has(key)) {
        pessoasSet.add(key)
        pessoasEnvolvidas.push({ nome: cargo, cargo, papel, contexto: 'Mencionado no documento' })
      }
    }
  }

  // Detectar vinculos
  const relacionamentos: Relacionamento[] = []
  const vinculoPatterns: Array<[RegExp, Relacionamento['tipo'], string]> = [
    [/irm[ãa]o\s+de/i, 'parentesco_consanguineo', 'Irmão de'],
    [/esposa?\s+de|marido\s+de|c[óo]njug[ae]\s+de/i, 'conjugue', 'Cônjuge de'],
    [/pai\s+de|m[ãa]e\s+de|filh[oa]\s+de/i, 'parentesco_consanguineo', 'Parente consanguíneo'],
    [/sogro\s+de|sogra\s+de|genro\s+de|nora\s+de/i, 'parentesco_afim', 'Parente afim'],
    [/primo\s+de|prima\s+de|tio\s+de|tia\s+de|sobrinh[oa]\s+de/i, 'parentesco_consanguineo', 'Parente colateral'],
    [/amig[oa]\s+de|compadre\s+de|comadre\s+de/i, 'amizade', 'Amigo/Compadre'],
    [/s[óo]ci[oa]\s+de|s[óo]cios?\s+da/i, 'societario', 'Sócio de'],
    [/namorad[oa]\s+de|noiv[oa]\s+de/i, 'conjugue', 'Namorado(a)/Noivo(a)'],
  ]
  for (const [pattern, tipo, descricao] of vinculoPatterns) {
    if (pattern.test(textLower)) {
      relacionamentos.push({
        tipo,
        pessoas: [],
        descricao,
      })
    }
  }

  // Detectar citacoes
  const citacoesJuridicas: CitacaoJuridica[] = []
  const citacaoPatterns: Array<[RegExp, CitacaoJuridica['tipo'], string]> = [
    [/art\.\s*(\d+[ºo]?)(?:\s*,?\s*da?\s+(?:cf|lcf|lei\s+n[ºo]?\s*[\d.]+))?/gi, 'legislacao', 'Artigo de lei'],
    [/sumula\s+vinculante\s+(\d+)/gi, 'sumula', 'Súmula Vinculante'],
    [/sv\s+(\d+)/gi, 'sumula', 'SV'],
    [/tema\s+(\d+)\s+(?:rg|repercussao)/gi, 'jurisprudencia', 'Tema RG'],
    [/lei\s+(?:federal\s+)?n[ºo]?\s*([\d.]+)\/(\d+)/gi, 'legislacao', 'Lei'],
  ]
  const seenCitacoes = new Set<string>()
  for (const [pattern, tipo] of citacaoPatterns) {
    const matches = textLower.matchAll(pattern)
    for (const m of matches) {
      const fullMatch = m[0].trim()
      if (seenCitacoes.has(fullMatch.toLowerCase())) continue
      seenCitacoes.add(fullMatch.toLowerCase())
      citacoesJuridicas.push({
        tipo,
        referencia: fullMatch,
        interpretacao: 'Citada no documento',
      })
      if (citacoesJuridicas.length >= 10) break
    }
    if (citacoesJuridicas.length >= 10) break
  }

  // Pontos relevantes (heuristica)
  const items: PontoRelevante[] = []
  if (tipoDocumento !== 'Outro') {
    items.push({
      categoria: 'fato_principal',
      titulo: `Documento do tipo ${tipoDocumento}`,
      descricao: `O documento é um(a) ${tipoDocumento} que trata de ${filenameClean.slice(0, 80)}.`,
      tags: [tipoDocumento.toLowerCase()],
    })
  }
  if (areas.length > 0) {
    items.push({
      categoria: 'fundamento_juridico',
      titulo: `Área do direito: ${areas[0]}`,
      descricao: `O documento trata de matéria de ${areas[0]}.`,
      tags: areas,
    })
  }
  if (assuntos.length > 0) {
    items.push({
      categoria: 'fato_principal',
      titulo: `Assunto principal: ${assuntos[0]}`,
      descricao: `O documento aborda o tema "${assuntos[0]}" como matéria principal da análise.`,
      tags: [assuntos[0].toLowerCase()],
    })
  }
  if (pessoasEnvolvidas.length > 0) {
    items.push({
      categoria: 'pessoa_envolvida',
      titulo: `${pessoasEnvolvidas.length} pessoa(s) com cargo identificada(s)`,
      descricao: `Mapeamento heuristico identificou ${pessoasEnvolvidas.length} pessoa(s) com cargo mencionada(s) no documento.`,
      tags: pessoasEnvolvidas.map(p => p.papel).slice(0, 5),
    })
  }
  if (relacionamentos.length > 0) {
    items.push({
      categoria: 'relacionamento',
      titulo: `${relacionamentos.length} vinculo(s) familiar(es) ou de proximidade detectado(s)`,
      descricao: `Detectados indicios de: ${relacionamentos.slice(0, 3).map(r => r.descricao).join(', ')}.`,
      tags: ['vinculo', 'parentesco'],
    })
  }
  if (citacoesJuridicas.length > 0) {
    items.push({
      categoria: 'fundamento_juridico',
      titulo: `${citacoesJuridicas.length} citacao(oes) juridica(s) identificada(s)`,
      descricao: `Citacoes: ${citacoesJuridicas.slice(0, 5).map(c => c.referencia).join(', ')}.`,
      tags: citacoesJuridicas.slice(0, 3).map(c => c.tipo),
    })
  }

  // Sintese do texto
  const firstParagraph = text.split(/\n\s*\n/)[0] || ''
  const sintese = firstParagraph.length > 0 && firstParagraph.length < 500
    ? firstParagraph.trim()
    : 'Documento do acervo. Análise LLM não disponível no momento.'

  // Materias (tags semanticas)
  const materias = assuntos.length > 0 ? assuntos : [filenameClean.slice(0, 30) || 'Documento']

  const classification: Classification = {
    natureza,
    areaDireito: areas.length > 0 ? areas : ['Geral'],
    assuntos: assuntos.length > 0 ? assuntos : [filenameClean.slice(0, 50) || 'Documento'],
    tipoDocumento,
    contexto: [filenameClean.slice(0, 100)],
  }
  const ementa: Ementa = {
    tipo: tipoDocumento,
    tipoDocumento,
    assunto: filenameClean.slice(0, 50) || tipoDocumento,
    sintese,
    fundamentacao: citacoesJuridicas.length > 0
      ? `Análise LLM não disponível. Heurística identificou ${citacoesJuridicas.length} citação(ões) jurídica(s): ${citacoesJuridicas.slice(0, 3).map(c => c.referencia).join(', ')}.`
      : 'Análise LLM não disponível. Metadata gerada via heurística a partir do filename e conteúdo.',
    areas: areas.length > 0 ? areas : ['Geral'],
    topicos: topicos.length > 0 ? topicos : [],
    conclusao: 'Aguardando reanálise com LLM para resultados completos.',
    keywords,
    materias,
  }
  const keyPoints: KeyPoints = {
    items,
    pessoasEnvolvidas,
    relacionamentos,
    citacoesJuridicas,
    reusableContent: '',
  }
  return { classification, ementa, keyPoints }
}

function getDefaultKeyPoints(): KeyPoints {
  return { items: [], pessoasEnvolvidas: [], relacionamentos: [], citacoesJuridicas: [], reusableContent: '' }
}

// ── Normalizadores (cada skill) ───────────────────────────────────────

function normalizeClassification(raw: unknown): Classification {
  const obj = asRecord(raw)
  if (!obj) return getDefaultClassification()
  const naturezaCandidate = obj.natureza as Natureza | undefined
  const natureza: Natureza = naturezaCandidate && NATUREZA_VALUES.includes(naturezaCandidate)
    ? naturezaCandidate
    : 'consultivo'
  return {
    natureza,
    areaDireito: Array.isArray(obj.area_direito) ? obj.area_direito.filter((x: unknown) => typeof x === 'string') : [],
    assuntos: Array.isArray(obj.assuntos) ? obj.assuntos.filter((x: unknown) => typeof x === 'string') : [],
    tipoDocumento: typeof obj.tipo_documento === 'string' ? obj.tipo_documento : '',
    contexto: Array.isArray(obj.contexto) ? obj.contexto.filter((x: unknown) => typeof x === 'string') : [],
  }
}

function normalizeEmenta(raw: unknown, fileName: string): Ementa {
  const obj = asRecord(raw)
  if (!obj) return getDefaultEmenta()
  // Extrair keywords tambem do filename (reforca busca)
  const filenameKeywords = fileName
    .replace(/^\d{8}\s*-\s*/, '')  // remove "YYYYMMDD - " prefix
    .replace(/\.(docx?|pdf|txt|md)$/i, '')
    .split(/[.\s,;_-]+/)
    .filter(w => w.length > 2)
    .map(w => w.toLowerCase())
  const llmKeywords = Array.isArray(obj.keywords)
    ? obj.keywords.filter((x: unknown) => typeof x === 'string')
    : []
  return {
    tipo: typeof obj.tipo === 'string' ? obj.tipo : 'Outro',
    tipoDocumento: typeof obj.tipo_documento === 'string'
      ? obj.tipo_documento
      : (typeof obj.tipo === 'string' ? obj.tipo : 'Outro'),
    numero: typeof obj.numero === 'string' ? obj.numero : undefined,
    data: typeof obj.data === 'string' ? obj.data : undefined,
    autor: typeof obj.autor === 'string' ? obj.autor : undefined,
    destinatario: typeof obj.destinatario === 'string' ? obj.destinatario : undefined,
    assunto: typeof obj.assunto === 'string' ? obj.assunto : '',
    sintese: typeof obj.sintese === 'string' ? obj.sintese : '',
    fundamentacao: typeof obj.fundamentacao === 'string' ? obj.fundamentacao : '',
    areas: Array.isArray(obj.areas) ? obj.areas.filter((x: unknown) => typeof x === 'string') : [],
    topicos: Array.isArray(obj.topicos) ? obj.topicos.filter((x: unknown) => typeof x === 'string') : [],
    conclusao: typeof obj.conclusao === 'string' ? obj.conclusao : '',
    keywords: Array.from(new Set([...llmKeywords, ...filenameKeywords])).slice(0, 30),
    materias: Array.isArray(obj.materias)
      ? obj.materias.filter((x: unknown) => typeof x === 'string')
      : (Array.isArray(obj.assuntos)
        ? obj.assuntos.filter((x: unknown) => typeof x === 'string')
        : []),
  }
}

function normalizeKeyPoints(raw: unknown): KeyPoints {
  const obj = asRecord(raw)
  if (!obj) return getDefaultKeyPoints()
  const items: PontoRelevante[] = []
  if (Array.isArray(obj.items)) {
    const raw = obj.items.slice(0, MAX_KEY_POINTS)
    for (const x of raw) {
      if (typeof x === 'string') {
        // Backward compat: string[] (formato antigo)
        items.push({
          categoria: 'observacao',
          titulo: x,
          descricao: x,
          tags: [],
        })
      } else {
        const r = asRecord(x)
        if (!r) continue
        const categoria = r.categoria as PontoRelevante['categoria']
        items.push({
          categoria: categoria && ['fato_principal', 'pessoa_envolvida', 'relacionamento', 'fundamento_juridico', 'prova', 'decisao', 'circunstancia', 'observacao'].includes(categoria)
            ? categoria
            : 'observacao',
          titulo: typeof r.titulo === 'string' ? r.titulo : '',
          descricao: typeof r.descricao === 'string' ? r.descricao : '',
          citacao: typeof r.citacao === 'string' ? r.citacao : undefined,
          trechoReutilizavel: typeof r.trecho_reutilizavel === 'string'
            ? r.trecho_reutilizavel
            : (typeof r.trechoReutilizavel === 'string' ? r.trechoReutilizavel : undefined),
          tags: Array.isArray(r.tags) ? r.tags.filter((t: unknown) => typeof t === 'string') : [],
        })
      }
    }
  }
  // Backward compat: se items era string[], converte
  if (items.length === 0 && Array.isArray(obj.items)) {
    for (const s of obj.items) {
      if (typeof s === 'string') {
        items.push({
          categoria: 'observacao',
          titulo: s,
          descricao: s,
          tags: [],
        })
      }
    }
  }
  const pessoasEnvolvidas: PersonEnvolvida[] = Array.isArray(obj.pessoas_envolvidas)
    ? (obj.pessoas_envolvidas.slice(0, 20).map((x: unknown) => {
        const r = asRecord(x)
        if (!r) return null
        const papel = r.papel as PersonEnvolvida['papel']
        return {
          nome: typeof r.nome === 'string' ? r.nome : '',
          cargo: typeof r.cargo === 'string' ? r.cargo : undefined,
          papel: papel || 'outro',
          contexto: typeof r.contexto === 'string' ? r.contexto : undefined,
        } as PersonEnvolvida | null
      }).filter((x): x is PersonEnvolvida => x !== null))
    : []
  const relacionamentos: Relacionamento[] = Array.isArray(obj.relacionamentos)
    ? (obj.relacionamentos.slice(0, 20).map((x: unknown) => {
        const r = asRecord(x)
        if (!r) return null
        const tipo = r.tipo as Relacionamento['tipo']
        return {
          tipo: tipo || 'outro',
          grau: typeof r.grau === 'string' ? r.grau : undefined,
          pessoas: Array.isArray(r.pessoas) ? r.pessoas.filter((p: unknown) => typeof p === 'string') : [],
          descricao: typeof r.descricao === 'string' ? r.descricao : undefined,
        } as Relacionamento | null
      }).filter((x): x is Relacionamento => x !== null))
    : []
  const citacoesJuridicas: CitacaoJuridica[] = Array.isArray(obj.citacoes_juridicas)
    ? (obj.citacoes_juridicas.slice(0, 15).map((x: unknown) => {
        const r = asRecord(x)
        if (!r) return null
        const tipo = r.tipo as CitacaoJuridica['tipo']
        return {
          tipo: tipo || 'outro',
          referencia: typeof r.referencia === 'string' ? r.referencia : '',
          citacao: typeof r.citacao === 'string' ? r.citacao : undefined,
          interpretacao: typeof r.interpretacao === 'string' ? r.interpretacao : undefined,
        } as CitacaoJuridica | null
      }).filter((x): x is CitacaoJuridica => x !== null))
    : []
  const reusableContent = typeof obj.reusable_content === 'string'
    ? obj.reusable_content.slice(0, 2000)
    : ''
  return { items, pessoasEnvolvidas, relacionamentos, citacoesJuridicas, reusableContent }
}


/**
 * Type guard: verifica se unknown eh um objeto nao-null.
 */
function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}

// ── Helpers ────────────────────────────────────────────────────────────

function getDefaultClassification(): Classification {
  return {
    natureza: 'consultivo',
    areaDireito: ['Geral'],
    assuntos: [],
    tipoDocumento: 'Outro',
    contexto: [],
  }
}

function getDefaultEmenta(): Ementa {
  return {
    tipo: 'Outro',
    tipoDocumento: 'Outro',
    assunto: '',
    sintese: '',
    fundamentacao: '',
    areas: ['Geral'],
    topicos: [],
    conclusao: '',
    keywords: [],
    materias: [],
  }
}

/**
 * Extrai JSON do formato unificado {classification, ementa, key_points}.
 * Tenta multiplas estrategias:
 *  1. Parse direto (apos remover markdown/fence)
 *  2. Encontrar primeiro { e ultimo }
 *  3. REPARO DE TRUNCAMENTO: se a resposta foi cortada (maxTokens), fecha
 *     strings/arrays/objetos abertos. Como classification+ementa vem ANTES de
 *     key_points no prompt, o reparo preserva justamente a ementa (o que o
 *     usuario mais precisa) mesmo quando key_points ficou parcial.
 */
function tryParseUnifiedJson(
  raw: string,
): { ok: true; value: Record<string, unknown>; repaired?: boolean } | { ok: false; error: string } {
  if (!raw) return { ok: false, error: 'resposta vazia' }
  let jsonStr = raw.trim()
  // Remover markdown code blocks (```json ... ``` ou ``` ... ```)
  const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) jsonStr = fenced[1].trim()
  // Recortar do primeiro { ate o ultimo } (quando fechado)
  const firstBrace = jsonStr.indexOf('{')
  if (firstBrace < 0) return { ok: false, error: 'nenhum objeto JSON encontrado' }
  const lastBrace = jsonStr.lastIndexOf('}')
  const candidate = lastBrace > firstBrace ? jsonStr.slice(firstBrace, lastBrace + 1) : jsonStr.slice(firstBrace)

  // Tentativa 1: parse direto
  try {
    return { ok: true, value: JSON.parse(candidate) }
  } catch {
    // continua para o reparo
  }

  // Tentativa 2: reparar truncamento (fecha aspas/arrays/objetos abertos)
  const repaired = repairTruncatedJson(jsonStr.slice(firstBrace))
  if (repaired) {
    try {
      return { ok: true, value: JSON.parse(repaired), repaired: true }
    } catch (err) {
      return { ok: false, error: `reparo falhou: ${(err as Error).message}` }
    }
  }
  return { ok: false, error: 'JSON invalido e nao reparavel' }
}

/**
 * Repara um JSON truncado (cortado no meio por limite de tokens).
 *
 * Passos:
 *  1. Se terminou DENTRO de uma string, corta ate o inicio dessa string parcial.
 *  2. Apara o "rabo" pendente: virgula final, e "chave": sem valor (dois-pontos
 *     ou chave orfa) — situacao comum quando o corte cai logo apos uma chave.
 *  3. Recalcula a pilha de delimitadores e fecha objetos/arrays abertos.
 *
 * Como classification+ementa vem ANTES de key_points no prompt, o corte
 * costuma ocorrer em key_points — o reparo preserva a ementa (o que o usuario
 * mais precisa). Retorna null se nao houver o que reparar.
 */
export function repairTruncatedJson(input: string): string | null {
  if (!input) return null
  const s = input

  // Passo 0: detectar estado final (dentro de string?) e onde a string parcial comecou.
  let inString = false
  let escaped = false
  let openQuoteIdx = -1
  const depthStack: Array<'{' | '['> = []
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; openQuoteIdx = i; continue }
    if (ch === '{' || ch === '[') depthStack.push(ch)
    else if (ch === '}' || ch === ']') depthStack.pop()
  }
  if (depthStack.length === 0 && !inString) return null // ja' estava fechado

  // Passo 1: se terminou dentro de uma string, descarta a string parcial.
  let body = inString && openQuoteIdx >= 0 ? s.slice(0, openQuoteIdx) : s
  body = body.trimEnd()

  // Passo 2: apara virgula/chave orfa/dois-pontos pendentes no fim.
  //  Ex: '{"a":"b","c":'  ->  remove ':' e a chave '"c"' e a ',' -> '{"a":"b"'
  for (let guard = 0; guard < 50; guard++) {
    if (body.endsWith(',')) { body = body.slice(0, -1).trimEnd(); continue }
    if (body.endsWith(':')) {
      body = body.slice(0, -1).trimEnd() // remove ':'
      const keyMatch = body.match(/"(?:[^"\\]|\\.)*"$/) // remove a chave orfa
      if (keyMatch) body = body.slice(0, body.length - keyMatch[0].length).trimEnd()
      continue
    }
    break
  }

  // Passo 3: recalcula os delimitadores abertos no corpo aparado e os fecha.
  const closeStack: Array<'{' | '['> = []
  let inStr2 = false
  let esc2 = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (inStr2) {
      if (esc2) esc2 = false
      else if (ch === '\\') esc2 = true
      else if (ch === '"') inStr2 = false
      continue
    }
    if (ch === '"') { inStr2 = true; continue }
    if (ch === '{' || ch === '[') closeStack.push(ch)
    else if (ch === '}' || ch === ']') closeStack.pop()
  }
  const closers = closeStack.reverse().map((d) => (d === '{' ? '}' : ']')).join('')
  const result = body + closers
  return result.length > 2 ? result : null
}
