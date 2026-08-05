/**
 * Ingestion service — pipeline completo de ingestão de documentos.
 *
 * Pipeline:
 *  1. Parse (markdown, docx, pdf, html)
 *  2. Limpeza
 *  3. Chunking
 *  4. Embedding
 *  5. Persistência no Firestore
 *  6. Validação
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import matter from 'gray-matter'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { chunkText } from '../utils/chunking'
import { embedBatch } from './embeddings'

export interface IngestionResult {
  documentsProcessed: number
  chunksCreated: number
  errors: Array<{ file: string; error: string }>
  totalTimeMs: number
  estimatedCostUsd: number
}

interface FrontMatter {
  title: string
  type: string
  date?: string
  source?: string
  url?: string
  area: string[] | string
  tags: string[] | string
  version?: number
  status?: 'ativo' | 'revogado' | 'parcial'
  review?: { lastReviewAt?: string; nextReviewAt?: string; reviewer?: string }
}

const VALID_TYPES = [
  'ato',
  'tese',
  'parecer',
  'legislacao',
  'template',
  'doutrina',
  'faq',
  'manual',
  'manual-institucional',
  'jurisprudencia',
] as const

const EMBEDDING_COST_PER_1M_TOKENS = 0.025 // Gemini text-embedding-004

export async function runIngestion(opts: {
  apiKey: string
  source: 'cli' | 'admin' | 'auto'
  dataDir?: string
}): Promise<IngestionResult> {
  const start = Date.now()
  const errors: IngestionResult['errors'] = []
  let documentsProcessed = 0
  let chunksCreated = 0
  let totalTokens = 0

  const dataDir = opts.dataDir || path.join(process.cwd(), 'data', 'raw')
  const files = await listMarkdownFiles(dataDir)

  const db = getFirestore()

  for (const file of files) {
    try {
      const fileContent = await fs.readFile(file, 'utf-8')
      const { data: meta, content: body } = matter(fileContent)

      // Validação
      const validated = validateFrontMatter(meta)
      if (!validated.valid) {
        errors.push({ file, error: `Frontmatter inválido: ${validated.error}` })
        continue
      }

      const fm = validated.data!

      // 1. Divide em seções (por H2) e chunking
      const sections = splitBySection(body)
      const allChunks: Array<{ text: string; section: string; tokens: number }> = []
      for (const sec of sections) {
        const chunks = chunkText(sec.content, {
          maxTokens: 1000,
          overlapTokens: 200,
          section: sec.title,
        })
        allChunks.push(...chunks)
      }

      // 2. Upsert documento
      const docId = sanitizeDocId(path.basename(file, '.md'))
      const docRef = db.doc(`corpus/documents/${docId}`)
      await docRef.set(
        {
          id: docId,
          title: fm.title,
          type: fm.type,
          date: fm.date ? new Date(fm.date) : null,
          source: fm.source ?? null,
          url: fm.url ?? null,
          area: fm.area,
          tags: fm.tags,
          version: fm.version ?? 1,
          status: fm.status ?? 'ativo',
          fullText: body,
          summary: extractSummary(body),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          createdBy: 'ingestion',
        },
        { merge: true },
      )

      // 3. Remove chunks antigos
      const oldChunks = await docRef.collection('chunks').listDocuments()
      await Promise.all(oldChunks.map((r) => r.delete()))

      // 4. Gera embeddings e cria chunks
      const texts = allChunks.map((c) => c.text)
      const embeddings = await embedBatch(texts, opts.apiKey)

      for (let i = 0; i < allChunks.length; i++) {
        const chunk = allChunks[i]
        const vector = embeddings[i].vector
        const chunkId = `chunk-${i}`
        await docRef.collection('chunks').doc(chunkId).set({
          text: chunk.text,
          section: chunk.section,
          position: i,
          tokens: chunk.tokens,
          embedding: FieldValue.vector(vector),
          type: fm.type,
          area: fm.area,
          tags: fm.tags,
          date: fm.date ? new Date(fm.date) : null,
          status: fm.status ?? 'ativo',
          createdAt: Timestamp.now(),
        })
        totalTokens += chunk.tokens
      }

      documentsProcessed++
      chunksCreated += allChunks.length
      console.log(`✅ ${docId}: ${allChunks.length} chunks, ~${totalTokens} tokens`)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      errors.push({ file, error })
      console.error(`❌ ${file}: ${error}`)
    }
  }

  const totalTimeMs = Date.now() - start
  const estimatedCostUsd = (totalTokens / 1_000_000) * EMBEDDING_COST_PER_1M_TOKENS

  return {
    documentsProcessed,
    chunksCreated,
    errors,
    totalTimeMs,
    estimatedCostUsd,
  }
}

function validateFrontMatter(meta: unknown): {
  valid: boolean
  error?: string
  data?: FrontMatter
} {
  if (!meta || typeof meta !== 'object') {
    return { valid: false, error: 'Frontmatter ausente' }
  }
  const fm = meta as Record<string, unknown>
  if (!fm.title || typeof fm.title !== 'string') {
    return { valid: false, error: 'title ausente ou inválido' }
  }
  if (!fm.type || !VALID_TYPES.includes(fm.type as any)) {
    return { valid: false, error: `type inválido (esperado: ${VALID_TYPES.join(', ')})` }
  }
  const area = Array.isArray(fm.area) ? fm.area : fm.area ? [fm.area] : []
  const tags = Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : []

  return {
    valid: true,
    data: {
      title: fm.title,
      type: fm.type as string,
      date: fm.date as string | undefined,
      source: fm.source as string | undefined,
      url: fm.url as string | undefined,
      area: area as string[],
      tags: tags as string[],
      version: typeof fm.version === 'number' ? fm.version : undefined,
      status: fm.status as 'ativo' | 'revogado' | 'parcial' | undefined,
      review: fm.review as FrontMatter['review'],
    },
  }
}

function splitBySection(text: string): Array<{ title: string; content: string }> {
  const lines = text.split('\n')
  const sections: Array<{ title: string; content: string; lines: string[] }> = [
    { title: '', content: '', lines: [] },
  ]

  for (const line of lines) {
    if (line.startsWith('## ') || line.startsWith('# ')) {
      sections.push({
        title: line.replace(/^#+\s*/, '').trim(),
        content: '',
        lines: [],
      })
    } else {
      sections[sections.length - 1].lines.push(line)
    }
  }

  return sections
    .filter((s) => s.lines.length > 0)
    .map((s) => ({ title: s.title, content: s.lines.join('\n').trim() }))
}

function extractSummary(text: string, maxLength = 200): string {
  const clean = text.replace(/^#.*$/gm, '').replace(/\n+/g, ' ').trim()
  return clean.length > maxLength ? clean.slice(0, maxLength) + '...' : clean
}

function sanitizeDocId(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const result: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const sub = await listMarkdownFiles(fullPath)
      result.push(...sub)
    } else if (entry.name.endsWith('.md')) {
      result.push(fullPath)
    }
  }

  return result
}
