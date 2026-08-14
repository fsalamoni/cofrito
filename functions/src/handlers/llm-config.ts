/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Handlers de LLM Config — user + admin master.
 *
 * Storage:
 *  - user: campo `llmConfig` em `users/{uid}` (subcollection path com 3 segments é inválido)
 *  - master: doc `admin-config/llm` (global, esconde user)
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from '../services/firestore'
import { saveConfigDoc, loadConfigDoc } from '../services/config-store'
import { assertAdminMaster } from '../middleware/auth'
import { listModelsForProvider, type LLMConfigLike, type LLMProvider } from '../services/llm-providers'
import { readGlobalApiKey, writeGlobalApiKey, deleteGlobalApiKey, isMaskedKey } from '../services/global-llm'

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
  const loaded = await loadConfigDoc<any>('admin-config/llm', 'llm-global')
  if (!loaded) return null
  const data = loaded.data
  // Chave: doc secreto (master-only); fallback à chave legada no doc principal.
  const apiKey = await readGlobalApiKey(data.apiKey)
  return {
    provider: data.provider,
    model: data.model,
    baseUrl: data.baseUrl,
    temperature: typeof data.temperature === 'number' ? data.temperature : undefined,
    maxTokens: typeof data.maxTokens === 'number' ? data.maxTokens : undefined,
    scope: 'global',
    // "active": há um provider+model+apiKey válidos gravados
    active: !!(data.provider && data.model && apiKey),
    hasApiKey: !!apiKey,
    apiKeyMasked: apiKey ? maskKey(apiKey) : '',
    updatedAt: loaded.updatedAt,
    updatedBy: loaded.updatedBy,
  }
})

export const adminSetGlobalLLM = onCall({ cors: true, enforceAppCheck: false },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
  await assertAdminMaster(request.auth.uid)
  const cfg = request.data as LLMConfigLike | null
  if (!cfg) {
    await getFirestore().doc('admin-config/llm').delete()
    await deleteGlobalApiKey()
    return { ok: true, removed: true }
  }
  // Preservar a chave quando vier vazia/mascarada (não sobrescrever a salva).
  let apiKey = cfg.apiKey
  if (isMaskedKey(apiKey)) {
    apiKey = await readGlobalApiKey()
  }
  // Doc principal SEM a apiKey (legível por signed-in só p/ detectar/exibir provider/model).
  const rest: Record<string, unknown> = { ...cfg }
  delete rest.apiKey
  const result = await saveConfigDoc(
    { ...rest, scope: 'global' },
    {
      uid: request.auth!.uid,
      path: 'admin-config/llm',
      tag: 'llm-global',
    },
  )
  // Chave no doc secreto (master-only nas regras).
  await writeGlobalApiKey(apiKey || '', request.auth!.uid)
  return { ok: true, savedAt: result.savedAt }
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
