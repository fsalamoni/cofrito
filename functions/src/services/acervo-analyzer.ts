/**
 * Acervo Analyzer — pipeline de analise automatica de documentos do acervo.
 *
 * 3 agentes LLM que rodam em PARALELO:
 *  1. Classificador — natureza, area_direito, assuntos, tipo_documento, contexto
 *  2. Ementa — tipo, assunto, sintese, areas, topicos, conclusao, keywords
 *  3. Pontos Relevantes — key_points[], reusable_content
 *
 * Porta os prompts da Lexio (https://github.com/fsalamoni/Lexio).
 * Os agentes usam o LLM config JÁ CARREGADO (sem novo load de API).
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

export interface AcervoAnalyzerInput {
  uid: string
  docId: string
  fileName: string
  text: string
  /** LLM config JÁ CARREGADO (do configToUse global) */
  llmConfig: LLMConfigLike
}

// ── Constants ──────────────────────────────────────────────────────────

const MAX_SOURCE_CHARS = 8000  // mesmo da Lexio
const NATUREZA_VALUES: Natureza[] = ['consultivo', 'executorio', 'transacional', 'negocial', 'doutrinario', 'decisorio']

// ── Prompts (port da Lexio) ────────────────────────────────────────────

const CLASSIFICADOR_SYSTEM = [
  'Você é um classificador especializado em documentos jurídicos.',
  'Sua tarefa é gerar tags de classificação estruturadas para indexação e busca.',
  '',
  '<categorias_natureza>',
  'Classifique o documento em UMA das seguintes naturezas:',
  '- "consultivo": Documentos de emissão de opinião (parecer, informativo, manifestação, nota técnica, consulta)',
  '- "executorio": Documentos de movimentação processual ativa (petição inicial, denúncia, recurso, contrarrazões, impugnação, agravo)',
  '- "transacional": Documentos de acordo ou transação (ANPC, ANPP, TAC, acordo processual, termo de compromisso)',
  '- "negocial": Documentos de relação contratual (minuta de contrato, edital, termo de referência, aditivo contratual)',
  '- "doutrinario": Documentos de produção teórica ou acadêmica (artigo, livro, tese, monografia, estudo)',
  '- "decisorio": Documentos de atos decisórios (sentença, acórdão, jurisprudência, despacho, decisão interlocutória)',
  '</categorias_natureza>',
  '',
  '<formato>',
  'Responda APENAS com JSON puro (sem markdown), no formato:',
  '{',
  '  "natureza": "consultivo|executorio|transacional|negocial|doutrinario|decisorio",',
  '  "area_direito": ["Direito Administrativo", "Direito Constitucional"],',
  '  "assuntos": ["Licitação", "Contratação direta", "Dispensa de licitação"],',
  '  "tipo_documento": "Parecer",',
  '  "contexto": ["Município celebrou contrato sem licitação", "Empresa questionou dispensa"]',
  '}',
  '</formato>',
  '',
  'REGRAS:',
  '- "natureza": Deve ser EXATAMENTE um dos 6 valores acima.',
  '- "area_direito": Liste 1 a 5 áreas do direito relacionadas ao conteúdo.',
  '- "assuntos": Liste 2 a 8 matérias/temas objeto da fundamentação do documento.',
  '- "tipo_documento": Identifique o tipo específico do documento (ex: Parecer, Petição inicial, Sentença, TAC, Contrato, etc.).',
  '- "contexto": Liste 1 a 5 circunstâncias fáticas tratadas no caso.',
].join('\n')

const EMENTA_SYSTEM = [
  'Você é um indexador de documentos jurídicos.',
  'Sua tarefa é gerar uma ementa estruturada para indexação e busca.',
  '',
  '<formato>',
  'Responda APENAS com JSON puro (sem markdown), no formato:',
  '{',
  '  "tipo": "Parecer|Petição|ACP|Sentença|Recurso|Outro",',
  '  "assunto": "Tema principal em 1-2 palavras (ex: Nepotismo, Licitação, Improbidade)",',
  '  "sintese": "Síntese do caso em 1-2 frases curtas",',
  '  "areas": ["Direito Administrativo", "Direito Constitucional"],',
  '  "topicos": ["Súmula Vinculante 13", "Princípios da Administração", "União Estável"],',
  '  "conclusao": "Conclusão em 1 frase",',
  '  "keywords": ["nepotismo", "cargo político", "união estável", "súmula vinculante 13"]',
  '}',
  '</formato>',
  '',
  'IMPORTANTE: As keywords devem incluir TODAS as palavras-chave relevantes para busca,',
  'incluindo sinônimos e termos relacionados. Mínimo 5, máximo 20 keywords.',
].join('\n')

