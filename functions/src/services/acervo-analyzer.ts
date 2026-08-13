/**
 * Acervo Analyzer — analise automatica de documentos do acervo via LLM.
 *
 * ARQUITETURA: agente unico com 3 skills (classification + ementa + keyPoints)
 * executadas em UMA UNICA chamada LLM, retornando JSON estruturado.
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

export interface Ementa {
  tipo: string
  /** Ex: "Parecer", "Sentença", "Acórdão", "Despacho", "Nota Técnica", "Notícia", "Manifestação", "Artigo", "Doutrina", "Livro" */
  tipoDocumento?: string
  assunto: string
  /** Síntese curta do caso (1-2 frases) */
  sintese: string
  /** Fundamentação jurídica principal (tese, ratio, argumentos) — para documentos jurídicos */
  fundamentacao?: string
  areas: string[]
  topicos: string[]
  conclusao: string
  keywords: string[]
}

export interface KeyPoints {
  items: string[]
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
}

export interface AcervoAnalysisResult {
  classification: Classification | null
  ementa: Ementa | null
  keyPoints: KeyPoints
  /** Latencia total (incluindo retry se houver) */
  totalLatencyMs: number
  /** Tokens consumidos (input + output) */
  tokens: { input: number; output: number; total: number }
}

// ── Constants ──────────────────────────────────────────────────────────

const MAX_SOURCE_CHARS = 12000  // aumentado: agora envia 1 vez para 3 skills
const NATUREZA_VALUES: Natureza[] = ['consultivo', 'executorio', 'transacional', 'negocial', 'doutrinario', 'decisorio']

// ── Prompt do agente unificado (3 skills em 1 chamada) ─────────────────

