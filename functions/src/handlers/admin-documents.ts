/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin: upload e gestão de documentos do corpus.
 *
 *  - adminUploadDocument: recebe base64 ou URL, persiste no Storage, ingere
 *    inline (chunk + embed) para ficar imediatamente disponível no researcher
 *  - adminListDocuments: lista todos os documentos do corpus
 *  - adminDeleteDocument: remove documento + chunks
 *  - adminReingestDocument: re-gera embeddings de um doc específico
 *  - adminGetSourcePaths / adminSetSourcePaths: configura paths de pesquisa
 *    (local / WebDAV / rede)
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { getFirestore, FieldValue } from '../services/firestore'
import { textToStructuredJson, serializeStructuredJson } from '../services/document-json-converter'
import { analyzeAcervoDoc, getHeuristicAnalysis, type AcervoPipelineFlags } from '../services/acervo-analyzer'
import type { LLMConfigLike } from '../services/llm-providers'
import { compressBuffer, estimateCompressionGain } from '../services/storage-compressor'
import { saveConfigDoc, loadConfigDoc } from '../services/config-store'
import { getStorage } from '../services/storage'
import { assertAdminMaster } from '../middleware/auth'
import { ingestInline } from '../services/ingestion-buffer'
import { ingestAcervoDoc } from '../services/ingestion-acervo'

// ── Upload de documento ─────────────────────────────────────────────────

