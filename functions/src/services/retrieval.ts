/**
 * Serviço de retrieval.
 * Embedding da query + busca vetorial no Firestore.
 * Integração de embedding desativada neste deploy (decisão 2026-08).
 */

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
  _query: string,
  options: RetrievalOptions = {},
): Promise<RetrievedChunk[]> {
  const { topK = 8, minSimilarity = 0.55, filterType, filterArea } = options

  // Integração de embedding desativada neste deploy (decisão 2026-08).
  // Sem API de embedding → retorna vazio (guardrails vão recusar com mensagem amigável).
  const apiKey = ''
  if (!apiKey) {
    return []
  }

  // Bloco abaixo desativado — reativar junto com llm.ts quando o serviço voltar.
  // (Comandos comentados mantidos como referência para reativação futura.)
  // 1. instanciar o client da LLM
  // 2. embedContent(query) -> number[]
  // 3. passar para o findNearest
  const queryVector: number[] = []

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
    const data = doc.data() as {
      text?: string
      section?: string
      metadata?: Record<string, unknown>
      distance?: number
    }
    const distance = data.distance ?? 1
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
