/**
 * Testes do config-store.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock do firestore
const mockSet = vi.fn()
const mockGet = vi.fn()
const mockDoc = vi.fn(() => ({ get: mockGet, set: mockSet }))

vi.mock('./firestore', () => ({
  getFirestore: () => ({
    doc: mockDoc,
  }),
}))

vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

import { saveConfigDoc, loadConfigDoc } from './config-store'

describe('config-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saveConfigDoc salva com envelope { data, version, updatedAt, updatedBy }', async () => {
    const data = { foo: 'bar', baz: 42 }
    await saveConfigDoc(data, {
      uid: 'admin-uid',
      path: 'admin-config/test',
      tag: 'test',
    })
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { foo: 'bar', baz: 42 },
        version: 1,
        updatedBy: 'admin-uid',
        updatedAt: expect.any(String),
      }),
      { merge: false },
    )
  })

  it('loadConfigDoc retorna null se doc não existe', async () => {
    mockGet.mockResolvedValue({ exists: false })
    const result = await loadConfigDoc<any>('admin-config/test', 'test')
    expect(result).toBeNull()
  })

  it('loadConfigDoc retorna data de doc novo (envelope)', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        data: { foo: 'bar' },
        version: 1,
        updatedAt: '2026-01-01T00:00:00Z',
        updatedBy: 'admin-uid',
      }),
    })
    const result = await loadConfigDoc<any>('admin-config/test', 'test')
    expect(result).toEqual({
      data: { foo: 'bar' },
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      updatedBy: 'admin-uid',
    })
  })

  it('loadConfigDoc detecta doc legacy e retorna como data cru', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        foo: 'bar',
        updatedAt: '2025-01-01',
        updatedBy: 'legacy',
      }),
    })
    const result = await loadConfigDoc<any>('admin-config/test', 'test')
    expect(result).not.toBeNull()
    expect(result?.data).toEqual({ foo: 'bar', updatedAt: '2025-01-01', updatedBy: 'legacy' })
    expect(result?.version).toBe(0)
  })
})