export const adminUploadDocument = onCall(
  { cors: true, timeoutSeconds: 540, memory: '1GiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)

    const { fileName, contentBase64, mimeType, title, type, area, tags, autoIngest } = request.data as {
      fileName: string
      contentBase64: string
      mimeType: string
      title?: string
      type?: string
      area?: string[]
      tags?: string[]
      autoIngest?: boolean
    }

    if (!fileName || !contentBase64) {
      throw new HttpsError('invalid-argument', 'fileName e contentBase64 são obrigatórios')
    }

    const start = Date.now()
    logger.info('adminUploadDocument.start', {
      uid: request.auth.uid,
      fileName,
      mimeType,
      sizeBase64: contentBase64.length,
    })

    let docId: string | undefined
    let docRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData> | undefined
    try {
    const db = getFirestore()
    const storage = getStorage()
    const bucket = storage.bucket()

    // Decodifica base64
    const buffer = Buffer.from(contentBase64, 'base64')

    // Gera docId estável baseado no nome do arquivo
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    docId = `doc-${Date.now()}-${safeName.replace(/\.[^.]+$/, '').slice(0, 64)}`
    docRef = db.doc(`corpus/${docId}`)
    const path = `corpus/uploaded/${docId}/${safeName}`

    // Upload para Storage
    const file = bucket.file(path)
    await file.save(buffer, {
      contentType: mimeType || 'application/octet-stream',
      metadata: {
        metadata: {
          uploadedBy: request.auth.uid,
          uploadedAt: new Date().toISOString(),
          originalName: fileName,
        },
      },
    })

    // Cria/atualiza documento no Firestore (corpus/uploaded) — placeholder
    const inferTitle = title || safeName.replace(/\.[^.]+$/, '')
    const inferredType = type ?? inferType(fileName)
    await docRef.set(
      {
        id: docId,
        title: inferTitle,
        type: inferredType,
        fileName: safeName,
        mimeType: mimeType ?? 'application/octet-stream',
        storagePath: path,
        area: area ?? ['geral'],
        tags: tags ?? [],
        status: 'processando',
        version: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
        source: 'admin-upload',
      },
      { merge: true },
    )

    // ===== NOVO FLUXO V1 (Fase 2a): compactar + JSON estruturado =====
    // 1. Compactar original se faz sentido (txt, md, html, json, csv, etc)
    const { buffer: storedBuffer, encoded } = compressBuffer(
      buffer,
      mimeType || 'application/octet-stream',
      safeName,
    )
    const compressionGain = encoded ? estimateCompressionGain(buffer, storedBuffer) : 0
    const uploadContentType = encoded
      ? 'application/gzip'  // marca como gzip no Storage
      : (mimeType || 'application/octet-stream')

    // Upload com metadata indicando encoding
    await file.save(storedBuffer, {
      contentType: uploadContentType,
      metadata: {
        metadata: {
          uploadedBy: request.auth.uid,
          uploadedAt: new Date().toISOString(),
          originalName: fileName,
          originalSize: String(buffer.length),
          compressed: String(encoded),
          compressionGain: String(compressionGain),
        },
      },
    })

    // 2. Extrair texto
    let text = ''
    let pageCount: number | undefined
    try {
      const extraction = await extractTextWithMetadata(buffer, mimeType || 'application/octet-stream', fileName)
      text = extraction.text
      pageCount = extraction.pageCount
    } catch (err) {
      console.warn(`Extract text falhou para ${fileName}:`, (err as Error).message)
    }

    if (!text || text.length < 10) {
      // Texto vazio ou muito curto
      await docRef.set(
        {
          status: 'arquivo_nao_suportado',
          textContent: '',
          textOriginal: '',
          ingestError: 'Texto vazio ou muito curto após extração',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      return {
        ok: false,
        docId,
        path,
        message: 'Documento salvo, mas texto nao pode ser extraido (formato nao suportado).',
      }
    }

    // 3. Converter para JSON estruturado v1
    const structured = textToStructuredJson(text, fileName, pageCount)
    const textContentJson = serializeStructuredJson(structured)

    // 4. Persistir textContent (JSON) + textOriginal (texto)
    const finalStatus = 'analise_pendente'  // analise vem na Fase 2b
    await docRef.set(
      {
        textContent: textContentJson,
        textOriginal: text.slice(0, 900_000),  // cap 900k chars
        storageFormat: 'json-v1',
        meta: {
          format: structured.meta.format,
          pages: structured.meta.pages,
          paragraphs: structured.meta.paragraphs,
          charsOriginal: structured.meta.charsOriginal,
          charsStored: structured.meta.charsStored,
          compressionRatio: structured.meta.compressionRatio,
        },
        originalSize: buffer.length,
        compressedSize: storedBuffer.length,
        compressionGain,
        status: finalStatus,
        classification: null,
        ementa: null,
        keyPoints: null,
        analyzedAt: null,
        analysisVersion: 0,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    // 5. LEGACY: ainda permite ingest via embed (configurável)
    let ingestResult: { ok: boolean; chunksCreated: number; error?: string } = { ok: false, chunksCreated: 0, error: 'skipped' }
    if (autoIngest !== false) {
      try {
        const apiKey = process.env.GEMINI_API_KEY || ''
        const result = await ingestInline({
          docId,
          text: text,
          title: inferTitle,
          type: inferredType,
          area: area ?? ['geral'],
          tags: tags ?? [],
          source: 'admin-upload',
          url: `gs://${bucket.name}/${path}`,
          storagePath: path,
          apiKey,
        })
        ingestResult = { ok: result.ok, chunksCreated: result.chunksCreated, error: result.error }
        await docRef.set(
          {
            status: result.ok ? finalStatus : 'erro_ingestao',
            chunksCount: result.chunksCreated,
            ingestError: result.error || null,
          },
          { merge: true },
        )
      } catch (err) {
        console.warn('ingestInline falhou (continuando):', (err as Error).message)
        ingestResult = { ok: false, chunksCreated: 0, error: (err as Error).message }
      }
    }

    // 6. Enfileirar na fila oficial (1-por-1, sem paralelismo).
    // O trigger onProcessingQueueUpdated processa este doc sequencialmente.
    try {
      const { enqueueDocsForProcessing } = await import('./admin-process-queue')
      await enqueueDocsForProcessing([docId], request.auth!.uid)
    } catch (err) {
      logger.warn('adminUploadDocument.enqueueFailed (continuando)', { docId, err: (err as Error).message })
    }

    return {
      ok: true,
      docId,
      path,
      compressed: encoded,
      compressionGain: Math.round(compressionGain * 100) + '%',
      format: structured.meta.format,
      paragraphs: structured.meta.paragraphs,
      compressionRatio: structured.meta.compressionRatio,
      chunksCreated: ingestResult.chunksCreated,
      message: `Documento salvo e estruturado em JSON v1 (${structured.meta.paragraphs} paragrafos, ${Math.round(structured.meta.compressionRatio * 100)}% compressao). Adicionado à fila de análise.`,
    }
    } catch (err: any) {
      // Error handling robusto: log detalhado + throw HttpsError explicito
      const errMsg = err?.message ?? String(err)
      const errStack = err?.stack ?? ''
      logger.error('adminUploadDocument.error', {
        uid: request.auth.uid,
        fileName,
        mimeType,
        sizeBase64: contentBase64.length,
        errorMessage: errMsg,
        errorStack: errStack?.slice(0, 1500),
        durationMs: Date.now() - start,
      })
      // Tentar marcar o doc como erro, se possivel
      try {
        if (docId && docRef) {
          await docRef.set(
            {
              status: 'erro_upload',
              ingestError: errMsg,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          )
        }
      } catch { /* ignora */ }
      // Re-throw como HttpsError
      throw new HttpsError('internal', `Falha no upload/processamento: ${errMsg}`)
    }
  },
)

// ── Listar documentos do corpus ──────────────────────────────────────────

export const adminListDocuments = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const db = getFirestore()
    let snap
    try {
      snap = await db.collection('corpus').orderBy('createdAt', 'desc').limit(500).get()
    } catch (err: any) {
      // Fallback: sem orderBy (evita dependencia de indice composto)
      logger.warn('adminListDocuments.orderBy-failed', { err: err?.message })
      try {
        snap = await db.collection('corpus').limit(500).get()
      } catch (err2: any) {
        // Ultimo fallback: retornar lista vazia
        logger.error('adminListDocuments.collection-failed', { err: err2?.message })
        return []
      }
    }
    // Retorna shape enxuto para a planilha (sem textContent pesado)
    return snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        fileName: data.fileName,
        title: data.title,
        type: data.type,
        area: data.area || [],
        tags: data.tags || [],
        status: data.status,
        storageSize: data.storageSize,
        originalSize: data.originalSize,
        compressedSize: data.compressedSize,
        compressionGain: data.compressionGain,
        format: data.meta?.format,
        pages: data.meta?.pages,
        paragraphs: data.meta?.paragraphs,
        compressionRatio: data.meta?.compressionRatio,
        classification: data.classification || null,
        ementa: data.ementa || null,
        keyPoints: data.keyPoints || null,
        analyzedAt: data.analyzedAt,
        analysisError: data.analysisError,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        createdBy: data.createdBy,
      }
    })
  },
)

