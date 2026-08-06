/**
 * Anonymizer — filtra PII antes de enviar ao LLM.
 *
 * Substitui CPFs, PGEAs, e-mails, números de processo por placeholders.
 * O mapeamento é restaurado na resposta.
 */

const PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // CPF
  { pattern: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, label: 'cpf' },
  { pattern: /\b\d{11}\b/g, label: 'cpf_raw' },
  // PGEA
  { pattern: /\b\d{5}\.\d{3}\.\d{3}\/\d{4}\b/g, label: 'pgea' },
  // E-mail
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, label: 'email' },
  // Número de processo CNJ
  { pattern: /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g, label: 'processo' },
  // OAB
  { pattern: /\bOAB[\/\s]?[A-Z]{2}\s?\d{1,6}\b/gi, label: 'oab' },
  // Telefone
  { pattern: /\b\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, label: 'telefone' },
]

export interface AnonymizedResult {
  text: string
  mapping: Map<string, string>
}

export function filterPII(text: string): AnonymizedResult {
  const mapping = new Map<string, string>()
  let result = text
  let counter = 0

  for (const { pattern, label } of PATTERNS) {
    result = result.replace(pattern, (match) => {
      const placeholder = `[${label}_${counter++}]`
      mapping.set(placeholder, match)
      return placeholder
    })
  }

  return { text: result, mapping }
}

export function restorePII(text: string, mapping: Map<string, string>): string {
  let result = text
  for (const [placeholder, original] of mapping) {
    result = result.split(placeholder).join(original)
  }
  return result
}
