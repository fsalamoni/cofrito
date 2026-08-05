#!/usr/bin/env node
/**
 * Popula o Firestore com dados de teste (apenas em dev/staging).
 *
 * Uso:
 *   FIREBASE_PROJECT_ID=agente-caocipp-staging \
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json \
 *   npm run seed:test
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

const projectId = process.env.FIREBASE_PROJECT_ID || 'agente-caocipp-dev'

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('❌ GOOGLE_APPLICATION_CREDENTIALS não definida')
  process.exit(1)
}

initializeApp({
  credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS!),
  projectId,
})

const db = getFirestore()

async function main() {
  console.log(`📦 Semeando dados de teste em ${projectId}...`)

  // 1. Criar 3 usuários de teste
  const testUsers = [
    { uid: 'test-promotor-1', email: 'promotor1@example.com', displayName: 'Dr. Teste Promotor' },
    { uid: 'test-servidor-1', email: 'servidor1@example.com', displayName: 'Servidor Teste' },
    { uid: 'test-estagiario-1', email: 'estagiario1@example.com', displayName: 'Estagiário Teste' },
  ]

  for (const u of testUsers) {
    await db.doc(`users/${u.uid}`).set({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      institutionalEmail: true,
      role: 'promotor',
      createdAt: new Date(),
      lastSeen: new Date(),
      consent: {
        acceptedAt: new Date(),
        version: '1.0',
        ipHash: 'test',
        userAgent: 'test-script',
      },
      status: 'active',
    }, { merge: true })

    await db.doc(`users/${u.uid}/profile/main`).set({
      areasAtuacao: ['administrativo'],
      areasInferidas: ['administrativo', 'patrimônio'],
      preferences: { tone: 'formal', detail: 'medium', language: 'pt-BR' },
      updatedAt: new Date(),
    }, { merge: true })
  }

  // 2. Criar 2 consultas formais de teste
  const testConsultas = [
    {
      protocol: `CAO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-00001`,
      userId: 'test-promotor-1',
      userEmail: 'promotor1@example.com',
      assunto: 'Acumulação de cargos de professor',
      questaoObjetiva:
        'É possível a acumulação de dois cargos de professor com um cargo técnico, nos termos do art. 37, XVI, da CF?',
      contextoFatico: 'Servidor ocupa dois cargos de professor (20h cada) e um cargo técnico (40h).',
      pgea: '00021.000.181/2025',
      status: 'recebida',
    },
    {
      protocol: `CAO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-00002`,
      userId: 'test-servidor-1',
      userEmail: 'servidor1@example.com',
      assunto: 'Nepotismo — nomeação de cônjuge',
      questaoObjetiva:
        'A nomeação de cônjuge de secretário municipal para cargo em comissão viola a Súmula Vinculante 13 do STF?',
      contextoFatico: '',
      pgea: '',
      status: 'em-analise',
    },
  ]

  for (const c of testConsultas) {
    await db.collection('consultas-formais').doc(c.protocol).set({
      ...c,
      createdAt: new Date(),
      updatedAt: new Date(),
      historico: [{ status: c.status, at: new Date(), by: 'sistema' }],
    })
  }

  console.log('✅ Dados de teste criados:')
  console.log(`   - ${testUsers.length} usuários`)
  console.log(`   - ${testConsultas.length} consultas formais`)
  console.log('')
  console.log('Para logar como usuário de teste, use o Magic Link com um dos e-mails acima.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('💥 Erro:', err)
    process.exit(1)
  })