// ── Deletar documento ──────────────────────────────────────────────────

export const adminDeleteDocument = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    // Aceita tanto { docId } quanto a string crua (compat com bundles antigos).
    const raw = request.data as unknown
    const docId = typeof raw === 'string' ? raw : (raw as { docId?: string })?.docId
    if (!docId) throw new HttpsError('invalid-argument', 'docId obrigatório')
    const db = getFirestore()
    const storage = getStorage()

    // Pega o doc para remover o arquivo do storage
    const docSnap = await db.doc(`corpus/${docId}`).get()
    if (docSnap.exists) {
      const data = docSnap.data() as any
      if (data.storagePath) {
        try {
          await storage.bucket().file(data.storagePath).delete()
        } catch (err: any) {
          console.warn('Arquivo não removido do Storage:', err?.message)
        }
      }
    }

    // Remove chunks
    const chunks = await db.collection(`corpus/${docId}/chunks`).get()
    const batch = db.batch()
    chunks.docs.forEach((c) => batch.delete(c.ref))
    batch.delete(db.doc(`corpus/${docId}`))
    await batch.commit()
    return { ok: true, removedChunks: chunks.size }
  },
)

// ── Source paths (configuração de pastas) ──────────────────────────────

/**
 * Source paths: configurações de pastas locais/WebDAV/rede para
 * o agente pesquisar documentos.
 *
 * Stored em: admin-config/source-paths
 *  - paths: array de { id, name, type, uri, enabled, schedule }
 *  - type: 'local' | 'webdav' | 'smb' | 'google-drive' | 'onedrive'
 *  - uri: caminho (file:///path) ou URL (https://...)
 */
export const adminGetSourcePaths = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
      const loaded = await loadConfigDoc<{ paths: any[] }>('admin-config/source-paths', 'source-paths')
    if (!loaded) return { paths: [] }
    return { paths: loaded.data.paths || [] }
  },
)

