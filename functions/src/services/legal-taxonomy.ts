/**
 * Legal Taxonomy — vocabulário jurídico MAPEADO e editável da plataforma.
 *
 * O admin mapeia os tipos possíveis (tipos de documento, áreas do direito e
 * assuntos/temas). Esse vocabulário:
 *  - orienta o agente de acervo na classificação (injetado no system prompt);
 *  - dá consistência às tags para busca no chat.
 *
 * As 6 NATUREZAS (consultivo/executório/…) permanecem fixas por serem um eixo
 * conceitual estável; o que cresce é a lista de tipos/áreas/assuntos.
 *
 * Persistido em `admin-config/legal-taxonomy` (envelope de auditoria).
 */
import { logger } from 'firebase-functions'
import { loadConfigDoc } from './config-store'

export interface LegalTaxonomy {
  /** Tipos específicos de documento (Parecer, Sentença, TAC, …). */
  tiposDocumento: string[]
  /** Áreas do direito (Administrativo, Penal, …). */
  areasDireito: string[]
  /** Assuntos/temas jurídicos recorrentes (Nepotismo, Licitação, …). */
  assuntos: string[]
}

export const LEGAL_TAXONOMY_PATH = 'admin-config/legal-taxonomy'

export const DEFAULT_LEGAL_TAXONOMY: LegalTaxonomy = {
  tiposDocumento: [
    'Parecer', 'Nota Técnica', 'Manifestação', 'Informação', 'Petição inicial',
    'Denúncia', 'Recurso', 'Contrarrazões', 'Sentença', 'Acórdão', 'Despacho',
    'Decisão interlocutória', 'TAC', 'ANPC', 'ANPP', 'Recomendação', 'Portaria',
    'Resolução', 'Contrato', 'Edital', 'Termo de Referência', 'Convênio', 'Ofício',
    'Jurisprudência', 'Súmula', 'Artigo', 'Notícia', 'Livro', 'Outro',
  ],
  areasDireito: [
    'Direito Administrativo', 'Direito Constitucional', 'Direito Civil',
    'Direito Processual Civil', 'Direito Penal', 'Direito Processual Penal',
    'Direito Tributário', 'Direito Financeiro', 'Direito Ambiental',
    'Direito Urbanístico', 'Direito do Trabalho', 'Direito Processual do Trabalho',
    'Direito do Consumidor', 'Direito Empresarial', 'Direito Eleitoral',
    'Direito Previdenciário', 'Direito da Criança e do Adolescente',
    'Direito do Idoso', 'Direito à Saúde', 'Improbidade Administrativa',
    'Patrimônio Público', 'Direitos Humanos',
  ],
  assuntos: [
    'Nepotismo', 'Licitação', 'Dispensa de licitação', 'Inexigibilidade',
    'Improbidade administrativa', 'Patrimônio público', 'Concurso público',
    'Cargo em comissão', 'Função de confiança', 'Contrato administrativo',
    'Convênio', 'Termo de Ajustamento de Conduta', 'Súmula Vinculante 13',
    'Súmula Vinculante 10', 'Repercussão geral', 'Controle de constitucionalidade',
    'Saúde pública', 'Educação', 'Meio ambiente', 'Acesso à informação (LAI)',
    'Consórcio público', 'Terceirização', 'Subsídio', 'Precatório',
  ],
}

// ── Normalização ──────────────────────────────────────────────────────────

function cleanList(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const v = item.trim().slice(0, 120)
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
    if (out.length >= 300) break
  }
  return out
}

export function normalizeLegalTaxonomy(raw: unknown): LegalTaxonomy {
  const r = (typeof raw === 'object' && raw !== null) ? raw as Record<string, unknown> : {}
  return {
    tiposDocumento: cleanList(r.tiposDocumento, DEFAULT_LEGAL_TAXONOMY.tiposDocumento),
    areasDireito: cleanList(r.areasDireito, DEFAULT_LEGAL_TAXONOMY.areasDireito),
    assuntos: cleanList(r.assuntos, DEFAULT_LEGAL_TAXONOMY.assuntos),
  }
}

// ── Load ────────────────────────────────────────────────────────────────

/** Lê a taxonomia persistida (mesclada com defaults). Nunca lança. */
export async function loadLegalTaxonomy(): Promise<LegalTaxonomy> {
  try {
    const loaded = await loadConfigDoc<unknown>(LEGAL_TAXONOMY_PATH, 'legal-taxonomy')
    if (!loaded) return DEFAULT_LEGAL_TAXONOMY
    return normalizeLegalTaxonomy(loaded.data)
  } catch (err) {
    logger.warn('loadLegalTaxonomy: falhou, usando defaults', { err: (err as Error).message })
    return DEFAULT_LEGAL_TAXONOMY
  }
}

// ── Prompt block ───────────────────────────────────────────────────────

/**
 * Renderiza a taxonomia como bloco de orientação para o system prompt do
 * agente de acervo. O agente deve PREFERIR estes termos, podendo criar novos
 * quando o caso exigir.
 */
export function buildTaxonomyPromptBlock(t: LegalTaxonomy): string {
  const lines: string[] = ['# TAXONOMIA JURÍDICA MAPEADA (preferir estes termos; criar novos só se necessário)']
  if (t.tiposDocumento.length) lines.push(`Tipos de documento: ${t.tiposDocumento.join(', ')}.`)
  if (t.areasDireito.length) lines.push(`Áreas do direito: ${t.areasDireito.join(', ')}.`)
  if (t.assuntos.length) lines.push(`Assuntos/temas: ${t.assuntos.join(', ')}.`)
  return lines.join('\n')
}