const UNIFIED_SYSTEM_PROMPT = [
  'Você é um analista jurídico especializado. Sua tarefa é analisar o documento fornecido',
  'e gerar TRÊS produtos de uma só vez, em um único JSON estruturado:',
  '',
  '═══════════════════════════════════════════════════════════════════',
  'SKILL 1: CLASSIFICAÇÃO',
  '═══════════════════════════════════════════════════════════════════',
  'Tags estruturadas para indexação e busca do documento.',
  '',
  '<categorias_natureza>',
  'Escolha EXATAMENTE UMA natureza:',
  '- "consultivo": Documentos de emissão de opinião (parecer, informativo, manifestação, nota técnica, consulta)',
  '- "executorio": Documentos de movimentação processual ativa (petição inicial, denúncia, recurso, contrarrazões, impugnação, agravo)',
  '- "transacional": Documentos de acordo ou transação (ANPC, ANPP, TAC, acordo processual, termo de compromisso)',
  '- "negocial": Documentos de relação contratual (minuta de contrato, edital, termo de referência, aditivo contratual)',
  '- "doutrinario": Documentos de produção teórica ou acadêmica (artigo, livro, tese, monografia, estudo)',
  '- "decisorio": Documentos de atos decisórios (sentença, acórdão, jurisprudência, despacho, decisão interlocutória)',
  '</categorias_natureza>',
  '',
  '═══════════════════════════════════════════════════════════════════',
  'SKILL 2: EMENTA',
  '═══════════════════════════════════════════════════════════════════',
  'Ementa estruturada para indexação rápida e busca por keyword.',
  '',
  '═══════════════════════════════════════════════════════════════════',
  'SKILL 3: PONTOS RELEVANTES',
  '═══════════════════════════════════════════════════════════════════',
  'Pontos relevantes e trecho citável para reuso em outras análises.',
  '',
  '═══════════════════════════════════════════════════════════════════',
  'FORMATO DE SAÍDA',
  '═══════════════════════════════════════════════════════════════════',
  'Responda APENAS com JSON puro (sem markdown, sem preâmbulo), exatamente:',
  '{',
  '  "classification": {',
  '    "natureza": "consultivo|executorio|transacional|negocial|doutrinario|decisorio",',
  '    "area_direito": ["Direito Administrativo", "Direito Constitucional"],',
  '    "assuntos": ["Licitação", "Dispensa de licitação"],',
  '    "tipo_documento": "Parecer",',
  '    "contexto": ["Município celebrou contrato sem licitação"]',
  '  },',
  '  "ementa": {',
  '    "tipo": "Parecer|Petição|ACP|Sentença|Recurso|Outro",',
  '    "assunto": "Tema principal em 1-2 palavras",',
  '    "sintese": "Síntese do caso em 1-2 frases curtas",',
  '    "fundamentacao": "Fundamentação jurídica principal (tese, ratio, argumentos) - para docs jurídicos",',
  '    "areas": ["Direito Administrativo"],',
  '    "topicos": ["Súmula Vinculante 13"],',
  '    "conclusao": "Conclusão em 1 frase",',
  '    "keywords": ["nepotismo", "cargo político", "SV 13"]',
  '  },',
  '  "key_points": {',
  '    "items": ["Ponto 1 em 1 frase", "Ponto 2 em 1 frase", "Ponto 3 em 1 frase"],',
  '    "reusable_content": "Trecho citável (1-3 parágrafos, 200-1500 chars, preserve linguagem original)"',
  '  }',
  '}',
  '',
  '═══════════════════════════════════════════════════════════════════',
  'REGRAS GERAIS',
  '═══════════════════════════════════════════════════════════════════',
  '- classification.natureza: EXATAMENTE um dos 6 valores acima (sem variações).',
  '- classification.area_direito: 1 a 5 áreas.',
  '- classification.assuntos: 2 a 8 matérias/temas objeto da fundamentação.',
  '- classification.tipo_documento: tipo específico (ex: Parecer, Petição inicial, Sentença, TAC, Contrato).',
  '- classification.contexto: 1 a 5 circunstâncias fáticas.',
  '- ementa.assunto: CURTO (1-2 palavras), ideal para busca rápida.',
'- ementa.fundamentacao: para docs jurídicos, cite a tese/razão de decidir; pode ser vazia para docs não jurídicos.',
  '- ementa.keywords: TODAS as palavras relevantes para busca, incluindo sinônimos (mín 5, máx 25).',
  '- key_points.items: 3 a 8 pontos OBJETIVOS e CURTOS (1 frase cada).',
  '- key_points.reusable_content: copie trechos LITERAIS do documento (200-1500 chars).',
  '',
  'IMPORTANTE: Faça tudo em uma única cadeia de raciocínio. Os 3 produtos devem ser',
  'CONSISTENTES entre si (a ementa deve refletir a classification, os keywords devem',
  'cobrir os assuntos, etc).',
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
    prompt = prompt.replace(/═══════════════════════════════════════════════════════════════════\nSKILL 3: PONTOS RELEVANTES[\s\S]*?(?=═══════════════════════════════════════════════════════════════════)/,
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
  let result: { content: string; tokens: { input: number; output: number; total: number } }
  try {
    result = await generateWithProvider({
      systemPrompt: buildSystemPrompt(input.pipelineFlags),
      messages: [{ role: 'user', content: userPrompt }],
      // maxTokens generoso: cobre 3 outputs estruturados
      config: { ...input.llmConfig, maxTokens: 2000, temperature: 0.1 },
    })
  } catch (err) {
    logger.warn('analyzeAcervoDoc: LLM falhou, usando heuristica de fallback', { err: (err as Error).message })
    const heuristic = getHeuristicAnalysis(input.fileName, input.text)
    return {
      classification: heuristic.classification,
      ementa: heuristic.ementa,
      keyPoints: heuristic.keyPoints,
      totalLatencyMs: Date.now() - start,
      tokens: { input: 0, output: 0, total: 0 },
    }
  }

  // 3. Parsear JSON unificado
  const parsed = tryParseUnifiedJson(result.content)
  if (!parsed.ok) {
    logger.warn('analyzeAcervoDoc: JSON invalido, usando heuristica de fallback', { error: parsed.error })
    const heuristic = getHeuristicAnalysis(input.fileName, input.text)
    return {
      classification: heuristic.classification,
      ementa: heuristic.ementa,
      keyPoints: heuristic.keyPoints,
      totalLatencyMs: Date.now() - start,
      tokens: result.tokens,
    }
  }

  // 4. Normalizar cada skill (respeitando os toggles)
  const enableClassifier = input.pipelineFlags?.enableClassifier !== false
  const enableEmenta = input.pipelineFlags?.enableEmenta !== false
  const enableKeyPoints = input.pipelineFlags?.enableKeyPoints !== false
  const classification = enableClassifier ? normalizeClassification(parsed.value.classification) : null
  const ementa = enableEmenta ? normalizeEmenta(parsed.value.ementa, input.fileName) : null
  const keyPoints = enableKeyPoints ? normalizeKeyPoints(parsed.value.key_points) : { items: [], reusableContent: '' }

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
  }
}

// ── Normalizadores (cada skill) ───────────────────────────────────────

