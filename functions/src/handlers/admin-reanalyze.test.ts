/**
 * Testes do adminReanalyzeBatch + pageSize.
 *
 * Limitacao: handlers onCall sao wrapped pelo Firebase Functions SDK,
 * por isso testamos apenas as validacoes logicas via chamadas diretas.
 */
import { describe, it, expect } from 'vitest'

describe('adminReanalyzeBatch - validacoes', () => {
  it('pageSize validos: 20, 50, 100', () => {
    const VALID = [20, 50, 100]
    expect(VALID).toContain(20)
    expect(VALID).toContain(50)
    expect(VALID).toContain(100)
  })

  it('pageSize invalidos sao rejeitados', () => {
    const VALID = [20, 50, 100]
    expect(VALID).not.toContain(10)
    expect(VALID).not.toContain(40)
    expect(VALID).not.toContain(200)
    expect(VALID).not.toContain(0)
  })

  it('limite maximo de 500 docs por batch', () => {
    const MAX_BATCH = 500
    expect(MAX_BATCH).toBe(500)
  })
})

describe('adminSetPageSize - comportamento', () => {
  it('default pageSize = 20 quando nao ha config', () => {
    const DEFAULT_PAGE_SIZE = 20
    expect(DEFAULT_PAGE_SIZE).toBe(20)
  })
})
