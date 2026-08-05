/**
 * Validação do corpus (frontmatter, completude).
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
] as const

export async function validateCorpus(dataDir?: string): Promise<{ ok: boolean; errors: number; warnings: number }> {
  const dir = dataDir || path.join(process.cwd(), 'data', 'raw')
  const files = await listMarkdownFiles(dir)
  let errors = 0
  let warnings = 0

  console.log(`📚 Encontrados ${files.length} arquivos em ${dir}\n`)

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8')
    const { data, content: body } = matter(content)
    const issues: string[] = []

    if (!data.title) issues.push('title ausente')
    if (!data.type || !VALID_TYPES.includes(data.type as any)) {
      issues.push(`type inválido: "${data.type}"`)
    }
    if (!data.area) issues.push('area ausente (recomendado)')
    if (!data.tags) issues.push('tags ausentes (recomendado)')
    if (body.trim().length < 100) issues.push('conteúdo muito curto')

    if (issues.length > 0) {
      console.log(`📄 ${path.relative(process.cwd(), file)}`)
      for (const issue of issues) {
        const isError = issue.includes('inválido') || issue.includes('ausente') && !issue.includes('recomendado')
        console.log(`   ${isError ? '❌' : '⚠️ '}  ${issue}`)
        if (isError) errors++
        else warnings++
      }
    }
  }

  console.log(`\n✅ ${files.length} arquivos analisados. Erros: ${errors}, Avisos: ${warnings}`)
  return { ok: errors === 0, errors, warnings }
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const result: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'README.md') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...(await listMarkdownFiles(fullPath)))
    } else if (entry.name.endsWith('.md')) {
      result.push(fullPath)
    }
  }
  return result
}
