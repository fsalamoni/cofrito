/**
 * Testes do llm-providers (withTimeout anti-hang).
 */

vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { withTimeout } from './llm-providers'

describe('withTimeout (anti-hang)', () => {
  it('resolve normalmente se a promise resolve dentro do timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000, 'test')
    expect(result).toBe('ok')
  })

  it('rejeita se a promise demora mais que o timeout', async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve('late'), 500))
    await expect(withTimeout(slow, 50, 'slow op')).rejects.toThrow(/timeout/)
  })

  it('nao vaza o timer (cleanup)', async () => {
    const start = Date.now()
    let error: unknown = null
    try {
      await withTimeout(new Promise((r) => setTimeout(() => r('x'), 1000)), 50, 't')
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(Error)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(200)
  })
})
