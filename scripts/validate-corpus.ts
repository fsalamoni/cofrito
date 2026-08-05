#!/usr/bin/env node
/**
 * Valida o corpus antes/depois da ingestão.
 * - Verifica frontmatter de cada arquivo .md
 * - Conta chunks estimados
 * - Lista documentos sem campos obrigatórios
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import matter from 'gray-matter'

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
]

async function main() {
  const dataDir = path.join(process.cwd(), 'data', 'raw')
  const files = await listMarkdownFiles(dataDir)

  console.log(`📚 Encontrados ${files.length} arquivos em ${dataDir}\n`)

  let ok = 0
  let warnings = 0
  let errors = 0

  for (const file of files) {
    const rel = path.relative(process.cwd(), file)
    const content = await fs.readFile(file, 'utf-8')
    const { data, content: body } = matter(content)

    const issues: string[] = []

    if (!data.title) issues.push('❌ title ausente')
    else if (typeof data.title !== 'string') issues.push('❌ title inválido')

    if (!data.type) issues.push('❌ type ausente')
    else if (!VALID_TYPES.includes(data.type)) {
      issues.push(`❌ type inválido: "${data.type}" (esperado: ${VALID_TYPES.join(', ')})`)
    }

    if (!data.area) issues.push('⚠️  area ausente (recomendado)')
    else if (!Array.isArray(data.area) && typeof data.area !== 'string') {
      issues.push('⚠️  area deve ser array ou string')
    }

    if (!data.tags) issues.push('⚠️  tags ausentes (recomendado)')

    if (!data.status) issues.push('⚠️  status ausente (assumindo "ativo")')
    else if (!['ativo', 'revogado', 'parcial'].includes(data.status)) {
      issues.push(`❌ status inválido: "${data.status}"`)
    }

    if (body.trim().length < 100) {
      issues.push('⚠️  conteúdo muito curto (< 100 chars)')
    }

    if (issues.length === 0) {
      console.log(`✅ ${rel}`)
      ok++
    } else {
      console.log(`\n📄 ${rel}`)
      for (const issue of issues) {
        console.log(`   ${issue}`)
        if (issue.startsWith('❌')) errors++
        else warnings++
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`✅ OK: ${ok}`)
  console.log(`⚠️  Avisos: ${warnings}`)
  console.log(`❌ Erros: ${errors}`)
  console.log('='.repeat(60))

  if (errors > 0) {
    console.log('\n❌ Existem erros que precisam ser corrigidos antes da ingestão.')
    process.exit(1)
  }
  console.log('\n✅ Corpus validado com sucesso.')
  process.exit(0)
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const result: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...(await listMarkdownFiles(fullPath)))
    } else if (entry.name.endsWith('.md') && entry.name !== 'README.md') {
      result.push(fullPath)
    }
  }
  return result
}

main().catch((err) => {
  console.error('💥 Erro:', err)
  process.exit(1)
})
