/**
 * Embeddings service — stub.
 *
 * Integração de embeddings desativada neste deploy (decisão 2026-08).
 * Reativar: descomentar o bloco abaixo e configurar a API key.
 */

export interface EmbeddingResult {
  text: string
  vector: number[]
  tokens: number
}

const memoryCache = new Map<string, number[]>()

export function getCachedEmbedding(text: string): number[] | null {
  return memoryCache.get(text) ?? null
}

export function setCachedEmbedding(text: string, vector: number[]): void {
  memoryCache.set(text, vector)
}

export async function embed(_text: string, _apiKey: string): Promise<number[]> {
  throw new Error('Embeddings desativado neste deploy. Reative o serviço de embeddings.')
}

export async function embedBatch(_texts: string[], _apiKey: string): Promise<EmbeddingResult[]> {
  throw new Error('Embeddings desativado neste deploy. Reative o serviço de embeddings.')
}

export async function embedWithCache(text: string, apiKey: string): Promise<number[]> {
  const cached = getCachedEmbedding(text)
  if (cached) return cached
  const vector = await embed(text, apiKey)
  setCachedEmbedding(text, vector)
  return vector
}