const KEYPOINTS_SYSTEM = [
  'Você é um analista jurídico especializado em identificar pontos relevantes.',
  'Sua tarefa é analisar o documento e gerar:',
  '  1. key_points: lista de 3-8 pontos RELEVANTES tratados no documento (frases curtas, objetivas)',
  '  2. reusable_content: trecho CITÁVEL (1-3 parágrafos) que pode ser reutilizado em outras análises',
  '',
  '<formato>',
  'Responda APENAS com JSON puro (sem markdown), no formato:',
  '{',
  '  "key_points": ["Ponto 1 em 1 frase", "Ponto 2 em 1 frase", "Ponto 3 em 1 frase"],',
  '  "reusable_content": "Trecho citável do documento (1-3 parágrafos preservando a linguagem original)"',
  '}',
  '</formato>',
  '',
  'REGRAS:',
  '- key_points: cada ponto deve ser OBJETIVO e CURTO (1 frase). Foque nos aspectos mais relevantes para indexação.',
  '- reusable_content: copie trechos LITERAIS do documento (preserve a linguagem). Use entre 200 e 1500 caracteres.',
].join('\n')

// ── Funções principais ─────────────────────────────────────────────────

/**
 * Classifica o documento (natureza, área, assuntos, tipo, contexto).
 */
export async function classifyAcervoDoc(input: AcervoAnalyzerInput): Promise<Classification> {
  const sourceText = input.text.slice(0, MAX_SOURCE_CHARS)
  const userPrompt = `Arquivo: ${input.fileName}\n\n<texto>\n${sourceText}\n</texto>\n\nGere as tags de classificação para este documento.`

  const result = await generateWithProvider({
    systemPrompt: CLASSIFICADOR_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
    config: { ...input.llmConfig, maxTokens: 800, temperature: 0.1 },
  })

  const parsed = tryParseJsonObject<{
    natureza?: string
    area_direito?: string[]
    assuntos?: string[]
    tipo_documento?: string
    contexto?: string[]
  }>(result.content, 'classificador')

  if (!parsed.ok) {
    return getDefaultClassification()
  }

  const naturezaCandidate = parsed.value.natureza as Natureza | undefined
  const natureza: Natureza = naturezaCandidate && NATUREZA_VALUES.includes(naturezaCandidate)
    ? naturezaCandidate
    : 'consultivo'

  return {
    natureza,
    areaDireito: parsed.value.area_direito || [],
    assuntos: parsed.value.assuntos || [],
    tipoDocumento: parsed.value.tipo_documento || '',
    contexto: parsed.value.contexto || [],
  }
}

/**
 * Gera ementa estruturada (tipo, assunto, síntese, áreas, tópicos, conclusão, keywords).
 */
export async function generateEmentaForAcervo(input: AcervoAnalyzerInput): Promise<Ementa> {
  const sourceText = input.text.slice(0, MAX_SOURCE_CHARS)
  const userPrompt = `Arquivo: ${input.fileName}\n\n<texto>\n${sourceText}\n</texto>\n\nGere a ementa e keywords para este documento.`

  const result = await generateWithProvider({
    systemPrompt: EMENTA_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
    config: { ...input.llmConfig, maxTokens: 1000, temperature: 0.1 },
  })

  const parsed = tryParseJsonObject<{
    tipo?: string
    assunto?: string
    sintese?: string
    areas?: string[]
    topicos?: string[]
    conclusao?: string
    keywords?: string[]
  }>(result.content, 'ementa')

  if (!parsed.ok) {
    return getDefaultEmenta()
  }

  // Extrair keywords tambem do filename
  const filenameKeywords = input.fileName
    .replace(/^\d{8}\s*-\s*/, '')  // remove YYYYMMDD - prefix
    .replace(/\.docx?$/i, '')
    .split(/[.\s,;]+/)
    .filter(w => w.length > 2)
    .map(w => w.toLowerCase())

  return {
    tipo: parsed.value.tipo || 'Outro',
    assunto: parsed.value.assunto || '',
    sintese: parsed.value.sintese || '',
    areas: parsed.value.areas || [],
    topicos: parsed.value.topicos || [],
    conclusao: parsed.value.conclusao || '',
    keywords: Array.from(new Set([...(parsed.value.keywords || []), ...filenameKeywords])).slice(0, 30),
  }
}

