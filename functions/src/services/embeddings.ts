/**
 * Embeddings service — wrapper Gemini text-embedding-004.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

const MODEL = 'text-embedding-004'
const BATCH_SIZE = 100

export interface EmbeddingResult {
  text: string
  vector: number[]
  tokens: number
}

let cachedClient: GoogleGenerativeAI | null = null

function getClient(apiKey: string): GoogleGenerativeAI {
  if (!cachedClient) {
    cachedClient = new GoogleGenerativeAI(apiKey)
  }
  return cachedClient
}

/**
 * Gera embedding de um texto.
 */
export async function embed(text: string, apiKey: string): Promise<number[]> {
  const client = getClient(apiKey)
  const model = client.getGenerativeModel({ model: MODEL })
  const result = await model.embedContent(text)
  return result.embedding.values
}

/**
 * Gera embeddings em batch.
 */
export async function embedBatch(texts: string[], apiKey: string): Promise<EmbeddingResult[]> {
  if (texts.length === 0) return []
  if (texts.length <= BATCH_SIZE) {
    return embedBatchInternal(texts, apiKey)
  }

  const results: EmbeddingResult[] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const batchResults = await embedBatchInternal(batch, apiKey)
    results.push(...batchResults)
  }
  return results
}

async function embedBatchInternal(texts: string[], apiKey: string): Promise<EmbeddingResult[]> {
  const client = getClient(apiKey)
  const model = client.getGenerativeModel({ model: MODEL })

  // Gemini suporta batch embedding
  const result = await model.batchEmbedContents({
    requests: texts.map((t) => ({ content: { role: 'user', parts: [{ text: t }] } })),
  })

  return result.embeddings.map((e, i) => ({
    text: texts[i],
    vector: e.values,
    tokens: Math.ceil(texts[i].length / 4),
  }))
}

/**
 * Cache de embeddings em memória (para chunks já embedados nesta instância).
 */
const memoryCache = new Map<string, number[]>()

export function getCachedEmbedding(text: string): number[] | null {
  return memoryCache.get(text) ?? null
}

export function setCachedEmbedding(text: string, vector: number[]): void {
  memoryCache.set(text, vector)
}

export async function embedWithCache(text: string, apiKey: string): Promise<number[]> {
  const cached = getCachedEmbedding(text)
  if (cached) return cached
  const vector = await embed(text, apiKey)
  setCachedEmbedding(text, vector)
  return vector
}
