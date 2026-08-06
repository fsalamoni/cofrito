/**
 * Guardrails — filtra escopo e detecta off-topic.
 */

import type { RetrievedChunk } from './retrieval'

export interface ScopeCheckResult {
  inScope: boolean
  reason?: string
  refusalMessage?: string
}

const OFF_TOPIC_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /clima|tempo|previs[ãa]o|meteorologia|chover|chuva|temperatura|umidade/i, reason: 'clima' },
  { pattern: /futebol|jogo|campeonato|brasileir[ãa]o|gr[êe]mio|internacional/i, reason: 'esporte' },
  { pattern: /receita|culin[áa]ria|cozinhar|comida|restaurante|bolo/i, reason: 'culinária' },
  { pattern: /piada|anedota/i, reason: 'entretenimento' },
  { pattern: /m[úu]sica|filme|s[êe]rie|netflix/i, reason: 'entretenimento' },
  { pattern: /criptomoeda|bitcoin|investimento|a[çc][ãa]o.*bolsa|d[óo]lar/i, reason: 'investimento' },
  { pattern: /comprar.*carro|im[óo]vel.*comprar|casa pr[óo]pria/i, reason: 'compra pessoal' },
]

const JAILBREAK_PATTERNS = [
  /ignore (previous|all) instructions/i,
  /act as (a|an) /i,
  /forget you (are|were) /i,
  /pretend (to be|you are) /i,
  /disregard (your|all) (rules|instructions)/i,
]

const CASE_ANALYSIS_PATTERNS = [
  /no meu caso|no caso concreto|na minha a[çc][ãa]o|na minha apura[çc][ãa]o/i,
  /parte|autuado|investigado|denunciado|r[ée]u|autor/i,
  /an[áa]lise.*(caso|ac[óo]rd[ãa]o|autos)/i,
]

export function checkScopeGuardrail(
  query: string,
  chunks: RetrievedChunk[],
): ScopeCheckResult {
  // 1. Jailbreak
  for (const p of JAILBREAK_PATTERNS) {
    if (p.test(query)) {
      return {
        inScope: false,
        reason: 'jailbreak',
        refusalMessage:
          'Desculpe, não posso processar essa solicitação. Posso ajudá-lo(a) com consultas sobre o material do CAOCIPP.',
      }
    }
  }

  // 2. Análise de caso concreto
  for (const p of CASE_ANALYSIS_PATTERNS) {
    if (p.test(query)) {
      return {
        inScope: false,
        reason: 'case_analysis',
        refusalMessage:
          'Este assistente não analisa casos concretos — o exame do acervo fático-probatório é de responsabilidade do órgão de execução (Ordem de Serviço nº 002/2015, art. 2º, IX).\n\nPosso ajudá-lo(a) a:\n- Localizar material institucional sobre a tese jurídica aplicável\n- Abrir uma consulta formal ao CAOCIPP para análise específica',
      }
    }
  }

  // 3. Off-topic
  for (const { pattern, reason } of OFF_TOPIC_PATTERNS) {
    if (pattern.test(query)) {
      return {
        inScope: false,
        reason: `off_topic:${reason}`,
        refusalMessage: `Desculpe, "${reason}" está fora do escopo deste assistente, dedicado exclusivamente ao material do CAOCIPP. Posso ajudá-lo(a) com direito administrativo, constitucional, improbidade, patrimônio público ou procedimentos do MP.`,
      }
    }
  }

  // 4. Sem chunks
  if (chunks.length === 0) {
    return {
      inScope: false,
      reason: 'no_results',
      refusalMessage:
        'Não encontrei material específico sobre isso no acervo do CAOCIPP. Posso orientá-lo(a) na abertura de uma consulta formal ao CAOCIPP?',
    }
  }

  // 5. Similaridade baixa
  const maxSim = Math.max(...chunks.map((c) => c.similarity))
  if (maxSim < 0.55) {
    return {
      inScope: false,
      reason: 'low_similarity',
      refusalMessage:
        'Não encontrei material específico sobre isso no acervo do CAOCIPP. Posso orientá-lo(a) na abertura de uma consulta formal ao CAOCIPP?',
    }
  }

  return { inScope: true }
}