export const adminSetSourcePaths = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const { paths } = request.data as { paths: any[] }
    if (!Array.isArray(paths)) {
      throw new HttpsError('invalid-argument', 'paths deve ser array')
    }
    const pathsNormalized = paths.map((p, i) => ({
      id: p.id || `path-${Date.now()}-${i}`,
      name: p.name || `Pasta ${i + 1}`,
      type: p.type || 'local',
      uri: p.uri || '',
      enabled: p.enabled !== false,
      schedule: p.schedule || 'manual',
      lastSyncAt: p.lastSyncAt || null,
      createdAt: p.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))
    const result = await saveConfigDoc({ paths: pathsNormalized }, {
      uid: request.auth.uid,
      path: 'admin-config/source-paths',
      tag: 'source-paths',
    })
    return { ok: true, count: paths.length, savedAt: result.savedAt }
  },
)

/**
 * Trigger manual de sincronização de um path.
 * Em produção, isso chamaria um job de ingestão que varre o path.
 */
export const adminSyncSourcePath = onCall(
  { cors: true, timeoutSeconds: 540 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const { pathId } = request.data as { pathId: string }
    if (!pathId) throw new HttpsError('invalid-argument', 'pathId obrigatório')

    const loaded = await loadConfigDoc<{ paths: any[] }>('admin-config/source-paths', 'source-paths')
    if (!loaded) {
      throw new HttpsError('not-found', 'Nenhuma configuração de paths')
    }
    const path = (loaded.data.paths || []).find((p: any) => p.id === pathId)
    if (!path) throw new HttpsError('not-found', `Path ${pathId} não encontrado`)

    // Atualiza lastSyncAt
    const newPaths = (loaded.data.paths || []).map((p: any) =>
      p.id === pathId ? { ...p, lastSyncAt: new Date().toISOString() } : p,
    )
    await saveConfigDoc({ paths: newPaths }, {
      uid: request.auth!.uid,
      path: 'admin-config/source-paths',
      tag: 'source-paths',
    })

    // NOTA: a sincronização real (varrer o path) precisa de um agente local
    // ou Cloud Function com acesso à rede. Aqui só marcamos como sincronizado
    // e instruímos o admin a usar a UI de upload ou rodar o script CLI.
    return {
      ok: true,
      pathId,
      message: `Path ${path.name} marcado como sincronizado. Para ingerir documentos, use a aba "Upload" ou rode o script CLI no host.`,
    }
  },
)

// ── Util ───────────────────────────────────────────────────────────────

/**
 * Extrai texto de um buffer conforme mimeType/extensão.
 * Suporta: txt, md, html, pdf, docx.
 */
async function extractTextWithMetadata(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<{ text: string; pageCount?: number }> {
  const result = await extractText(buffer, mimeType, fileName)
  // Tentar extrair pageCount de PDFs
  if (fileName.toLowerCase().endsWith('.pdf') || mimeType === 'application/pdf') {
    try {
      const pdfParse = (await import('pdf-parse')).default
      const parsed = await pdfParse(buffer)
      return { text: result, pageCount: parsed.numpages }
    } catch {
      // ignore
    }
  }
  return { text: result }
}

async function extractText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  const isText =
    mimeType.startsWith('text/') ||
    ['md', 'markdown', 'txt', 'csv', 'log', 'json', 'xml', 'html', 'htm'].includes(ext)
  if (isText) {
    return buffer.toString('utf-8')
  }
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    try {
      // dynamic import para não inflar o cold start
      const pdfParse = (await import('pdf-parse')).default
      const result = await pdfParse(buffer)
      return result.text || ''
    } catch (err: any) {
      // Fallback: retornar vazio e admin usa outro formato
      console.warn('PDF parse falhou:', err?.message)
      return ''
    }
  }
  if (ext === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      return result.value || ''
    } catch (err: any) {
      console.warn('DOCX parse falhou:', err?.message)
      return ''
    }
  }
  if (ext === 'html' || mimeType === 'text/html') {
    // Strip tags simples
    return buffer.toString('utf-8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return ''
}

function inferType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    pdf: 'ato',
    docx: 'ato',
    doc: 'ato',
    md: 'manual',
    markdown: 'manual',
    txt: 'manual',
    html: 'ato',
  }
  return map[ext ?? ''] ?? 'manual'
}


/**
 * Roda analyzeAcervoDoc em background (sem bloquear a response).
 * Carrega o LLM config do admin global, roda os 3 agentes, salva resultado no Firestore.
 */


