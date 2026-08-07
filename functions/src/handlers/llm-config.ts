/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Handlers de LLM Config — user + admin master.
 *
 * User: get/set/delete em `users/{uid}/llmConfig`
 * Master: get/set/delete em `admin-config/llm` (global, esconde user)
 *
 * O backend NUNCA devolve a API key ao cliente (criptografada no client-side,
 * e o backend confia no que o cliente envia — o Firestore Rules protege o doc).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { assertAdminMaster } from '../middleware/auth'
import { listModelsForProvider, type LLMConfigLike, type LLMProvider } from '../services/llm-providers'

// ── USER: get/set/delete config pessoal ───────────────────────────────────

export const getLLMConfig = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  const db = getFirestore()
  const snap = await db.doc(`users/${request.auth.uid}/llmConfig`).get()
  if (!snap.exists) return null
  const data = snap.data() as any
  // Nunca devolve a API key completa
  return {
    provider: data.provider,
    model: data.model,
    baseUrl: data.baseUrl,
    temperature: data.temperature,
    maxTokens: data.maxTokens,
    scope: 'user',
    hasApiKey: !!data.apiKey,
    apiKeyMasked: data.apiKey ? maskKey(data.apiKey) : '',
    updatedAt: data.updatedAt,
  }
})

export const setLLMConfig = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  const cfg = request.data as LLMConfigLike
  if (!cfg || !cfg.provider || !cfg.model) {
    throw new HttpsError('invalid-argument', 'provider e model são obrigatórios')
  }
  const db = getFirestore()
  await db.doc(`users/${request.auth.uid}/llmConfig`).set(
    {
      ...cfg,
      scope: 'user',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  return { ok: true }
})

export const deleteLLMConfig = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  const db = getFirestore()
  await db.doc(`users/${request.auth.uid}/llmConfig`).delete()
  return { ok: true }
})

// ── MASTER ADMIN: config global ──────────────────────────────────────────

export const adminGetGlobalLLM = onCall(async (request) => {
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

export const adminSetGlobalLLM = onCall(async (request) => {
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

export const listLLMModels = onCall(async (request) => {
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

export const adminListAdmins = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  await assertAdminMaster(request.auth.uid)
  const db = getFirestore()
  const snap = await db.collection('admins').orderBy('grantedAt', 'desc').get()
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
})

export const adminGrantAdmin = onCall(async (request) => {
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

export const adminRevokeAdmin = onCall(async (request) => {
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

export const adminListUserLLM = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  await assertAdminMaster(request.auth.uid)
  const db = getFirestore()
  // Listar todos os users com llmConfig
  const usersSnap = await db.collection('users').get()
  const out: Array<{ uid: string; displayName: string; email: string; config: any }> = []
  for (const userDoc of usersSnap.docs) {
    const llmSnap = await db.doc(`users/${userDoc.id}/llmConfig`).get()
    if (llmSnap.exists) {
      const userData = userDoc.data() as any
      out.push({
        uid: userDoc.id,
        displayName: userData.displayName ?? '',
        email: userData.email ?? '',
        config: { ...llmSnap.data(), apiKey: llmSnap.data()?.apiKey ? maskKey(llmSnap.data()!.apiKey) : '' },
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
