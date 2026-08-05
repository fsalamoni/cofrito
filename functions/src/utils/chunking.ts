/**
 * Chunker — divide texto em pedaços de tamanho controlado.
 */

export interface Chunk {
  text: string
  section: string
  tokens: number
}

export interface ChunkOptions {
  maxTokens?: number
  overlapTokens?: number
  section?: string
}

const AVG_CHARS_PER_TOKEN = 4

export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const maxChars = (options.maxTokens ?? 1000) * AVG_CHARS_PER_TOKEN
  const overlapChars = (options.overlapTokens ?? 200) * AVG_CHARS_PER_TOKEN
  const section = options.section ?? ''

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0)
  const chunks: Chunk[] = []
  let current = ''

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars) {
      if (current.length > 0) {
        chunks.push(makeChunk(current, section))
        const tail = current.slice(-overlapChars)
        current = tail + '\n\n' + para
      } else {
        const sentences = para.split(/(?<=[.!?])\s+/)
        for (const s of sentences) {
          if (current.length + s.length + 1 > maxChars) {
            if (current.length > 0) {
              chunks.push(makeChunk(current, section))
              const tail = current.slice(-overlapChars)
              current = tail + ' ' + s
            } else {
              chunks.push(makeChunk(s, section))
            }
          } else {
            current += (current.length > 0 ? ' ' : '') + s
          }
        }
      }
    } else {
      current += (current.length > 0 ? '\n\n' : '') + para
    }
  }

  if (current.length > 0) {
    chunks.push(makeChunk(current, section))
  }

  return chunks
}

function makeChunk(text: string, section: string): Chunk {
  return {
    text: text.trim(),
    section,
    tokens: Math.ceil(text.length / AVG_CHARS_PER_TOKEN),
  }
}