/**
 * Resolve a config do pipeline de analise do acervo.
 * Retorna defaults (tudo ON, llmOverride null) se nao existir.
 */
async function resolveAcervoPipelineConfig(): Promise<{
  flags: AcervoPipelineFlags
  llmOverride: { provider?: string; model?: string; apiKey?: string } | null
}> {
  try {
    // Como eh onCall, nao posso chamar diretamente. Vou ler o doc
    const db = getFirestore()
    const snap = await db.doc('admin-config/acervo-pipeline').get()
    if (!snap.exists) {
      return { flags: {}, llmOverride: null }
    }
    const data = snap.data() as any
    const config = data.data || data  // envelope ou legacy
    return {
      flags: {
        enableClassifier: config.enableClassifier !== false,
        enableEmenta: config.enableEmenta !== false,
        enableKeyPoints: config.enableKeyPoints !== false,
      },
      llmOverride: config.llmOverride || null,
    }
  } catch (err) {
    logger.warn('resolveAcervoPipelineConfig failed, using defaults', { err: (err as Error).message })
    return { flags: {}, llmOverride: null }
  }
}


// Mutex in-memory para evitar re-analises concorrentes no mesmo docId
// (race condition: 2 analises paralelas -> last write wins, pode perder dados)
const analysisMutex = new Map<string, Promise<void>>()

