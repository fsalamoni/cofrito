import { describe, it, expect } from 'vitest'
import { validatePGEA } from './validators'

describe('validatePGEA', () => {
  it('aceita PGEA válido', () => {
    expect(validatePGEA('00021.000.181/2025').valid).toBe(true)
  })

  it('rejeita PGEA inválido', () => {
    expect(validatePGEA('00021000.181/2025').valid).toBe(false)
    expect(validatePGEA('abc').valid).toBe(false)
    expect(validatePGEA('00021.000.181-2025').valid).toBe(false)
  })
})
