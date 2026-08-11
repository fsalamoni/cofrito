/**
 * Ingestion Acervo V1 — versao especifica para documentos do acervo
 * que JA passaram pela Fase 2a (JSON estruturado) + Fase 2b (analise automatica).
 *
 * Propaga os metadados estruturados (classification, ementa, keyPoints) para o corpus
 * para que o researcher-internal possa usar como pre-filtro na Fase 2c.
 *
 * Schema do doc no Firestore: corpus/{docId}
 *   - tudo do schema base (title, type, area, tags, etc)
 *   - + classification, ementa, keyPoints (do analyzer)
 *   - + searchKeywords[] (consolidado de ementa.keywords + classification.assuntos + keyPoints.items + filename)
 *
 * Schema dos chunks: corpus/{docId}/chunks/{chunkId}
 *   - tudo do schema base (text, section, position, tokens, etc)
 *   - + sectionKeywords[] (subset de keywords relevantes pra esse chunk)
 */
import { FieldValue } from 'firebase-admin/firestore'
import { getFirestore } from './firestore'
import { chunkText } from '../utils/chunking'
import { embedBatch } from './embeddings'
import type { Classification, Ementa, KeyPoints } from './acervo-analyzer'

export interface AcervoIngestionInput {
  docId: string
  text: string
  title: string
  fileName: string
  type: string
  area: string[]
  tags: string[]
  classification: Classification | null
  ementa: Ementa | null
  keyPoints: KeyPoints | null
  /** API key para embeddings (opcional) */
  apiKey?: string
  /** Se true, substitui o doc existente (default true) */
  replace?: boolean
}

export interface AcervoIngestionResult {
  ok: boolean
  docId: string
  chunksCreated: number
  tokensProcessed: number
  searchKeywords: string[]
  error?: string
}

/**
 * Consolida TODAS as keywords de busca do doc em uma unica lista.
 * Usado como pre-filtro pelo researcher-internal (Fase 2c).
 */
export function buildSearchKeywords(input: {
  classification: Classification | null
  ementa: Ementa | null
  keyPoints: KeyPoints | null
  fileName: string
  area: string[]
  tags: string[]
}): string[] {
  const set = new Set<string>()

  // 1. ementa.keywords (principal)
  input.ementa?.keywords?.forEach(k => set.add(k.toLowerCase().trim()))

  // 2. classification.assuntos
  input.classification?.assuntos?.forEach(k => set.add(k.toLowerCase().trim()))

  // 3. classification.areaDireito
  input.classification?.areaDireito?.forEach(k => set.add(k.toLowerCase().trim()))

  // 4. ementa.areas (denormalizado)
  input.ementa?.areas?.forEach(k => set.add(k.toLowerCase().trim()))

  // 5. ementa.topicos
  input.ementa?.topicos?.forEach(k => set.add(k.toLowerCase().trim()))

  // 6. keyPoints.items (frases curtas - pegar so palavras-chave)
  input.keyPoints?.items?.forEach(item => {
    // extrair palavras relevantes (mais de 3 chars)
    item.split(/\s+/).forEach(w => {
      const clean = w.toLowerCase().replace(/[^a-z0-9áéíóúçãõ]/g, '')
      if (clean.length > 3) set.add(clean)
    })
  })

  // 7. area/tags manuais
  input.area?.forEach(k => set.add(k.toLowerCase().trim()))
  input.tags?.forEach(k => set.add(k.toLowerCase().trim()))

  // 8. filename (sem extensao e sem prefixo de data)
  const filenameBase = input.fileName
    .replace(/^\d{8}\s*-\s*/, '')
    .replace(/\.(docx?|pdf|txt|md)$/i, '')
    .split(/[.\s,;_\-]+/)
    .filter(w => w.length > 2)
  filenameBase.forEach(k => set.add(k.toLowerCase()))

  // Filtrar palavras muito comuns (stopwords minimas)
  const stop = new Set(['que', 'para', 'com', 'dos', 'das', 'nos', 'nas', 'pelo', 'pela', 'este', 'esta', 'sao', 'foi', 'ser', 'tem', 'ter'])
  stop.forEach(s => set.delete(s))

  return Array.from(set).filter(k => k.length >= 3).slice(0, 80)
}

/**
 * Ingere documento do acervo no corpus com metadados estruturados.
 */
export async function ingestAcervoDoc(input: AcervoIngestionInput): Promise<AcervoIngestionResult> {
  const { docId, text, title, type, area, tags, classification, ementa, keyPoints, apiKey, replace = true } = input

  if (!text || text.length < 10) {
    return { ok: false, docId, chunksCreated: 0, tokensProcessed: 0, searchKeywords: [], error: 'Texto vazio ou muito curto' }
  }

  // 1. Construir lista consolidada de keywords
  const searchKeywords = buildSearchKeywords({ classification, ementa, keyPoints, fileName: input.fileName, area, tags })

  try {
    const db = getFirestore()
    const docRef = db.doc(`corpus/${docId}`)

    // 2. Chunkear texto
    const chunks = chunkText(text, { maxTokens: 800, overlapTokens: 100 })
    if (chunks.length === 0) {
      return { ok: false, docId, chunksCreated: 0, tokensProcessed: 0, searchKeywords, error: 'Nenhum chunk gerado' }
    }

    // 3. Embeddings (opcional)
    let vectors: { vector: number[] }[] = []
    if (apiKey) {
      try {
        vectors = await embedBatch(chunks.map(c => c.text), apiKey)
      } catch (err) {
        // Continua sem embedding (busca textual ainda funciona)
        const msg = (err as { message?: string })?.message
        console.warn(`ingestAcervoDoc: embed falhou (${msg}), chunks sem embedding`)
      }
    }

    // 4. Persistir documento pai
    await docRef.set(
      {
        id: docId,
        title,
        type,
        area,
        tags,
        status: 'ativo',
        version: 1,
        fullText: text,
        summary: text.slice(0, 240),
        // Metadados estruturados da Fase 2b
        classification: classification || null,
        ementa: ementa || null,
        keyPoints: keyPoints || null,
        // Lista consolidada de keywords para pre-filtro (Fase 2c)
        searchKeywords,
        // Vindo do acervo V1 (Fase 2a)
        source: 'acervo',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    // 5. Limpar chunks antigos (se replace=true)
    if (replace) {
      const oldChunks = await docRef.collection('chunks').listDocuments()
      if (oldChunks.length > 0) {
        await Promise.all(oldChunks.map(r => r.delete()))
      }
    }

    // 6. Persistir chunks
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
        searchKeywords,  // <- todos os chunks tem a mesma lista (para pre-filtro)
        createdAt: FieldValue.serverTimestamp(),
      }
      if (embedding && embedding.length > 0) {
        data.embedding = FieldValue.vector(embedding)
      }
      await docRef.collection('chunks').doc(`chunk-${i}`).set(data)
      totalTokens += chunk.tokens
    }

    return { ok: true, docId, chunksCreated: chunks.length, tokensProcessed: totalTokens, searchKeywords }
  } catch (err) {
    const error = err as { message?: string }
    return { ok: false, docId, chunksCreated: 0, tokensProcessed: 0, searchKeywords, error: error?.message ?? String(err) }
  }
}