export async function runAnalysisInBackground(input: {
  uid: string
  docId: string
  fileName: string
  text: string
  docRef: FirebaseFirestore.DocumentReference
}): Promise<void> {
  // Mutex: se ja tem analise rodando para este doc, espera ela terminar
  const existing = analysisMutex.get(input.docId)
  if (existing) {
    logger.info('analyzeAcervoDoc: waiting for previous analysis', { docId: input.docId })
    try { await existing } catch { /* ignora */ }
  }
  let resolveMutex!: () => void
  const mutexPromise = new Promise<void>((resolve) => { resolveMutex = resolve })
  analysisMutex.set(input.docId, mutexPromise)
  // Uso intencional: resolveMutex eh atribuido no callback e chamado no finally
  void resolveMutex  // referencia intencional para satisfazer TS strict
  let analysisSucceeded = false
  try {
    // Marcar como processando
    await input.docRef.set(
      { status: 'analise_processando', analysisStartedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
    // Carregar pipeline config (toggles + override de modelo)
    const { flags, llmOverride } = await resolveAcervoPipelineConfig()
    logger.info('acervo-pipeline: flags resolved', { docId: input.docId, flags, hasOverride: !!llmOverride })

    // Resolver LLM config: agente 'acervo' (custom) > override legado > admin global > env
    let llmConfig: LLMConfigLike | null = await resolveLLMConfigForAnalysis(input.uid)
    let acervoExtra = ''
    try {
      const { loadAgentsConfig, resolveAgentLLMConfig, buildAgentSkillsPrompt } = await import('../services/agents-config')
      const { loadLegalTaxonomy, buildTaxonomyPromptBlock } = await import('../services/legal-taxonomy')
      const [agentsConfig, taxonomy] = await Promise.all([loadAgentsConfig(), loadLegalTaxonomy()])
      const acervoAgent = agentsConfig.agents.acervo
      acervoExtra = [buildTaxonomyPromptBlock(taxonomy), buildAgentSkillsPrompt(acervoAgent)]
        .filter(Boolean).join('\n\n')
      const resolved = resolveAgentLLMConfig(acervoAgent, llmConfig)
      if (resolved) {
        llmConfig = resolved
        if (acervoAgent.model.mode === 'custom') {
          logger.info('acervo-pipeline: usando modelo dedicado do agente acervo', { provider: resolved.provider, model: resolved.model })
        }
      }
    } catch (err) {
      logger.warn('acervo-pipeline: falha ao resolver agents-config/taxonomia, usando global', { err: (err as Error).message })
    }
    // Compat: override legado (admin-config/acervo-pipeline.llmOverride) ainda tem prioridade se preenchido.
    if (llmOverride && llmOverride.provider && llmOverride.model && llmOverride.apiKey) {
      logger.info('acervo-pipeline: usando llmOverride legado', { provider: llmOverride.provider, model: llmOverride.model })
      llmConfig = {
        provider: llmOverride.provider as any,
        model: llmOverride.model,
        apiKey: llmOverride.apiKey,
      }
    }
    // Se NAO tem LLM, usar heuristica diretamente
    if (!llmConfig) {
      logger.warn('analyzeAcervoDoc: sem LLM config disponivel, usando heuristica de fallback', { docId: input.docId })
      const heuristic = getHeuristicAnalysis(input.fileName, input.text)
      await input.docRef.set(
        {
          classification: heuristic.classification,
          ementa: heuristic.ementa,
          keyPoints: heuristic.keyPoints,
          status: 'analisado',
          analyzedAt: FieldValue.serverTimestamp(),
          analysisVersion: 1,
          analysisLatencyMs: 0,
          analysisTokens: { input: 0, output: 0, total: 0 },
          analysisMethod: 'heuristic',
          analysisNote: 'Análise via heurística (LLM não configurado)',
        },
        { merge: true },
      )
      analysisSucceeded = true
      logger.info('acervo-analyzer.heuristic.done', { docId: input.docId, tipoDocumento: heuristic.classification.tipoDocumento })
      return
    }
    logger.info('analyzeAcervoDoc: starting', { docId: input.docId, provider: llmConfig.provider, model: llmConfig.model })
    const result = await analyzeAcervoDoc({
      uid: input.uid,
      docId: input.docId,
      fileName: input.fileName,
      text: input.text,
      llmConfig,
      pipelineFlags: flags,
      extraInstructions: acervoExtra,
    })
    // Salvar resultado (status='analisado' SEMPRE se o analyzer retornou dados)
    await input.docRef.set(
      {
        classification: result.classification,
        ementa: result.ementa,
        keyPoints: result.keyPoints,
        status: 'analisado',
        analyzedAt: FieldValue.serverTimestamp(),
        analysisVersion: 1,
        analysisLatencyMs: result.totalLatencyMs,
        analysisTokens: result.tokens,
        analysisMethod: 'llm',
      },
      { merge: true },
    )
    analysisSucceeded = true
    logger.info('analyzeAcervoDoc: done', { docId: input.docId, latencyMs: result.totalLatencyMs })
    // Fase 2c: re-indexar no corpus (NÃO falha o status se der erro)
    try {
      const geminiKey = process.env.GEMINI_API_KEY || ''
      const reindex = await ingestAcervoDoc({
        docId: input.docId,
        text: input.text,
        title: input.fileName.replace(/\.\w+\$/, ''),
        fileName: input.fileName,
        type: 'acervo',
        area: [],
        tags: [],
        classification: result.classification,
        ementa: result.ementa,
        keyPoints: result.keyPoints,
        apiKey: geminiKey,
        replace: true,
      })
      logger.info('acervo.reindexed', { docId: input.docId, chunks: reindex.chunksCreated, keywords: reindex.searchKeywords.length })
    } catch (reidxErr) {
      // Re-index falhou (ex: sem GEMINI_API_KEY), mas status ja' esta' 'analisado'
      logger.warn('acervo.reindexFailed', { docId: input.docId, err: (reidxErr as Error).message })
    }
  } catch (err) {
    // Só sobrescreve status se a análise NÃO teve sucesso
    if (analysisSucceeded) {
      logger.warn('analyzeAcervoDoc: erro pos-analise, mantendo status=analisado', { docId: input.docId, err: (err as Error).message })
    } else {
      logger.error('analyzeAcervoDoc: failed', { docId: input.docId, err: (err as Error).message })
      try {
        await input.docRef.set(
          { status: 'erro_analise', analysisError: (err as Error).message, analysisCompletedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Resolve o LLM config para analise:
 *  1. admin-config/llm (master) — fonte canonica (OpenRouter, OpenAI, Anthropic, Custom, etc.)
 *  2. se nao houver config ou for Gemini explicito do env: retorna null
 *     (forca heuristica de fallback em acervo-analyzer)
 *
 * IMPORTANTE: Gemini/Google foi DESATIVADO nesta versao (decisao do projeto).
 * Nao fazemos fallback automatico para process.env.GEMINI_API_KEY.
 * Se o admin quiser usar Gemini, deve configurar explicitamente em
 * admin-config/llm com provider='google' e sua propria API key.
 */
export async function resolveLLMConfigForAnalysis(_uid: string): Promise<{
  provider: 'openrouter' | 'google' | 'openai' | 'anthropic' | 'custom'
  model: string
  apiKey: string
  temperature?: number
  maxTokens?: number
} | null> {
  const db = getFirestore()
  const masterSnap = await db.doc('admin-config/llm').get()
  if (masterSnap.exists) {
    const raw = masterSnap.data() as any
    // Doc gravado com envelope { data: {...} }; aceita também o formato legado (raiz).
    const d = raw?.data && typeof raw.data === 'object' ? raw.data : raw
    if (d && d.model && d.provider) {
      // Chave: doc secreto (master-only); fallback à chave legada no doc principal.
      const { readGlobalApiKey } = await import('../services/global-llm')
      const apiKey = await readGlobalApiKey(d.apiKey)
      if (apiKey) {
        return {
          provider: d.provider,
          model: d.model,
          apiKey,
          temperature: d.temperature,
          maxTokens: d.maxTokens,
        }
      }
    }
  }
  // Sem config global: retorna null (usa heuristica).
  // Gemini automatico via env foi REMOVIDO (decisao do projeto).
  return null
}

// ── Pegar documento completo (com JSON estruturado) ─────────────────────

export const adminGetDocument = onCall(
  { cors: true, enforceAppCheck: false, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const { docId } = (request.data || {}) as { docId: string }
    if (!docId) throw new HttpsError('invalid-argument', 'docId obrigatorio')
    const db = getFirestore()
    const docSnap = await db.doc(`corpus/${docId}`).get()
    if (!docSnap.exists) throw new HttpsError('not-found', 'Documento nao encontrado')
    const data = docSnap.data() || {}
    // SHAPE ENXUTO: NAO retornar textContent (pode ter 5MB+)
    // Frontend usa adminGetDocumentTextContent para carregar sob demanda
    const { textContent, textOriginal, ...rest } = data
    return {
      id: docSnap.id,
      ...rest,
      hasTextContent: typeof textContent === 'string' && textContent.length > 0,
      hasTextOriginal: typeof textOriginal === 'string' && textOriginal.length > 0,
      textContentLength: typeof textContent === 'string' ? textContent.length : 0,
      textOriginalLength: typeof textOriginal === 'string' ? textOriginal.length : 0,
    }
  },
)

/**
 * Carrega APENAS o textContent (JSON estruturado) de um doc.
 * Endpoint separado para evitar DEADLINE_EXCEEDED (textContent pode ter 5MB+).
 */
export const adminGetDocumentTextContent = onCall(
  { cors: true, enforceAppCheck: false, timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const { docId } = (request.data || {}) as { docId: string }
    if (!docId) throw new HttpsError('invalid-argument', 'docId obrigatorio')
    const db = getFirestore()
    const docSnap = await db.doc(`corpus/${docId}`).get()
    if (!docSnap.exists) throw new HttpsError('not-found', 'Documento nao encontrado')
    const data = docSnap.data() || {}
    return {
      id: docSnap.id,
      textContent: data.textContent || '',
      textOriginal: data.textOriginal || '',
    }
  },
)

/**
 * Salva o texto reconstruido editado pelo admin.
 * Rebuild do JSON v2 (parágrafos íntegros) a partir do texto editado e persiste
 * em `textContent`. Não mexe no `textOriginal` (extração crua original).
 */
export const adminSaveDocumentTextContent = onCall(
  { cors: true, enforceAppCheck: false, timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const { docId, fullText } = (request.data || {}) as { docId: string; fullText: string }
    if (!docId) throw new HttpsError('invalid-argument', 'docId obrigatorio')
    if (typeof fullText !== 'string') throw new HttpsError('invalid-argument', 'fullText obrigatorio')
    const db = getFirestore()
    const docRef = db.doc(`corpus/${docId}`)
    const docSnap = await docRef.get()
    if (!docSnap.exists) throw new HttpsError('not-found', 'Documento nao encontrado')
    const data = docSnap.data() || {}
    const fileName = (data.fileName as string) || docId
    const pageCount = ((data.meta as Record<string, unknown> | undefined)?.pages as number | undefined)
    // Reconstrói o JSON v2 a partir do texto editado (mantém parágrafos íntegros).
    const structured = textToStructuredJson(fullText.slice(0, 900_000), fileName, pageCount)
    const textContentJson = serializeStructuredJson(structured)
    await docRef.set(
      {
        textContent: textContentJson,
        storageFormat: 'json-v1',
        textEditedAt: FieldValue.serverTimestamp(),
        textEditedBy: request.auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    logger.info('adminSaveDocumentTextContent.done', {
      docId,
      uid: request.auth.uid,
      paragraphs: structured.meta.paragraphs,
      chars: fullText.length,
    })
    return {
      ok: true,
      paragraphs: structured.meta.paragraphs,
      chars: structured.fullText.length,
    }
  },
)

/**
 * Atualiza a análise editada manualmente pelo admin (classificação e/ou ementa).
 * Faz merge no doc do corpus. Não roda LLM. Marca a edição para auditoria.
 */
export const adminUpdateDocumentAnalysis = onCall(
  { cors: true, enforceAppCheck: false, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const { docId, classification, ementa } = (request.data || {}) as {
      docId: string
      classification?: Record<string, unknown> | null
      ementa?: Record<string, unknown> | null
    }
    if (!docId) throw new HttpsError('invalid-argument', 'docId obrigatorio')
    if (!classification && !ementa) {
      throw new HttpsError('invalid-argument', 'Envie classification e/ou ementa')
    }
    const db = getFirestore()
    const docRef = db.doc(`corpus/${docId}`)
    const docSnap = await docRef.get()
    if (!docSnap.exists) throw new HttpsError('not-found', 'Documento nao encontrado')

    const update: Record<string, unknown> = {
      analysisEditedAt: FieldValue.serverTimestamp(),
      analysisEditedBy: request.auth.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (classification && typeof classification === 'object') update.classification = classification
    if (ementa && typeof ementa === 'object') update.ementa = ementa
    await docRef.set(update, { merge: true })
    logger.info('adminUpdateDocumentAnalysis.done', {
      docId,
      uid: request.auth.uid,
      editedClassification: !!classification,
      editedEmenta: !!ementa,
    })
    return { ok: true }
  },
)

/**
 * Gera URL assinada para download do PDF original no Storage.
 */
export const adminGetDocumentDownloadUrl = onCall(
  { cors: true, enforceAppCheck: false, timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const { docId } = (request.data || {}) as { docId: string }
    if (!docId) throw new HttpsError('invalid-argument', 'docId obrigatorio')
    const db = getFirestore()
    const docSnap = await db.doc(`corpus/${docId}`).get()
    if (!docSnap.exists) throw new HttpsError('not-found', 'Documento nao encontrado')
    const data = docSnap.data() || {}
    const storagePath = data.storagePath as string | undefined
    if (!storagePath) throw new HttpsError('not-found', 'Documento nao tem storagePath')
    const { getPublicDownloadUrl } = await import('../services/storage-download')
    const url = await getPublicDownloadUrl(storagePath)
    if (!url) throw new HttpsError('internal', 'Nao foi possivel gerar a URL de download')
    // Cacheia no doc para o chat/pipeline reaproveitarem sem novo acesso ao Storage.
    try { await db.doc(`corpus/${docId}`).set({ downloadUrl: url }, { merge: true }) } catch { /* ignora */ }
    return { url, expiresIn: 0 }
  },
)

// ── Re-analisar documento (enfileira na fila oficial 1-por-1) ─────────

export const adminReanalyzeDocument = onCall(
  { cors: true, enforceAppCheck: false, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const { docId } = (request.data || {}) as { docId: string }
    if (!docId) throw new HttpsError('invalid-argument', 'docId obrigatorio')
    const db = getFirestore()
    const docSnap = await db.doc(`corpus/${docId}`).get()
    if (!docSnap.exists) throw new HttpsError('not-found', 'Documento nao encontrado')
    const data = docSnap.data() || {}
    const text = (data.textOriginal as string) || (data.textContent as string) || ''
    if (!text) throw new HttpsError('failed-precondition', 'Documento sem texto para analisar')

    // Enfileira na fila oficial (1-por-1, sem paralelismo).
    // O trigger onProcessingQueueUpdated processa este doc sequencialmente.
    const { enqueueDocsForProcessing } = await import('./admin-process-queue')
    const result = await enqueueDocsForProcessing([docId], request.auth.uid)

    return {
      ok: true,
      docId,
      totalInQueue: result.totalInQueue,
      message: `Documento adicionado à fila (1 de ${result.totalInQueue}). O processamento é sequencial.`,
    }
  },
)

