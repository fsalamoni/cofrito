/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin: upload e gestão de documentos do corpus.
 *
 *  - adminUploadDocument: recebe base64 ou URL, persiste no Storage, ingere
 *  - adminListDocuments: lista todos os documentos do corpus
 *  - adminDeleteDocument: remove documento + chunks
 *  - adminReingestDocument: re-gera embeddings de um doc específico
 *  - adminGetSourcePaths / adminSetSourcePaths: configura paths de pesquisa
 *    (local / WebDAV / rede)
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { assertAdminMaster } from '../middleware/auth'

// ── Upload de documento ─────────────────────────────────────────────────

export const adminUploadDocument = onCall(
  { cors: true, timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)

    const { fileName, contentBase64, mimeType, title, type, area, tags } = request.data as {
      fileName: string
      contentBase64: string
      mimeType: string
      title?: string
      type?: string
      area?: string[]
      tags?: string[]
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
    const docId = `uploaded-${Date.now()}-${safeName.replace(/\.[^.]+$/, '')}`
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

    // Cria/atualiza documento no Firestore (corpus/uploaded)
    const docRef = db.doc(`corpus/uploaded/${docId}`)
    const inferTitle = title || safeName.replace(/\.[^.]+$/, '')
    await docRef.set(
      {
        id: docId,
        title: inferTitle,
        type: type ?? inferType(fileName),
        fileName: safeName,
        mimeType: mimeType ?? 'application/octet-stream',
        storagePath: path,
        area: area ?? ['geral'],
        tags: tags ?? [],
        status: 'pendente_ingestao', // admin precisa rodar ingestão manual depois
        version: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
        source: 'admin-upload',
      },
      { merge: true },
    )

    return {
      ok: true,
      docId,
      path,
      message: 'Documento salvo. Use o botão "Re-ingerir corpus" para processar embeddings.',
    }
  },
)

// ── Listar documentos do corpus ──────────────────────────────────────────

export const adminListDocuments = onCall(
  { cors: true },
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
  { cors: true },
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
  { cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const db = getFirestore()
    const snap = await db.doc('admin-config/source-paths').get()
    if (!snap.exists) {
      return { paths: [] }
    }
    return snap.data()
  },
)

export const adminSetSourcePaths = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const { paths } = request.data as { paths: any[] }
    if (!Array.isArray(paths)) {
      throw new HttpsError('invalid-argument', 'paths deve ser array')
    }
    const db = getFirestore()
    await db.doc('admin-config/source-paths').set(
      {
        paths: paths.map((p, i) => ({
          id: p.id || `path-${Date.now()}-${i}`,
          name: p.name || `Pasta ${i + 1}`,
          type: p.type || 'local',
          uri: p.uri || '',
          enabled: p.enabled !== false,
          schedule: p.schedule || 'manual',
          lastSyncAt: p.lastSyncAt || null,
          createdAt: p.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      },
      { merge: true },
    )
    return { ok: true, count: paths.length }
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

    const db = getFirestore()
    const snap = await db.doc('admin-config/source-paths').get()
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Nenhuma configuração de paths')
    }
    const data = snap.data() as any
    const path = (data.paths || []).find((p: any) => p.id === pathId)
    if (!path) throw new HttpsError('not-found', `Path ${pathId} não encontrado`)

    // Atualiza lastSyncAt
    const newPaths = (data.paths || []).map((p: any) =>
      p.id === pathId ? { ...p, lastSyncAt: new Date().toISOString() } : p,
    )
    await db.doc('admin-config/source-paths').set(
      { paths: newPaths, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    )

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