/**
 * Heuristica de fallback: gera classification + ementa basicas
 * a partir do filename e do texto, quando o LLM nao esta disponivel.
 * SEMPRE retorna dados uteis (nunca campos vazios).
 */
export function getHeuristicAnalysis(fileName: string, text: string): { classification: Classification; ementa: Ementa; keyPoints: KeyPoints } {
  const lower = fileName.toLowerCase()
  const textLower = text.toLowerCase().slice(0, 5000)

  // Detectar tipo do documento
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
  ]
  for (const a of assuntoPatterns) {
    if (textLower.includes(a.toLowerCase())) assuntos.push(a)
  }

  // Topicos
  const topicos: string[] = []
  if (/sv\s*13|sumula\s+vinculante\s+13/i.test(textLower)) topicos.push('SV 13')
  if (/sv\s*10|sumula\s+vinculante\s+10/i.test(textLower)) topicos.push('SV 10')
  if (/sumula\s+vinculante/i.test(textLower) && topicos.length === 0) topicos.push('Súmula Vinculante')

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
    sintese: 'Documento do acervo. Metadata extraída heuristicamente (análise LLM não disponível no momento).',
    fundamentacao: 'Análise LLM não disponível. Metadata gerada via heurística a partir do filename e conteúdo.',
    areas: areas.length > 0 ? areas : ['Geral'],
    topicos: topicos.length > 0 ? topicos : [],
    conclusao: 'Aguardando reanálise com LLM para resultados completos.',
    keywords,
  }
  const keyPoints: KeyPoints = {
    items: [
      `Tipo detectado: ${tipoDocumento}`,
      ...(areas.length > 0 ? [`Área: ${areas[0]}`] : []),
      ...(assuntos.length > 0 ? [`Assunto principal: ${assuntos[0]}`] : []),
      `Total de palavras-chave extraídas: ${keywords.length}`,
    ],
    reusableContent: '',
  }
  return { classification, ementa, keyPoints }
}

function getDefaultClassification(): Classification {
  return { natureza: 'consultivo', areaDireito: [], assuntos: [], tipoDocumento: '', contexto: [] }
}

function getDefaultEmenta(): Ementa {
  return { tipo: 'Outro', assunto: '', sintese: '', areas: [], topicos: [], conclusao: '', keywords: [] }
}

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
    assunto: typeof obj.assunto === 'string' ? obj.assunto : '',
    sintese: typeof obj.sintese === 'string' ? obj.sintese : '',
    fundamentacao: typeof obj.fundamentacao === 'string' ? obj.fundamentacao : '',
    areas: Array.isArray(obj.areas) ? obj.areas.filter((x: unknown) => typeof x === 'string') : [],
    topicos: Array.isArray(obj.topicos) ? obj.topicos.filter((x: unknown) => typeof x === 'string') : [],
    conclusao: typeof obj.conclusao === 'string' ? obj.conclusao : '',
    keywords: Array.from(new Set([...llmKeywords, ...filenameKeywords])).slice(0, 30),
  }
}

function normalizeKeyPoints(raw: unknown): KeyPoints {
  const obj = asRecord(raw)
  if (!obj) return { items: [], reusableContent: '' }
  const items = Array.isArray(obj.items)
    ? obj.items.filter((x: unknown) => typeof x === 'string').slice(0, 8)
    : []
  const reusableContent = typeof obj.reusable_content === 'string'
    ? obj.reusable_content.slice(0, 2000)
    : ''
  return { items, reusableContent }
}


/**
 * Type guard: verifica se unknown eh um objeto nao-null.
 */
function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}

// ── Helpers ────────────────────────────────────────────────────────────



/**
 * Extrai JSON do formato unificado {classification, ementa, key_points}.
 * Tenta multiplas estrategias:
 *  1. Parse direto
 *  2. Remover markdown code blocks
 *  3. Encontrar primeiro { e ultimo }
 */
function tryParseUnifiedJson(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw) return { ok: false, error: 'empty response' }
  let jsonStr = raw.trim()
  // 1. Remover markdown code blocks
  const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) jsonStr = fenced[1].trim()
  // 2. Encontrar primeiro { e ultimo }
  const firstBrace = jsonStr.indexOf('{')
  const lastBrace = jsonStr.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace < 0 || lastBrace < firstBrace) {
    return { ok: false, error: 'no JSON object found' }
  }
  jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
  try {
    return { ok: true, value: JSON.parse(jsonStr) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
