/**
 * Currency utilities — format USD (storage) as BRL (display) by default.
 *
 * Padrão do Lexio: storage em USD, display em BRL.
 * Taxa de câmbio de referência configurável (default R$ 5,70 por US$ 1,00).
 */

export const DEFAULT_BRL_PER_USD = 5.7
export type CurrencyCode = 'BRL' | 'USD' | 'EUR'

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 5 })
const intFormatter = new Intl.NumberFormat('pt-BR')

/** Converte USD → BRL usando a taxa de referência. */
export function usdToBrl(usd: number, rate: number = DEFAULT_BRL_PER_USD): number {
  return usd * rate
}

/** Formata um valor em USD (que está em "por 1M tokens") como BRL. */
export function formatCost(usdPerMTokens: number, currency: CurrencyCode = 'BRL', rate: number = DEFAULT_BRL_PER_USD): string {
  if (usdPerMTokens === 0) return 'Grátis'
  if (currency === 'USD') {
    if (usdPerMTokens < 0.001) return `$${usdPerMTokens.toFixed(5)}`
    if (usdPerMTokens < 1) return `$${usdPerMTokens.toFixed(4)}`
    return usdFormatter.format(usdPerMTokens)
  }
  const brl = usdToBrl(usdPerMTokens, rate)
  if (brl < 0.01) return `R$ ${brl.toFixed(4)}`
  return brlFormatter.format(brl)
}

/** Formata BRL puro. */
export function fmtBrl(value: number): string {
  return brlFormatter.format(value)
}

/** Formata USD puro. */
export function fmtUsd(value: number): string {
  if (value < 0.001) return `$${value.toFixed(5)}`
  return usdFormatter.format(value)
}

/** Formata um número inteiro grande com separador pt-BR. */
export function fmtInt(n: number): string {
  return intFormatter.format(n)
}

/**
 * Calcula o custo estimado em BRL para uma conversa de N tokens (N% input + (100-N)% output).
 * Útil para mostrar "esta conversa custou ~R$ X".
 */
export function estimateCostBrl(
  totalTokens: number,
  inputRatio: number,
  inputCostUsdPerMTokens: number,
  outputCostUsdPerMTokens: number,
  rate: number = DEFAULT_BRL_PER_USD,
): number {
  const inputTokens = totalTokens * inputRatio
  const outputTokens = totalTokens * (1 - inputRatio)
  const costUsd =
    (inputTokens / 1_000_000) * inputCostUsdPerMTokens +
    (outputTokens / 1_000_000) * outputCostUsdPerMTokens
  return usdToBrl(costUsd, rate)
}
