/**
 * Ingestão inline — para uploads do admin.
 * Recebe buffer + metadata, processa (parse + chunk + embed) e persiste
 * direto no Firestore sem precisar de arquivo em disco.
 */

import { getFirestore, FieldValue } from './firestore'
import { chunkText } from '../utils/chunking'
import { embedBatch } from './embeddings'

export interface InlineIngestionInput {
  docId: string
  text: string                              // já extraído (md/txt/html)
  title: string
  type: string                              // 'ato' | 'parecer' | 'legislacao' | 'manual' | 'doutrina' | etc.
  area: string[]                            // ex: ['cível', 'patrimônio público']
  tags: string[]
  source: 'admin-upload' | 'intranet' | 'web' | 'manual'
  url?: string                              // link para o doc original
  storagePath?: string
  metadata?: Record<string, unknown>
  apiKey: string                            // GEMINI_API_KEY para embeddings
}

export interface InlineIngestionResult {
  ok: boolean
  docId: string
  chunksCreated: number
  tokensProcessed: number
  error?: string
}

export async function ingestInline(input: InlineIngestionInput): Promise<InlineIngestionResult> {
  const db = getFirestore()
  const { docId, text, title, type, area, tags, source, url, storagePath, apiKey } = input

  if (!text || text.length < 10) {
    return { ok: false, docId, chunksCreated: 0, tokensProcessed: 0, error: 'Texto vazio ou muito curto' }
  }

  try {
    // 1. Chunk
    const chunks = chunkText(text, { maxTokens: 800, overlapTokens: 100 })
    if (chunks.length === 0) {
      return { ok: false, docId, chunksCreated: 0, tokensProcessed: 0, error: 'Nenhum chunk gerado' }
    }

    // 2. Embedding (em batch)
    const texts = chunks.map((c) => c.text)
    let vectors: { vector: number[] }[] = []
    if (apiKey) {
      try {
        vectors = await embedBatch(texts, apiKey)
      } catch (err) {
        // Continua sem embedding (busca textual ainda funciona)
        const msg = (err as { message?: string })?.message
        console.warn(`ingestInline: embed falhou (${msg}), chunks sem embedding`)
      }
    }

    // 3. Persistir documento pai em corpus/{docId}
    const docRef = db.doc(`corpus/${docId}`)
    await docRef.set(
      {
        id: docId,
        title,
        type,
        area,
        tags,
        source,
        url: url ?? null,
        storagePath: storagePath ?? null,
        status: 'ativo',
        version: 1,
        fullText: text,
        summary: text.slice(0, 240),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...(input.metadata || {}),
      },
      { merge: true },
    )

    // 4. Limpar chunks antigos
    const oldChunks = await docRef.collection('chunks').listDocuments()
    if (oldChunks.length > 0) {
      await Promise.all(oldChunks.map((r) => r.delete()))
    }

    // 5. Persistir chunks
    let totalTokens = 0
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const embedding = vectors[i]?.vector
      const data: Record<string, unknown> = {
        text: chunk.text,
        section: chunk.section,
        position: i,
        tokens: chunk.tokens,
        type,
        area,
        tags,
        documentId: docId,
        documentTitle: title,
        createdAt: FieldValue.serverTimestamp(),
      }
      if (embedding && embedding.length > 0) {
        data.embedding = FieldValue.vector(embedding)
      }
      await docRef.collection('chunks').doc(`chunk-${i}`).set(data)
      totalTokens += chunk.tokens
    }

    return { ok: true, docId, chunksCreated: chunks.length, tokensProcessed: totalTokens }
  } catch (err) {
    const error = err as { message?: string }
    return { ok: false, docId, chunksCreated: 0, tokensProcessed: 0, error: error?.message ?? String(err) }
  }
}
