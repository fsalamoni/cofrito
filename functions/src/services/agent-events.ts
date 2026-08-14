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
  /** Títulos de documentos encontrados/entregues (para exibir na timeline). */
  titles?: string[]
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
        return { ...base, type: 'thinking', role: rawData.role, details: 'Compreendendo o pedido...' }
      }
      if (rawData.role === 'researcher-internal') {
        return { ...base, type: 'searching-acervo', role: rawData.role, details: 'Pesquisando no acervo interno do CAOCIPP...' }
      }
      if (rawData.role === 'researcher-web') {
        return { ...base, type: 'searching-web', role: rawData.role, details: 'Pesquisando em fontes externas (web)...' }
      }
      if (rawData.role === 'compiler') {
        return { ...base, type: 'compiling', role: rawData.role, details: 'Organizando e priorizando os documentos...' }
      }
      if (rawData.role === 'legal-writer') {
        return { ...base, type: 'answering', role: rawData.role, details: 'Elaborando a análise e a entrega...' }
      }
      return null
    case 'plan': {
      // Mostra que o agente COMPREENDEU o pedido: raciocínio + pontos + áreas.
      const plan = rawData.plan || {}
      const points: string[] = Array.isArray(plan.points) ? plan.points.map((p: any) => p.query).filter(Boolean) : []
      const areas: string[] = Array.isArray(plan.detectedAreas) ? plan.detectedAreas : []
      const reasoning = typeof plan.reasoning === 'string' ? plan.reasoning : ''
      const detailParts: string[] = []
      if (reasoning) detailParts.push(reasoning)
      if (areas.length) detailParts.push(`Áreas: ${areas.join(', ')}.`)
      return {
        ...base,
        type: 'planning',
        details: detailParts.join(' ') || 'Pontos de pesquisa definidos.',
        titles: points.slice(0, 6),
      }
    }
    case 'sources_found': {
      const titles: string[] = Array.isArray(rawData.titles) ? rawData.titles : []
      if (rawData.source === 'internal') {
        return { ...base, type: 'searching-acervo', details: `${rawData.count} documento(s) encontrado(s) no acervo`, count: rawData.count, titles }
      }
      if (rawData.source === 'web') {
        return { ...base, type: 'searching-web', details: `${rawData.count} resultado(s) na web`, count: rawData.count, titles }
      }
      if (rawData.source === 'compiled') {
        if (!rawData.count) return null
        return { ...base, type: 'compiling', details: `Entregando ${rawData.count} documento(s)`, count: rawData.count, titles }
      }
      return null
    }
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
 * Path: agentEvents/{channelId}/events/{eventId}  (documento VÁLIDO: 4 segmentos)
 *   eventId ordenado por ts.
 *
 * IMPORTANTE: o path anterior `agentEvents/{cid}/{eventId}` tinha 3 segmentos
 * (referência de coleção, não de documento) e o `.doc()` falhava — por isso a
 * timeline nunca recebia eventos. Aqui usamos a subcoleção `events`.
 */
export async function saveNarrativeEvent(event: NarrativeEvent): Promise<void> {
  const db = getFirestore()
  const eventId = `${event.ts.replace(/[:.]/g, '-')}-${event.type}-${Math.random().toString(36).slice(2, 8)}`
  await db
    .doc(`agentEvents/${event.conversationId}/events/${eventId}`)
    .set({
      ...event,
      createdAt: FieldValue.serverTimestamp(),
    })
  // Marca o canal como contendo eventos (para o front saber se deve ouvir)
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
