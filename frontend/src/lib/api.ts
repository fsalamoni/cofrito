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
} from '@/types'

export const api = {
  chat: (req: ChatRequest) =>
    httpsCallable<ChatRequest, ChatResponse>(functions, 'chat')(req),

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
}

export type { HttpsCallableResult }
