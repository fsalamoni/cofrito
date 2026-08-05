/**
 * Types compartilhados entre frontend e Cloud Functions.
 * Mantenha em sincronia com functions/src/types/.
 */

export interface UserProfile {
  uid: string
  displayName: string
  email: string
  institutionalEmail: boolean
  role: 'promotor' | 'servidor' | 'estagiario' | 'coordenador' | 'admin' | 'externo'
  unidade?: string
  areasAtuacao: string[]
  areasInferidas: string[]
  preferences: {
    tone: 'formal' | 'conversational'
    detail: 'low' | 'medium' | 'high'
    language: 'pt-BR'
  }
  status: 'active' | 'suspended' | 'deleted'
  createdAt: string
  lastSeen: string
  consent: {
    acceptedAt: string
    version: string
    ipHash: string
    userAgent: string
  }
}

export interface SourceRef {
  docId: string
  chunkId: string
  section: string
  title: string
  relevance: number
  url?: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  sources?: SourceRef[]
  feedback?: { helpful: boolean; comment?: string; at: string }
  tokens?: { prompt: number; completion: number; total: number }
  latencyMs?: number
  intent?: string
  guardrailTriggered?: string
  createdAt: string
}

export interface Conversation {
  id: string
  uid: string
  title: string
  status: 'active' | 'archived'
  createdAt: string
  lastActivityAt: string
  messageCount: number
}

export interface ChatRequest {
  conversationId?: string
  message: string
  context?: {
    documentId?: string
    intent?: string
  }
}

export interface ChatAction {
  type: 'open_consulta' | 'view_document' | 'restart' | 'view_history'
  label: string
  payload?: Record<string, unknown>
}

export interface ChatResponse {
  conversationId: string
  messageId: string
  reply: string
  sources: SourceRef[]
  intent: string
  inScope: boolean
  feedbackToken: string
  suggestions: string[]
  actions: ChatAction[]
  usage: { prompt: number; completion: number; total: number }
  latencyMs: number
}

export interface ConsultaRequest {
  assunto: string
  questaoObjetiva: string
  contextoFatico?: string
  pgea?: string
  documentosIds: string[]
}

export interface ConsultaResponse {
  protocol: string
  status: 'recebida'
  createdAt: string
  estimatedResponseDays: string
}

export interface Document {
  id: string
  title: string
  type:
    | 'ato'
    | 'tese'
    | 'parecer'
    | 'legislacao'
    | 'template'
    | 'doutrina'
    | 'faq'
    | 'manual'
    | 'manual-institucional'
  date?: string
  source?: string
  url?: string
  area: string[]
  tags: string[]
  version: number
  status: 'ativo' | 'revogado' | 'parcial'
  replacedBy?: string
  fullText: string
  summary: string
  createdAt: string
  updatedAt: string
  createdBy: string
}

export type ChatRole = 'user' | 'assistant' | 'system'
