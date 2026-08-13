import { describe, it, expect } from 'vitest'

describe('smoke test', () => {
  it('CI runs', () => {
    expect(1 + 1).toBe(2)
  })
})
