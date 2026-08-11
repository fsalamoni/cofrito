/* eslint-disable no-case-declarations, @typescript-eslint/no-explicit-any */
/**
 * Agent Events — persistência de eventos do pipeline em tempo real.
 *
 * Cada mensagem do chat gera uma serie de eventos (thinking, planning, searching-acervo,
 * searching-web, answering). Esses eventos sao salvos em agentEvents/{conversationId}/{eventId}
 * para que o frontend possa ouvir via Firestore onSnapshot.
 *
 * Schema do evento:
 *  - conversationId: string
 *  - messageId: string
 *  - ts: ISO timestamp
 *  - type: 'thinking' | 'planning' | 'searching-acervo' | 'searching-web' | 'answering' | 'error'
 *  - role: AgentRole original (para referencia)
 *  - details?: string (descricao opcional)
 *  - durationMs?: number
 *  - status?: 'success' | 'error' | 'skipped'
 *  - count?: number (para sources_found)
 */
import { FieldValue } from 'firebase-admin/firestore'
import { getFirestore } from './firestore'

export type NarrativeEventType =
  | 'thinking'
  | 'planning'
  | 'searching-acervo'
  | 'searching-web'
  | 'compiling'
  | 'answering'
  | 'complete'
  | 'error'

export interface NarrativeEvent {
  conversationId: string
  messageId: string
  ts: string
  type: NarrativeEventType
  role?: string
  details?: string
  durationMs?: number
  status?: 'success' | 'error' | 'skipped'
  count?: number
}

/**
 * Mapeia um TrailEvent do pipeline para um NarrativeEvent (mais legivel ao user).
 */
export function mapToNarrative(
  rawType: string,
  rawData: any,
  conversationId: string,
  messageId: string,
): NarrativeEvent | null {
  const base = { conversationId, messageId, ts: (rawData.ts as string) || new Date().toISOString() }
  switch (rawType) {
    case 'agent_start':
      if (rawData.role === 'orchestrator') {
        return { ...base, type: 'thinking', role: rawData.role, details: 'Analisando pergunta...' }
      }
      if (rawData.role === 'researcher-internal') {
        return { ...base, type: 'searching-acervo', role: rawData.role, details: 'Buscando no acervo interno...' }
      }
      if (rawData.role === 'researcher-web') {
        return { ...base, type: 'searching-web', role: rawData.role, details: 'Buscando na web externa...' }
      }
      if (rawData.role === 'compiler') {
        return { ...base, type: 'compiling', role: rawData.role, details: 'Compilando fontes encontradas...' }
      }
      if (rawData.role === 'legal-writer') {
        return { ...base, type: 'answering', role: rawData.role, details: 'Elaborando resposta juridica...' }
      }
      return null
    case 'plan':
      return { ...base, type: 'planning', details: 'Plano de pesquisa definido' }
    case 'sources_found':
      // Adicionar detalhe de quantas fontes
      if (rawData.source === 'internal') {
        return { ...base, type: 'searching-acervo', details: `${rawData.count} fonte(s) encontrada(s) no acervo`, count: rawData.count }
      }
      if (rawData.source === 'web') {
        return { ...base, type: 'searching-web', details: `${rawData.count} fonte(s) encontrada(s) na web`, count: rawData.count }
      }
      return null
    case 'agent_end':
      if (rawData.role === 'orchestrator') {
        return null  // ja temos o "thinking" inicial
      }
      // Marca conclusao da fase
      const endMap: Record<string, NarrativeEventType> = {
        'researcher-internal': 'searching-acervo',
        'researcher-web': 'searching-web',
        'compiler': 'compiling',
        'legal-writer': 'answering',
      }
      const narrType = endMap[rawData.role || '']
      if (!narrType) return null
      return { ...base, type: narrType, role: rawData.role, durationMs: rawData.durationMs, status: rawData.status }
    case 'final_answer':
      return { ...base, type: 'complete', details: 'Resposta pronta' }
    case 'error':
      return { ...base, type: 'error', details: rawData.message }
    default:
      return null
  }
}

/**
 * Persiste um evento narrativo no Firestore.
 * Path: agentEvents/{conversationId}/{eventId}
 *   eventId = `{ts}-{type}` (ordenado por ts)
 */
export async function saveNarrativeEvent(event: NarrativeEvent): Promise<void> {
  const db = getFirestore()
  const eventId = `${event.ts.replace(/[:.]/g, '-')}-${event.type}-${Math.random().toString(36).slice(2, 8)}`
  await db
    .doc(`agentEvents/${event.conversationId}/${eventId}`)
    .set({
      ...event,
      createdAt: FieldValue.serverTimestamp(),
    })
  // Marca o messageId como contendo eventos (para o front saber se deve ouvir)
  await db
    .doc(`agentEvents/${event.conversationId}`)
    .set(
      { lastEventAt: FieldValue.serverTimestamp(), lastMessageId: event.messageId },
      { merge: true },
    )
}

/**
 * Wrapper para usar como callback onTrail do pipeline.
 */
export function createOnTrailHandler(conversationId: string, messageId: string) {
  return (rawEvent: any) => {
    const narr = mapToNarrative(rawEvent.type, rawEvent, conversationId, messageId)
    if (narr) {
      void saveNarrativeEvent(narr)
    }
  }
}
