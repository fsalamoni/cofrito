/**
 * Testes do adminUploadDocument (e2e de fluxos de erro).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockDoc = vi.fn(() => ({
  get: mockGet,
  set: mockSet,
  collection: vi.fn(() => ({
    listDocuments: vi.fn().mockResolvedValue([]),
    doc: vi.fn(() => ({ set: mockSet, delete: vi.fn() })),
  })),
}))
const mockCollection = vi.fn(() => ({
  doc: mockDoc,
}))
const mockFieldValue = {
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  vector: vi.fn((v) => ({ _vector: v })),
}

vi.mock('../services/firestore', () => ({
  getFirestore: () => ({
    doc: mockDoc,
    collection: mockCollection,
  }),
  FieldValue: mockFieldValue,
}))

const mockSave = vi.fn().mockResolvedValue(undefined)
const mockFile = vi.fn(() => ({ save: mockSave }))
const mockBucket = vi.fn(() => ({
  file: mockFile,
  name: 'cofrito.appspot.com',
}))
const mockStorage = {
  bucket: mockBucket,
}
vi.mock('../services/storage', () => ({
  getStorage: () => mockStorage,
  getBucket: () => mockStorage.bucket(),
}))

vi.mock('firebase-functions/v2/https', () => ({
  onCall: (opts: any, fn: any) => fn,
  HttpsError: class extends Error {
    constructor(public code: string, public message: string) { super(message) }
  },
}))

vi.mock('firebase-functions/v2', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../services/llm-providers', () => ({
  generateWithProvider: vi.fn(),
  stubResponse: vi.fn(),
}))

vi.mock('../services/ingestion-buffer', () => ({
  ingestInline: vi.fn().mockResolvedValue({ ok: true, chunksCreated: 5, tokensProcessed: 1000 }),
}))

vi.mock('../services/acervo-analyzer', () => ({
  analyzeAcervoDoc: vi.fn(),
  runAnalysisInBackground: vi.fn(),
}))

vi.mock('../middleware/auth', () => ({
  assertAdminMaster: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/storage-compressor', () => ({
  compressBuffer: (buf: Buffer) => ({ buffer: buf, encoded: false }),
  estimateCompressionGain: () => 0,
}))

vi.mock('../services/document-json-converter', () => ({
  textToStructuredJson: (text: string) => ({
    text,
    meta: { format: 'pdf', pages: 1, paragraphs: 1, charsOriginal: text.length, charsStored: text.length, compressionRatio: 1 },
  }),
  serializeStructuredJson: (s: any) => JSON.stringify(s),
}))

vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({ text: 'Mock PDF text', numpages: 1 }),
}))

vi.mock('mammoth', () => ({
  extractRawText: vi.fn().mockResolvedValue({ value: 'Mock docx text' }),
}))

describe('adminUploadDocument (e2e)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('faz upload de PDF com sucesso', async () => {
    const { adminUploadDocument } = await import('./admin-documents')
    const handler = (adminUploadDocument as any)
    const req = {
      auth: { uid: 'master-admin' },
      data: {
        fileName: 'teste.pdf',
        contentBase64: Buffer.from('Mock PDF text content').toString('base64'),
        mimeType: 'application/pdf',
      },
    }
    const result = await handler(req)
    expect(result.ok).toBe(true)
    expect(result.docId).toBeDefined()
  })

  it('lida com texto vazio retornando ok:false', async () => {
    // Force PDF parse a retornar texto vazio
    const pdfParse = await import('pdf-parse')
    ;(pdfParse.default as any).mockResolvedValueOnce({ text: '', numpages: 0 })

    const { adminUploadDocument } = await import('./admin-documents')
    const handler = (adminUploadDocument as any)
    const req = {
      auth: { uid: 'master-admin' },
      data: {
        fileName: 'empty.pdf',
        contentBase64: Buffer.from('conteudo').toString('base64'),
        mimeType: 'application/pdf',
      },
    }
    const result = await handler(req)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('nao pode ser extraido')
  })

  it('rejeita sem fileName', async () => {
    const { adminUploadDocument, HttpsError } = await import('./admin-documents')
    const handler = (adminUploadDocument as any)
    const req = {
      auth: { uid: 'master-admin' },
      data: { contentBase64: 'abc', mimeType: 'application/pdf' },
    }
    await expect(handler(req)).rejects.toThrow(/obrigat/)
  })

  it('rejeita sem auth', async () => {
    const { adminUploadDocument } = await import('./admin-documents')
    const handler = (adminUploadDocument as any)
    const req = { data: { fileName: 'x.pdf', contentBase64: 'abc' } }
    await expect(handler(req)).rejects.toThrow(/login/)
  })
})
