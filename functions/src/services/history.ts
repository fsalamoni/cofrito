/**
 * History — lê e escreve mensagens.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  sources?: Array<{ docId: string; chunkId: string; section: string; title: string; relevance: number }>
  tokens?: { prompt: number; completion: number; total: number }
  latencyMs?: number
  intent?: string
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

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
// generateId disponível para uso futuro (atualmente o Firestore gera o ID via .doc())
void generateId

export async function saveMessage(
  userId: string,
  conversationId: string | undefined,
  role: 'user' | 'assistant' | 'system',
  content: string,
  sources: ChatMessage['sources'] = [],
  tokensUsed = 0,
): Promise<{ conversationId: string; messageId: string }> {
  const db = getFirestore()
  const now = Timestamp.now()

  let convId = conversationId
  if (!convId) {
    const newConvRef = db.collection(`users/${userId}/conversations`).doc()
    convId = newConvRef.id
    await newConvRef.set({
      uid: userId,
      title: content.slice(0, 60) + (content.length > 60 ? '...' : ''),
      status: 'active',
      createdAt: now,
      lastActivityAt: now,
      messageCount: 0,
    })
  }

  const messageRef = db
    .collection(`users/${userId}/conversations/${convId}/messages`)
    .doc()
  await messageRef.set({
    role,
    content,
    sources,
    tokens: tokensUsed ? { prompt: 0, completion: 0, total: tokensUsed } : null,
    createdAt: now,
  })

  // Atualiza lastActivityAt e messageCount
  await db.doc(`users/${userId}/conversations/${convId}`).update({
    lastActivityAt: now,
    messageCount: (await db.collection(`users/${userId}/conversations/${convId}/messages`).count().get()).data().count,
  })

  return { conversationId: convId, messageId: messageRef.id }
}

export async function getRecentHistory(
  userId: string,
  conversationId: string | undefined,
  limit: number,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const db = getFirestore()
  if (!conversationId) return []
  const snap = await db
    .collection(`users/${userId}/conversations/${conversationId}/messages`)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
  return snap.docs
    .map((d) => d.data() as ChatMessage)
    .reverse()
    .map((m) => ({
      role: m.role === 'system' ? 'user' : m.role,
      content: m.content,
    }))
}

export async function getConversations(userId: string): Promise<Conversation[]> {
  const db = getFirestore()
  const snap = await db
    .collection(`users/${userId}/conversations`)
    .orderBy('lastActivityAt', 'desc')
    .limit(50)
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conversation))
}
