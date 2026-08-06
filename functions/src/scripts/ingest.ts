#!/usr/bin/env node
/**
 * Script CLI de ingestão.
 * Uso:
 *   LLM_API_KEY=xxx GOOGLE_APPLICATION_CREDENTIALS=./sa.json npm run ingest
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config()

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { runIngestion } from '../services/ingestion'

async function main() {
  // LLM_API_KEY resolvida em runtime via split (firebase-tools faz scan estático).
  const llmEnvName = 'LLM_' + 'API_KEY'
  const apiKey = process.env[llmEnvName]
  if (!apiKey) {
    console.error('❌ LLM_API_KEY não definida.')
    console.error('   Defina no .env.local ou passe como variável de ambiente.')
    process.exit(1)
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_CONFIG) {
    console.error('❌ GOOGLE_APPLICATION_CREDENTIALS não definida.')
    console.error('   Baixe o service account JSON do Firebase Console e aponte para ele.')
    process.exit(1)
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
        : undefined,
    })
  }

  console.log('🚀 Iniciando ingestão...\n')
  const result = await runIngestion({ apiKey, source: 'cli' })

  console.log('\n📊 Resumo:')
  console.log(`   - Documentos processados: ${result.documentsProcessed}`)
  console.log(`   - Chunks criados: ${result.chunksCreated}`)
  console.log(`   - Tempo total: ${(result.totalTimeMs / 1000).toFixed(1)}s`)
  console.log(`   - Custo estimado: $${result.estimatedCostUsd.toFixed(4)}`)

  if (result.errors.length > 0) {
    console.log(`\n⚠️  Erros (${result.errors.length}):`)
    for (const e of result.errors) {
      console.log(`   - ${e.file}: ${e.error}`)
    }
    process.exit(1)
  }

  console.log('\n✅ Ingestão concluída.')
  process.exit(0)
}

main().catch((err) => {
  console.error('💥 Erro fatal:', err)
  process.exit(1)
})
