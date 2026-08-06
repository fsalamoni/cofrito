#!/usr/bin/env node
/**
 * Roda o golden set contra o chat handler.
 *
 * Uso:
 *   npm run golden-set                 → usa emulador
 *   npm run golden-set -- --prod       → usa produção (CUIDADO)
 *
 * Requer:
 *   - Emulador rodando OU Functions deployadas
 *   - LLM_API_KEY definida
 */

import * as dotenv from 'dotenv'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
dotenv.config({ path: '.env.local' })
dotenv.config()

interface GoldenQuestion {
  id: string
  category: string
  question: string
  shouldRefuse: boolean
  expectedRefusalReason?: string
  expectedCitation?: string
  expectedKeywords?: string[]
  minRelevance?: number
}

interface ChatSource {
  docId: string
  chunkId?: string
  section?: string
  title?: string
  relevance?: number
}

interface ChatAnswer {
  reply?: string
  inScope?: boolean
  intent?: string
  sources?: ChatSource[]
  guardrailTriggered?: string
  usage?: { prompt: number; completion: number; total: number }
}

interface GoldenSet {
  version: string
  description: string
  categories: Record<string, string>
  questions: GoldenQuestion[]
}

interface Result {
  questionId: string
  category: string
  question: string
  passed: boolean
  durationMs: number
  checks: {
    refusedAsExpected: boolean | null
    hasKeywords: boolean | null
    hasCitation: boolean | null
    hasReply: boolean
  }
  answer: {
    reply: string
    inScope: boolean
    intent: string
    sources: Array<{ docId: string; relevance: number }>
    guardrailTriggered?: string
  }
  tokens: { prompt: number; completion: number; total: number }
  errors?: string[]
}

const USE_PROD = process.argv.includes('--prod')
const EMULATOR_URL = process.env.EMULATOR_URL || 'http://127.0.0.1:5001/agente-caocipp-dev/us-central1'
const PROD_URL = 'https://us-central1-agente-caocipp-dev.cloudfunctions.net'

async function main() {
  const baseUrl = USE_PROD ? PROD_URL : EMULATOR_URL
  console.log(`🎯 Golden set — ${USE_PROD ? 'PRODUÇÃO' : 'EMULADOR'}`)
  console.log(`   ${baseUrl}\n`)

  const goldenSetPath = path.join(process.cwd(), 'data', 'golden-set.json')
  const content = await fs.readFile(goldenSetPath, 'utf-8')
  const goldenSet: GoldenSet = JSON.parse(content)

  const results: Result[] = []

  for (const q of goldenSet.questions) {
    process.stdout.write(`  [${q.category}] ${q.id}... `)
    const start = Date.now()
    try {
      const answer = await askQuestion(baseUrl, q.question)
      const result = evaluate(q, answer, Date.now() - start)
      results.push(result)
      console.log(result.passed ? '✅' : '❌')
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      results.push({
        questionId: q.id,
        category: q.category,
        question: q.question,
        passed: false,
        durationMs: Date.now() - start,
        checks: { refusedAsExpected: null, hasKeywords: null, hasCitation: null, hasReply: false },
        answer: { reply: '', inScope: true, intent: 'error', sources: [] },
        tokens: { prompt: 0, completion: 0, total: 0 },
        errors: [errMsg],
      })
      console.log(`❌ ${errMsg}`)
    }
  }

  // Salva resultado
  const outPath = path.join(process.cwd(), 'data', 'golden-set-results.json')
  await fs.writeFile(outPath, JSON.stringify(results, null, 2))

  // Sumário
  const passed = results.filter((r) => r.passed).length
  const failed = results.length - passed
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0)
  const totalTokens = results.reduce((sum, r) => sum + r.tokens.total, 0)
  const byCategory: Record<string, { passed: number; total: number }> = {}
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = { passed: 0, total: 0 }
    byCategory[r.category].total++
    if (r.passed) byCategory[r.category].passed++
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 Sumário Golden Set')
  console.log('='.repeat(60))
  console.log(`Total: ${results.length} | ✅ ${passed} | ❌ ${failed}`)
  console.log(`Taxa de acerto: ${((passed / results.length) * 100).toFixed(1)}%`)
  console.log(`Tempo total: ${(totalDuration / 1000).toFixed(1)}s`)
  console.log(`Tokens consumidos: ${totalTokens}`)
  console.log('\nPor categoria:')
  for (const [cat, stats] of Object.entries(byCategory)) {
    const pct = ((stats.passed / stats.total) * 100).toFixed(0)
    console.log(`  ${cat.padEnd(20)} ${stats.passed}/${stats.total} (${pct}%)`)
  }
  console.log(`\nResultado salvo em: ${outPath}`)

  process.exit(failed > 0 ? 1 : 0)
}