/**
 * Extrai pontos relevantes e conteúdo reutilizável.
 */
export async function extractKeyPointsForAcervo(input: AcervoAnalyzerInput): Promise<KeyPoints> {
  const sourceText = input.text.slice(0, MAX_SOURCE_CHARS)
  const userPrompt = `Arquivo: ${input.fileName}\n\n<texto>\n${sourceText}\n</texto>\n\nIdentifique os pontos relevantes e selecione um trecho citável.`

  const result = await generateWithProvider({
    systemPrompt: KEYPOINTS_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
    config: { ...input.llmConfig, maxTokens: 1500, temperature: 0.1 },
  })

  const parsed = tryParseJsonObject<{
    key_points?: string[]
    reusable_content?: string
  }>(result.content, 'keypoints')

  if (!parsed.ok) {
    return { items: [], reusableContent: '' }
  }

  return {
    items: (parsed.value.key_points || []).slice(0, 8),
    reusableContent: (parsed.value.reusable_content || '').slice(0, 2000),
  }
}

// ── Orquestrador (roda em background) ──────────────────────────────────

export interface AnalyzeResult {
  classification: Classification
  ementa: Ementa
  keyPoints: KeyPoints
  /** Latência total */
  totalLatencyMs: number
  /** Latência individual de cada agente */
  agentLatencies: { classification: number; ementa: number; keyPoints: number }
}

/**
 * Roda os 3 agentes em PARALELO. Retorna resultado consolidado.
 * Não lanca erro: cada agente tem fallback (defaults).
 */
export async function analyzeAcervoDoc(input: AcervoAnalyzerInput): Promise<AnalyzeResult> {
  const start = Date.now()
  logger.info('acervo-analyzer.start', { docId: input.docId, fileName: input.fileName })

  const [classResult, ementaResult, keypointsResult] = await Promise.allSettled([
    classifyAcervoDoc(input),
    generateEmentaForAcervo(input),
    extractKeyPointsForAcervo(input),
  ])

  const classification = classResult.status === 'fulfilled' ? classResult.value : getDefaultClassification()
  const ementa = ementaResult.status === 'fulfilled' ? ementaResult.value : getDefaultEmenta()
  const keyPoints = keypointsResult.status === 'fulfilled' ? keypointsResult.value : { items: [], reusableContent: '' }

  // Erros são logados mas não interrompem
  if (classResult.status === 'rejected') logger.warn('classify failed', { err: (classResult.reason as Error).message })
  if (ementaResult.status === 'rejected') logger.warn('ementa failed', { err: (ementaResult.reason as Error).message })
  if (keypointsResult.status === 'rejected') logger.warn('keypoints failed', { err: (keypointsResult.reason as Error).message })

  const totalLatencyMs = Date.now() - start
  logger.info('acervo-analyzer.done', { docId: input.docId, totalLatencyMs })

  return {
    classification,
    ementa,
    keyPoints,
    totalLatencyMs,
    agentLatencies: { classification: 0, ementa: 0, keyPoints: 0 }, // placeholder
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function getDefaultClassification(): Classification {
  return {
    natureza: 'consultivo',
    areaDireito: [],
    assuntos: [],
    tipoDocumento: '',
    contexto: [],
  }
}

function getDefaultEmenta(): Ementa {
  return {
    tipo: 'Outro',
    assunto: '',
    sintese: '',
    areas: [],
    topicos: [],
    conclusao: '',
    keywords: [],
  }
}

/**
 * Extrai JSON de um texto que pode ter markdown ou texto adicional.
 */
function tryParseJsonObject<T>(raw: string, tag: string): { ok: true; value: T } | { ok: false; error: string } {
  if (!raw) return { ok: false, error: `${tag}: empty response` }
  let jsonStr = raw.trim()
  // Remove markdown code blocks
  const fencedMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch) jsonStr = fencedMatch[1].trim()
  // Encontra o primeiro { e o ultimo }
  const firstBrace = jsonStr.indexOf('{')
  const lastBrace = jsonStr.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace < 0 || lastBrace < firstBrace) {
    return { ok: false, error: `${tag}: no JSON object found` }
  }
  jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
  try {
    const parsed = JSON.parse(jsonStr) as T
    return { ok: true, value: parsed }
  } catch (err) {
    return { ok: false, error: `${tag}: ${(err as Error).message}` }
  }
}
