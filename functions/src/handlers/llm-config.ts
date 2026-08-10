/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Handlers de LLM Config — user + admin master.
 *
 * Storage:
 *  - user: campo `llmConfig` em `users/{uid}` (subcollection path com 3 segments é inválido)
 *  - master: doc `admin-config/llm` (global, esconde user)
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { assertAdminMaster } from '../middleware/auth'
import { listModelsForProvider, type LLMConfigLike, type LLMProvider } from '../services/llm-providers'

// ── USER: get/set/delete config pessoal (campo no user doc) ───────────────

export const getLLMConfig = onCall({ cors: true, enforceAppCheck: false },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  const db = getFirestore()
  const snap = await db.doc(`users/${request.auth.uid}`).get()
  if (!snap.exists) return null
  const data = snap.data() as any
  const cfg = data.llmConfig
  if (!cfg) return null
  return {
    provider: cfg.provider,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    scope: 'user',
    hasApiKey: !!cfg.apiKey,
    apiKeyMasked: cfg.apiKey ? maskKey(cfg.apiKey) : '',
    updatedAt: cfg.updatedAt,
  }
})

export const setLLMConfig = onCall({ cors: true, enforceAppCheck: false },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  const cfg = request.data as LLMConfigLike
  if (!cfg || !cfg.provider || !cfg.model) {
    throw new HttpsError('invalid-argument', 'provider e model são obrigatórios')
  }
  const db = getFirestore()
  await db.doc(`users/${request.auth.uid}`).set(
    {
      llmConfig: {
        ...cfg,
        scope: 'user',
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  )
  return { ok: true }
})

export const deleteLLMConfig = onCall({ cors: true, enforceAppCheck: false },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  const db = getFirestore()
  await db.doc(`users/${request.auth.uid}`).set(
    { llmConfig: FieldValue.delete() },
    { merge: true },
  )
  return { ok: true }
})

// ── MASTER ADMIN: config global ──────────────────────────────────────────

export const adminGetGlobalLLM = onCall({ cors: true, enforceAppCheck: false },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  await assertAdminMaster(request.auth.uid)
  const db = getFirestore()
  const snap = await db.doc('admin-config/llm').get()
  if (!snap.exists) return null
  const data = snap.data() as any
  return {
    provider: data.provider,
    model: data.model,
    baseUrl: data.baseUrl,
    scope: 'global',
    hasApiKey: !!data.apiKey,
    apiKeyMasked: data.apiKey ? maskKey(data.apiKey) : '',
    updatedAt: data.updatedAt,
  }
})

export const adminSetGlobalLLM = onCall({ cors: true, enforceAppCheck: false },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  await assertAdminMaster(request.auth.uid)
  const cfg = request.data as LLMConfigLike | null
  const db = getFirestore()
  if (!cfg) {
    await db.doc('admin-config/llm').delete()
    return { ok: true, removed: true }
  }
  await db.doc('admin-config/llm').set(
    {
      ...cfg,
      scope: 'global',
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    },
    { merge: true },
  )
  return { ok: true }
})

// ── Listagem de modelos (chamada pelo front) ─────────────────────────────

export const listLLMModels = onCall({ cors: true, enforceAppCheck: false },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  const { provider, apiKey, baseUrl } = request.data as { provider: LLMProvider; apiKey: string; baseUrl?: string }
  if (!provider) throw new HttpsError('invalid-argument', 'provider obrigatório')
  try {
    const models = await listModelsForProvider(provider, apiKey, baseUrl)
    return models
  } catch (err: any) {
    console.warn('listLLMModels falhou:', err?.message)
    return []
  }
})

// ── Admin: gerenciar admins (grant/revoke/list) ─────────────────────────

export const adminListAdmins = onCall({ cors: true, enforceAppCheck: false },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  await assertAdminMaster(request.auth.uid)
  const db = getFirestore()
  const snap = await db.collection('admins').orderBy('grantedAt', 'desc').get()
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
})

export const adminGrantAdmin = onCall({ cors: true, enforceAppCheck: false },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  await assertAdminMaster(request.auth.uid)
  const { email, role } = request.data as { email: string; role: 'admin' | 'master' }
  if (!email || !role) throw new HttpsError('invalid-argument', 'email e role obrigatórios')
  if (role !== 'admin' && role !== 'master') {
    throw new HttpsError('invalid-argument', 'role deve ser "admin" ou "master"')
  }
  const db = getFirestore()
  // Buscar uid pelo email
  const users = await db.collection('users').where('email', '==', email).limit(1).get()
  if (users.empty) {
    throw new HttpsError('not-found', `Nenhum usuário com email ${email} ainda.`)
  }
  const userDoc = users.docs[0]
  await db.doc(`admins/${userDoc.id}`).set(
    {
      uid: userDoc.id,
      email,
      role,
      active: true,
      grantedAt: FieldValue.serverTimestamp(),
      grantedBy: request.auth.uid,
      displayName: userDoc.data().displayName ?? email,
    },
    { merge: true },
  )
  return { ok: true, uid: userDoc.id }
})

export const adminRevokeAdmin = onCall({ cors: true, enforceAppCheck: false },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  await assertAdminMaster(request.auth.uid)
  const uid = request.data as string
  if (uid === request.auth.uid) {
    throw new HttpsError('failed-precondition', 'Você não pode revogar seu próprio acesso.')
  }
  const db = getFirestore()
  await db.doc(`admins/${uid}`).delete()
  return { ok: true }
})

export const adminListUserLLM = onCall({ cors: true, enforceAppCheck: false },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  await assertAdminMaster(request.auth.uid)
  const db = getFirestore()
  // Listar todos os users com llmConfig
  const usersSnap = await db.collection('users').get()
  const out: Array<{ uid: string; displayName: string; email: string; config: any }> = []
  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data() as any
    if (data.llmConfig) {
      out.push({
        uid: userDoc.id,
        displayName: data.displayName ?? '',
        email: data.email ?? '',
        config: { ...data.llmConfig, apiKey: data.llmConfig.apiKey ? maskKey(data.llmConfig.apiKey) : '' },
      })
    }
  }
  return out
})

// ── Util ────────────────────────────────────────────────────────────────

function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '••••'
  return key.slice(0, 4) + '••••••••' + key.slice(-4)
}
