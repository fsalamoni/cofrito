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
}

export type { HttpsCallableResult }

