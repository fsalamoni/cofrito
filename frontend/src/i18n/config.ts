/**
 * Configuração de i18n.
 *
 * Mensagens são extraídas dos componentes. Para tradução para outro
 * idioma, basta criar `en-US.json` (ou similar) e adicionar no array.
 *
 * Por enquanto: pt-BR only.
 */

import ptBR from './pt-BR.json'

type LocaleMessages = typeof ptBR
type MessageKey = keyof LocaleMessages

const messages: Record<string, LocaleMessages> = {
  'pt-BR': ptBR,
}

const DEFAULT_LOCALE = 'pt-BR'

export function t(key: MessageKey, locale: string = DEFAULT_LOCALE): string {
  return messages[locale]?.[key] || messages[DEFAULT_LOCALE][key] || key
}

export function setLocale(locale: string) {
  localStorage.setItem('cofrito:locale', locale)
  // TODO: trocar conteúdo das strings nos componentes
}
