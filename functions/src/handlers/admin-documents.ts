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
import { getFirestore, FieldValue } from '../services/firestore'
import { saveConfigDoc, loadConfigDoc } from '../services/config-store'
import { getStorage } from 'firebase-admin/storage'
import { assertAdminMaster } from '../middleware/auth'
import { ingestInline } from '../services/ingestion-buffer'

// ── Upload de documento ─────────────────────────────────────────────────

export const adminUploadDocument = onCall(
  { cors: true, timeoutSeconds: 120 },
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

    const db = getFirestore()
    const storage = getStorage()
    const bucket = storage.bucket()

    // Decodifica base64
    const buffer = Buffer.from(contentBase64, 'base64')

    // Gera docId estável baseado no nome do arquivo
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const docId = `uploaded-${Date.now()}-${safeName.replace(/\.[^.]+$/, '').slice(0, 64)}`
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
    const docRef = db.doc(`corpus/uploaded/${docId}`)
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

    // Ingestão inline (extrai texto, chunk, embed, persiste em corpus/{docId})
    let ingestResult: { ok: boolean; chunksCreated: number; error?: string } = { ok: false, chunksCreated: 0, error: 'skipped' }
    if (autoIngest !== false) {
      try {
        const text = await extractText(buffer, mimeType || 'application/octet-stream', fileName)
        if (text && text.length > 10) {
          const apiKey = process.env.GEMINI_API_KEY || ''
          const result = await ingestInline({
            docId,
            text,
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
              status: result.ok ? 'ativo' : 'erro_ingestao',
              chunksCount: result.chunksCreated,
              ingestedAt: FieldValue.serverTimestamp(),
              ingestError: result.error || null,
            },
            { merge: true },
          )
        } else {
          await docRef.set(
            { status: 'arquivo_nao_suportado', ingestError: 'Texto vazio após extração' },
            { merge: true },
          )
        }
      } catch (err: any) {
        await docRef.set(
          { status: 'erro_ingestao', ingestError: err?.message || String(err) },
          { merge: true },
        )
        ingestResult = { ok: false, chunksCreated: 0, error: err?.message }
      }
    }

    return {
      ok: true,
      docId,
      path,
      chunksCreated: ingestResult.chunksCreated,
      ingested: ingestResult.ok,
      message: ingestResult.ok
        ? `Documento salvo e indexado (${ingestResult.chunksCreated} chunks).`
        : `Documento salvo, mas ingestão falhou: ${ingestResult.error || 'desconhecido'}`,
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
    const snap = await db.collection('corpus/uploaded').orderBy('createdAt', 'desc').limit(500).get()
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  },
)

// ── Deletar documento ──────────────────────────────────────────────────

export const adminDeleteDocument = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const { docId } = request.data as { docId: string }
    if (!docId) throw new HttpsError('invalid-argument', 'docId obrigatório')
    const db = getFirestore()
    const storage = getStorage()

    // Pega o doc para remover o arquivo do storage
    const docSnap = await db.doc(`corpus/uploaded/${docId}`).get()
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
    const chunks = await db.collection(`corpus/uploaded/${docId}/chunks`).get()
    const batch = db.batch()
    chunks.docs.forEach((c) => batch.delete(c.ref))
    batch.delete(db.doc(`corpus/uploaded/${docId}`))
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