async function askQuestion(baseUrl: string, message: string) {
  const res = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Para emulador, auth é bypassada se Authorization: Bearer owner
      Authorization: `Bearer ${process.env.TEST_TOKEN || 'owner'}`,
    },
    body: JSON.stringify({ message, conversationId: undefined }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<ChatAnswer>
}

function evaluate(q: GoldenQuestion, answer: ChatAnswer, durationMs: number): Result {
  const errors: string[] = []

  // 1. Teve resposta?
  const hasReply = typeof answer.reply === 'string' && answer.reply.length > 0
  if (!hasReply) errors.push('sem resposta')

  // 2. Refusou como esperado?
  let refusedAsExpected: boolean | null = null
  if (q.shouldRefuse) {
    const refused = !answer.inScope || answer.guardrailTriggered !== undefined
    refusedAsExpected = refused
    if (!refused) {
      errors.push(
        `deveria ter recusado (inScope=${answer.inScope}, guardrail=${answer.guardrailTriggered})`,
      )
    } else if (q.expectedRefusalReason && answer.guardrailTriggered) {
      // Verifica se o motivo bate
      if (answer.guardrailTriggered !== q.expectedRefusalReason) {
        // Tolerância: aceita motivos relacionados
        const acceptable = {
          off_topic: ['off_topic', 'case_analysis', 'no_results', 'jailbreak'],
          case_analysis: ['case_analysis', 'no_results'],
          no_results: ['no_results', 'case_analysis'],
          jailbreak: ['jailbreak', 'off_topic'],
          out_of_scope: ['out_of_scope', 'no_results', 'off_topic'],
        }
        const accepted = acceptable[q.expectedRefusalReason as keyof typeof acceptable] || []
        if (!accepted.includes(answer.guardrailTriggered)) {
          errors.push(
            `recusou com motivo "${answer.guardrailTriggered}", esperado "${q.expectedRefusalReason}"`,
          )
        }
      }
    }
  } else {
    refusedAsExpected = answer.inScope ? true : null
    if (!answer.inScope) errors.push('deveria ter respondido, mas recusou')
  }

  // 3. Tem keywords esperados?
  let hasKeywords: boolean | null = null
  if (q.expectedKeywords && q.expectedKeywords.length > 0 && !q.shouldRefuse) {
    const lower = (answer.reply ?? '').toLowerCase()
    hasKeywords = q.expectedKeywords.some((k) => lower.includes(k.toLowerCase()))
    if (!hasKeywords) errors.push(`nenhuma das keywords apareceu: ${q.expectedKeywords.join(', ')}`)
  }

  // 4. Citou a fonte esperada?
  let hasCitation: boolean | null = null
  if (q.expectedCitation && !q.shouldRefuse) {
    hasCitation = (answer.sources || []).some((s: ChatSource) => s.docId === q.expectedCitation)
    if (!hasCitation) {
      errors.push(
        `não citou ${q.expectedCitation} (citou: ${(answer.sources || []).map((s: ChatSource) => s.docId).join(', ') || 'nenhuma'})`,
      )
    }
  }

  // 5. Tem relevância mínima?
  if (q.minRelevance && answer.sources && answer.sources.length > 0) {
    const top = answer.sources[0].relevance ?? 0
    if (top < q.minRelevance) {
      errors.push(`relevância ${top.toFixed(2)} < ${q.minRelevance}`)
    }
  }

  return {
    questionId: q.id,
    category: q.category,
    question: q.question,
    passed: errors.length === 0,
    durationMs,
    checks: { refusedAsExpected, hasKeywords, hasCitation, hasReply },
    answer: {
      reply: answer.reply ?? '',
      inScope: answer.inScope ?? false,
      intent: answer.intent ?? '',
      sources: (answer.sources || []).map((s) => ({ docId: s.docId, relevance: s.relevance ?? 0 })),
      guardrailTriggered: answer.guardrailTriggered,
    },
    tokens: answer.usage || { prompt: 0, completion: 0, total: 0 },
    errors: errors.length > 0 ? errors : undefined,
  }
}

main().catch((err) => {
  console.error('💥', err)
  process.exit(1)
})
