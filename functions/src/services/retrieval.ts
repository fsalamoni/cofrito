/**
 * Serviço de retrieval.
 * Embedding da query + busca vetorial no Firestore.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { getFirestore } from 'firebase-admin/firestore'

export interface RetrievedChunk {
  id: string
  docId: string
  text: string
  section: string
  metadata: Record<string, unknown>
  similarity: number
}

export interface RetrievalOptions {
  topK?: number
  minSimilarity?: number
  filterType?: string
  filterArea?: string
}

export async function retrieveRelevantChunks(
  query: string,
  options: RetrievalOptions = {},
): Promise<RetrievedChunk[]> {
  const { topK = 8, minSimilarity = 0.55, filterType, filterArea } = options

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    // Sem API de embedding → retorna vazio (guardrails vão recusar com mensagem amigável)
    return []
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const embedModel = genAI.getGenerativeModel({ model: 'text-embedding-004' })
  const embedResult = await embedModel.embedContent(query)
  const queryVector = embedResult.embedding.values

  const db = getFirestore()

  let query_ref: FirebaseFirestore.Query = db.collectionGroup('chunks')
  if (filterType) {
    query_ref = query_ref.where('type', '==', filterType)
  }
  if (filterArea) {
    query_ref = query_ref.where('area', 'array-contains', filterArea)
  }

  const results = await query_ref
    .where('status', '==', 'ativo')
    .findNearest({
      vectorField: 'embedding',
      queryVector,
      limit: topK,
      distanceMeasure: 'COSINE',
    })
    .get()

  const chunks: RetrievedChunk[] = []
  results.forEach((doc) => {
    const data = doc.data()
    const distance = (doc as any).get('distance') ?? 1
    const similarity = 1 - distance / 2
    if (similarity < minSimilarity) return
    chunks.push({
      id: doc.id,
      docId: doc.ref.parent.parent?.id ?? '',
      text: data.text ?? '',
      section: data.section ?? '',
      metadata: data.metadata ?? {},
      similarity,
    })
  })

  return chunks
}
