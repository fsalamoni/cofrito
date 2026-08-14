/**
 * Wrapper tipado para as Cloud Functions.
 * Cada função é chamada via httpsCallable com tipos seguros.
 */
import { httpsCallable, type HttpsCallableResult } from 'firebase/functions'
import { functions } from './firebase'
import type {
  ChatRequest,
  ChatResponse,
  ConsultaRequest,
  ConsultaResponse,
  UserProfile,
  Conversation,
  LLMConfig,
} from '@/types'

export const api = {
  chat: (req: ChatRequest) =>
    httpsCallable<ChatRequest, ChatResponse>(functions, 'chatV2')(req),

  openConsultaFormal: (req: ConsultaRequest) =>
    httpsCallable<ConsultaRequest, ConsultaResponse>(functions, 'openConsultaFormal')(req),

  getProfile: () => httpsCallable<void, UserProfile>(functions, 'getProfile')(),

  updateProfile: (data: Partial<UserProfile>) =>
    httpsCallable<Partial<UserProfile>, UserProfile>(functions, 'updateProfile')(data),

  getHistory: () => httpsCallable<void, Conversation[]>(functions, 'getHistory')(),

  submitFeedback: (data: { messageId: string; helpful: boolean; comment?: string }) =>
    httpsCallable<{ messageId: string; helpful: boolean; comment?: string }, void>(
      functions,
      'submitFeedback',
    )(data),

  deleteAccount: () => httpsCallable<void, void>(functions, 'deleteAccount')(),

  // LLM config
  getLLMConfig: () => httpsCallable<void, any>(functions, 'getLLMConfig')(),
  setLLMConfig: (config: LLMConfig) =>
    httpsCallable<LLMConfig, any>(functions, 'setLLMConfig')(config),
  deleteLLMConfig: () => httpsCallable<void, void>(functions, 'deleteLLMConfig')(),

  // Bootstrap: primeiro user vira master admin
  bootstrapAdminMaster: () => httpsCallable<void, { ok: boolean; message: string }>(functions, 'bootstrapAdminMaster')(),

  // Admin: upload e gestão de documentos
  adminUploadDocument: (data: { fileName: string; contentBase64: string; mimeType: string; title?: string; type?: string; area?: string[]; tags?: string[] }) =>
    httpsCallable<any, { ok: boolean; docId: string; path: string; message: string }>(functions, 'adminUploadDocument')(data),
  adminListDocuments: () => httpsCallable<void, any[]>(functions, 'adminListDocuments')(),
  adminDeleteDocument: (docId: string) =>
    httpsCallable<string, { ok: boolean; removedChunks: number }>(functions, 'adminDeleteDocument')(docId),
  adminGetDocument: (docId: string) =>
    httpsCallable<{ docId: string }, any>(functions, 'adminGetDocument')({ docId }),
  adminGetDocumentTextContent: (docId: string) =>
    httpsCallable<{ docId: string }, { id: string; textContent: string; textOriginal: string }>(
      functions,
      'adminGetDocumentTextContent',
    )({ docId }),
  adminGetDocumentDownloadUrl: (docId: string) =>
    httpsCallable<{ docId: string }, { url: string; expiresIn: number }>(
      functions,
      'adminGetDocumentDownloadUrl',
    )({ docId }),
  adminMigrateToV2: () =>
    httpsCallable<void, {
      ok: boolean
      totalChecked: number
      migratedCount: number
      skippedCount: number
      errorCount: number
      migratedIds: string[]
      skippedIds: string[]
      errors: Array<{ docId: string; err: string }>
    }>(functions, 'adminMigrateToV2')(),
  // Admin: pipeline de analise do acervo
  getAcervoPipelineConfig: () => httpsCallable<void, any>(functions, 'getAcervoPipelineConfig')(),
  saveAcervoPipelineConfig: (config: any) => httpsCallable<any, { ok: boolean; config: any }>(functions, 'saveAcervoPipelineConfig')(config),
  adminReanalyzeDocument: (docId: string) =>
    httpsCallable<string, { ok: boolean; message: string }>(functions, 'adminReanalyzeDocument')(docId),
  adminReanalyzeBatch: (payload: { docIds?: string[]; selectAll?: boolean }) =>
    httpsCallable<typeof payload, { ok: boolean; queued: number; failed: number; queuedIds: string[]; failures: { docId: string; reason: string }[]; message: string }>(functions, 'adminReanalyzeBatch')(payload),
  adminSetPageSize: (pageSize: number) =>
    httpsCallable<{ pageSize: number }, { ok: boolean; pageSize: number }>(functions, 'adminSetPageSize')({ pageSize }),
  adminGetPageSize: () =>
    httpsCallable<void, { pageSize: number }>(functions, 'adminGetPageSize')(),
  adminDebugAcervo: () =>
    httpsCallable<void, any>(functions, 'adminDebugAcervo')(),
  adminFixAcervoStatus: () =>
    httpsCallable<void, {
      ok: boolean
      totalChecked: number
      fixedCount: number
      skippedCount: number
      errorCount: number
      fixedIds: string[]
      skippedIds: string[]
      errors: Array<{ docId: string; err: string }>
    }>(functions, 'adminFixAcervoStatus')(),
  adminRebuildTextContent: () =>
    httpsCallable<void, {
      ok: boolean
      totalChecked: number
      rebuiltCount: number
      skippedCount: number
      errorCount: number
      rebuiltIds: string[]
      skippedIds: string[]
      errors: Array<{ docId: string; err: string }>
    }>(functions, 'adminRebuildTextContent')(),
  adminStartQueue: (payload: { docIds?: string[]; selectAll?: boolean }) =>
    httpsCallable<typeof payload, { ok: boolean; queued: number; totalInQueue: number; message: string }>(functions, 'adminStartQueue')(payload),
  adminGetQueueStatus: () =>
    httpsCallable<void, {
      queue: {
        docIds: string[]
        currentDocId: string | null
        currentStep: string | null
        status: 'idle' | 'running' | 'paused' | 'completed' | 'error'
        totalDocs: number
        doneCount: number
        errorCount: number
      } | null
      docs: Array<{
        id: string
        fileName?: string
        processingState: { step: string; stepLabel: string; error?: string; failedStep?: string }
        hasTextContent: boolean
        hasClassification: boolean
        hasKeyPoints: boolean
        hasEmenta: boolean
      }>
    }>(functions, 'adminGetQueueStatus')(),
  adminClearQueue: () =>
    httpsCallable<void, { ok: boolean; message: string }>(functions, 'adminClearQueue')(),
  adminForceQueueTick: () =>
    httpsCallable<void, { ok: boolean; processed: boolean; currentDocId: string | null; currentStep: string | null; queueStatus: string }>(functions, 'adminForceQueueTick')(),

  // Admin: source paths
  adminGetSourcePaths: () =>
    httpsCallable<void, { paths: any[] }>(functions, 'adminGetSourcePaths')(),
  adminSetSourcePaths: (paths: any[]) =>
    httpsCallable<{ paths: any[] }, { ok: boolean; count: number }>(functions, 'adminSetSourcePaths')({ paths }),
  adminSyncSourcePath: (pathId: string) =>
    httpsCallable<string, { ok: boolean; pathId: string; message: string }>(functions, 'adminSyncSourcePath')(pathId),

  // Admin master: global LLM config
  adminGetGlobalLLM: () =>
    httpsCallable<void, any>(functions, 'adminGetGlobalLLM')(),
  adminSetGlobalLLM: (config: LLMConfig | null) =>
    httpsCallable<LLMConfig | null, void>(functions, 'adminSetGlobalLLM')(config),
  adminListUserLLM: () =>
    httpsCallable<void, Array<{ uid: string; displayName: string; email: string; config: LLMConfig }>>(
      functions,
      'adminListUserLLM',
    )(),
  adminListAdmins: () =>
    httpsCallable<void, Array<{ uid: string; displayName: string; email: string; role: string }>>(
      functions,
      'adminListAdmins',
    )(),
  adminGrantAdmin: (data: { email: string; role: 'admin' | 'master' }) =>
    httpsCallable<{ email: string; role: 'admin' | 'master' }, void>(functions, 'adminGrantAdmin')(data),
  adminRevokeAdmin: (uid: string) =>
    httpsCallable<string, void>(functions, 'adminRevokeAdmin')(uid),
  listLLMModels: (provider: string, apiKey: string, baseUrl?: string) =>
    httpsCallable<{ provider: string; apiKey: string; baseUrl?: string }, Array<{ id: string; name?: string; contextWindow?: number }>>(
      functions, 'listLLMModels',
    )({ provider, apiKey, baseUrl }),

  // Admin: configurações globais de pesquisa
  getResearchConfig: () => httpsCallable<void, any>(functions, 'getResearchConfig')(),
  saveResearchConfig: (config: any) =>
    httpsCallable<any, { ok: boolean; savedAt: string }>(functions, 'saveResearchConfig')(config),

  getWebSearchConfig: () => httpsCallable<void, any>(functions, 'getWebSearchConfig')(),
  saveWebSearchConfig: (config: any) =>
    httpsCallable<any, { ok: boolean; savedAt: string }>(functions, 'saveWebSearchConfig')(config),
  testWebSearch: (data?: { query?: string }) =>
    httpsCallable<{ query?: string }, any>(functions, 'testWebSearch')(data || {}),

  // Deep search
  getDeepSearchConfig: () => httpsCallable<void, any>(functions, 'getDeepSearchConfig')(),
  saveDeepSearchConfig: (config: any) =>
    httpsCallable<any, { ok: boolean; savedAt: string }>(functions, 'saveDeepSearchConfig')(config),
  testDeepSearch: () => httpsCallable<void, any>(functions, 'testDeepSearch')(),

  getIntranetConfig: () => httpsCallable<void, any>(functions, 'getIntranetConfig')(),
  saveIntranetConfig: (config: any) =>
    httpsCallable<any, { ok: boolean; savedAt: string }>(functions, 'saveIntranetConfig')(config),
  testIntranet: () => httpsCallable<void, any>(functions, 'testIntranet')(),
}

export type { HttpsCallableResult }

