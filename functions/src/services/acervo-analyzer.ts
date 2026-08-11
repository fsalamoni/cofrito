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
  assunto: string
  sintese: string
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
    logger.warn('analyzeAcervoDoc: LLM falhou, retornando defaults', { err: (err as Error).message })
    return {
      classification: getDefaultClassification(),
      ementa: getDefaultEmenta(),
      keyPoints: { items: [], reusableContent: '' },
      totalLatencyMs: Date.now() - start,
      tokens: { input: 0, output: 0, total: 0 },
    }
  }

  // 3. Parsear JSON unificado
  const parsed = tryParseUnifiedJson(result.content)
  if (!parsed.ok) {
    logger.warn('analyzeAcervoDoc: JSON invalido, retornando defaults', { error: parsed.error })
    return {
      classification: getDefaultClassification(),
      ementa: getDefaultEmenta(),
      keyPoints: { items: [], reusableContent: '' },
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
    assunto: typeof obj.assunto === 'string' ? obj.assunto : '',
    sintese: typeof obj.sintese === 'string' ? obj.sintese : '',
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

function getDefaultClassification(): Classification {
  return { natureza: 'consultivo', areaDireito: [], assuntos: [], tipoDocumento: '', contexto: [] }
}

function getDefaultEmenta(): Ementa {
  return { tipo: 'Outro', assunto: '', sintese: '', areas: [], topicos: [], conclusao: '', keywords: [] }
}

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
