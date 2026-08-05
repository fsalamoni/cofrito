/**
 * Utilitários gerais.
 */

export function classNames(...args: Array<string | undefined | null | false>): string {
  return args.filter(Boolean).join(' ')
}

export function formatDate(date: Date | string, locale = 'pt-BR'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatTime(date: Date | string, locale = 'pt-BR'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(date: Date | string, locale = 'pt-BR'): string {
  return `${formatDate(date, locale)} ${formatTime(date, locale)}`
}

export function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  return crypto.subtle.digest('SHA-256', encoder.encode(text)).then((buf) => {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  })
}

export function truncate(text: string, max = 100): string {
  if (text.length <= max) return text
  return text.slice(0, max - 3) + '...'
}

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}
