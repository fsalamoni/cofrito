import { describe, it, expect } from 'vitest'
import { isMaskedKey } from './global-llm'

describe('global-llm.isMaskedKey', () => {
  it('trata vazio/undefined/mascarado como "manter a chave salva"', () => {
    expect(isMaskedKey('')).toBe(true)
    expect(isMaskedKey(undefined)).toBe(true)
    expect(isMaskedKey('••••••')).toBe(true)
    expect(isMaskedKey('sk-1234••••••abcd')).toBe(true)
  })

  it('trata chave real como nova (não mascarada)', () => {
    expect(isMaskedKey('sk-realkey123')).toBe(false)
    expect(isMaskedKey('tvly-abc')).toBe(false)
  })
})
