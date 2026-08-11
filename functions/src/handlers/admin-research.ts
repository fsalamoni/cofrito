/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-imports */
/**
 * Admin: configurações globais de pesquisa.
 *
 * Armazenadas em:
 *  - admin-config/research  → ResearchConfig
 *  - admin-config/web-search → WebSearchConfig
 *  - admin-config/intranet   → IntranetConfig
 *
 * Operações:
 *  - getResearchConfig / saveResearchConfig
 *  - getWebSearchConfig / saveWebSearchConfig / testWebSearch
 *  - getIntranetConfig / saveIntranetConfig / testIntranet
 *
 * Apenas admin master pode ler/escrever (exceto get público para o user ver status).
 */

import { HttpsError, onCall, onRequest, type Request } from 'firebase-functions/v2/https'
import { getFirestore } from '../services/firestore'
import { logger } from 'firebase-functions'
import {
  DEFAULT_RESEARCH_CONFIG,
  DEFAULT_INTRANET_CONFIG,
  type ResearchConfig,
  type WebSearchConfig,
  type IntranetConfig,
} from '../agents/types'

function getDb() {
  return getFirestore()
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function isAdminMaster(uid: string): Promise<boolean> {
  const snap = await getDb().doc(`admins/${uid}`).get()
  if (!snap.exists) return false
  const data = snap.data() as any
  return data?.role === 'master' && data?.active !== false
}

function requireAdminMaster(uid: string | undefined): asserts uid is string {
  if (!uid) throw new HttpsError('unauthenticated', 'Faça login')
}

// ── Research ───────────────────────────────────────────────────────────────

export const getResearchConfig = onCall({ cors: true, enforceAppCheck: false }, async (req): Promise<ResearchConfig | null> => {
  requireAdminMaster(req.auth?.uid)
  if (!(await isAdminMaster(req.auth!.uid))) {
    throw new HttpsError('permission-denied', 'Apenas admin master')
  }
  const snap = await getDb().doc('admin-config/research').get()
  if (!snap.exists) return null
  return snap.data() as ResearchConfig
})

export const saveResearchConfig = onCall({ cors: true, enforceAppCheck: false }, async (req): Promise<{ ok: true; savedAt: string }> => {
  requireAdminMaster(req.auth?.uid)
  if (!(await isAdminMaster(req.auth!.uid))) {
    throw new HttpsError('permission-denied', 'Apenas admin master')
  }
  const cfg = req.data
  if (!cfg || typeof cfg !== 'object') {
    throw new HttpsError('invalid-argument', 'Config inválida')
  }
  // Validar
  if (cfg.maxSourcesPerPoint < 1 || cfg.maxSourcesPerPoint > 20) {
    throw new HttpsError('invalid-argument', 'maxSourcesPerPoint deve estar entre 1 e 20')
  }
  if (cfg.maxTotalSources < cfg.maxSourcesPerPoint) {
    throw new HttpsError('invalid-argument', 'maxTotalSources deve ser ≥ maxSourcesPerPoint')
  }
  if (cfg.preferRecentDays < 0 || cfg.preferRecentDays > 3650) {
    throw new HttpsError('invalid-argument', 'preferRecentDays deve estar entre 0 e 3650 (10 anos)')
  }
  if (cfg.minRelevanceScore < 0 || cfg.minRelevanceScore > 1) {
    throw new HttpsError('invalid-argument', 'minRelevanceScore deve estar entre 0 e 1')
  }
  const savedAt = new Date().toISOString()
  await getDb().doc('admin-config/research').set({
    ...cfg,
    updatedAt: savedAt,
    updatedBy: req.auth!.uid,
  })
  return { ok: true, savedAt }
})

// ── Web Search ─────────────────────────────────────────────────────────────

export const getWebSearchConfig = onCall({ cors: true, enforceAppCheck: false }, async (req): Promise<WebSearchConfig | null> => {
  requireAdminMaster(req.auth?.uid)
  if (!(await isAdminMaster(req.auth!.uid))) {
    throw new HttpsError('permission-denied', 'Apenas admin master')
  }
  const snap = await getDb().doc('admin-config/web-search').get()
  if (!snap.exists) return null
  // NUNCA retornar apiKey em texto claro para o frontend — usar campo hasApiKey
  const data = snap.data() as WebSearchConfig
  return { ...data, apiKey: data.apiKey ? '••••••' : undefined, _hasApiKey: !!data.apiKey } as any
})

export const saveWebSearchConfig = onCall({ cors: true, enforceAppCheck: false }, async (req): Promise<{ ok: true; savedAt: string }> => {
  requireAdminMaster(req.auth?.uid)
  if (!(await isAdminMaster(req.auth!.uid))) {
    throw new HttpsError('permission-denied', 'Apenas admin master')
  }
  const cfg = req.data
  if (!cfg || typeof cfg !== 'object') {
    throw new HttpsError('invalid-argument', 'Config inválida')
  }
  const validProviders = ['tavily', 'serper', 'brave', 'perplexity', 'mprs-intranet']
  if (!validProviders.includes(cfg.provider)) {
    throw new HttpsError('invalid-argument', `provider inválido: ${cfg.provider}`)
  }
  // Se apiKey vier com '••••' (mascarada), manter a que já está salva
  let finalApiKey = cfg.apiKey
  if (cfg.apiKey === '••••••' || !cfg.apiKey) {
    const snap = await getDb().doc('admin-config/web-search').get()
    if (snap.exists) {
      finalApiKey = (snap.data() as WebSearchConfig).apiKey
    } else {
      finalApiKey = ''
    }
  }
  const savedAt = new Date().toISOString()
  await getDb().doc('admin-config/web-search').set({
    ...cfg,
    apiKey: finalApiKey,
    updatedAt: savedAt,
    updatedBy: req.auth!.uid,
  })
  return { ok: true, savedAt }
})

/**
 * Testa a conexão com o provider de web search configurado.
 * Faz uma query dummy e devolve o tempo de resposta + número de resultados.
 */
export const testWebSearch = onCall({ cors: true, enforceAppCheck: false }, async (req): Promise<{ ok: boolean; resultCount: number; latencyMs: number; sample?: unknown; error?: string }> => {
  requireAdminMaster(req.auth?.uid)
  if (!(await isAdminMaster(req.auth!.uid))) {
    throw new HttpsError('permission-denied', 'Apenas admin master')
  }
  const cfgSnap = await getDb().doc('admin-config/web-search').get()
  if (!cfgSnap.exists) {
    return { ok: false, resultCount: 0, latencyMs: 0, error: 'Web search não configurado' }
  }
  const cfg = cfgSnap.data() as WebSearchConfig
  if (!cfg.apiKey && cfg.provider !== 'mprs-intranet') {
    return { ok: false, resultCount: 0, latencyMs: 0, error: 'API key não configurada' }
  }
  const query = req.data?.query || 'teste de busca Cofrito'
  const start = Date.now()
  try {
    // Import dinâmico para evitar overhead
    const { runResearcherWeb } = await import('../agents/researcher-web')
    const points = [{ id: 't1', query, keywords: query.split(/\s+/), priority: 'high' as const, expectedSourceTypes: [], prefersRecent: true, recencyMonths: 12 }]
    // Montar intranet config vazia para o teste
    const intranetSnap = await getDb().doc('admin-config/intranet').get()
    const intranet = (intranetSnap.exists ? intranetSnap.data() : DEFAULT_INTRANET_CONFIG) as IntranetConfig
    const sources = await runResearcherWeb({
      points: points as any,
      webConfig: cfg,
      intranetConfig: intranet,
      allowExternal: true,
      logger: {
        info: (m, x) => logger.info(m, x),
        warn: (m, x) => logger.warn(m, x),
        error: (m, x) => logger.error(m, x),
      },
    })
    return { ok: true, resultCount: sources.length, latencyMs: Date.now() - start, sample: sources[0] }
  } catch (err: any) {
    return { ok: false, resultCount: 0, latencyMs: Date.now() - start, error: err?.message ?? String(err) }
  }
})

// ── Intranet ───────────────────────────────────────────────────────────────

export const getIntranetConfig = onCall({ cors: true, enforceAppCheck: false }, async (req): Promise<IntranetConfig | null> => {
  requireAdminMaster(req.auth?.uid)
  if (!(await isAdminMaster(req.auth!.uid))) {
    throw new HttpsError('permission-denied', 'Apenas admin master')
  }
  const snap = await getDb().doc('admin-config/intranet').get()
  if (!snap.exists) return null
  const data = snap.data() as IntranetConfig
  // Mascarar senha
  return { ...data, password: data.password ? '••••••' : undefined, _hasPassword: !!data.password } as any
})

export const saveIntranetConfig = onCall({ cors: true, enforceAppCheck: false }, async (req): Promise<{ ok: true; savedAt: string }> => {
  requireAdminMaster(req.auth?.uid)
  if (!(await isAdminMaster(req.auth!.uid))) {
    throw new HttpsError('permission-denied', 'Apenas admin master')
  }
  const cfg = req.data
  if (!cfg || typeof cfg !== 'object') {
    throw new HttpsError('invalid-argument', 'Config inválida')
  }
  if (cfg.enabled && !cfg.baseUrl) {
    throw new HttpsError('invalid-argument', 'baseUrl é obrigatório quando enabled=true')
  }
  if (cfg.baseUrl && !/^https?:\/\//i.test(cfg.baseUrl)) {
    throw new HttpsError('invalid-argument', 'baseUrl deve começar com http:// ou https://')
  }
  // Preservar senha se vier mascarada
  let finalPassword = cfg.password
  if (cfg.password === '••••••' || !cfg.password) {
    const snap = await getDb().doc('admin-config/intranet').get()
    if (snap.exists) {
      finalPassword = (snap.data() as IntranetConfig).password
    } else {
      finalPassword = ''
    }
  }
  const savedAt = new Date().toISOString()
  await getDb().doc('admin-config/intranet').set({
    ...cfg,
    password: finalPassword,
    updatedAt: savedAt,
    updatedBy: req.auth!.uid,
  })
  return { ok: true, savedAt }
})

/**
 * Testa a autenticação e o acesso à intranet MPRS.
 */
export const testIntranet = onCall({ cors: true, enforceAppCheck: false }, async (req): Promise<{ ok: boolean; latencyMs: number; status?: number; error?: string; sample?: unknown }> => {
  requireAdminMaster(req.auth?.uid)
  if (!(await isAdminMaster(req.auth!.uid))) {
    throw new HttpsError('permission-denied', 'Apenas admin master')
  }
  const snap = await getDb().doc('admin-config/intranet').get()
  if (!snap.exists) {
    return { ok: false, latencyMs: 0, error: 'Intranet não configurada' }
  }
  const cfg = snap.data() as IntranetConfig
  if (!cfg.enabled || !cfg.baseUrl) {
    return { ok: false, latencyMs: 0, error: 'Intranet desabilitada' }
  }
  const start = Date.now()
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Cofrito-Test/1.0',
      ...(cfg.customHeaders || {}),
    }
    if (cfg.cookieName && cfg.password) {
      headers['Cookie'] = `${cfg.cookieName}=${cfg.password}`
    }
    // Tentar login
    if (cfg.authMethod === 'form' && cfg.username && cfg.password && cfg.loginPath) {
      const loginRes = await fetch(`${cfg.baseUrl}${cfg.loginPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
        body: new URLSearchParams({ username: cfg.username, password: cfg.password }).toString(),
        redirect: 'manual',
      })
      const setCookie = loginRes.headers.get('set-cookie')
      if (setCookie) {
        const m = setCookie.match(/([^=]+)=([^;]+)/)
        if (m) headers['Cookie'] = `${m[1]}=${m[2]}`
      }
    }
    // Acessar raiz
    const res = await fetch(cfg.baseUrl, { headers, redirect: 'manual' })
    const latencyMs = Date.now() - start
    return {
      ok: res.status < 500,
      latencyMs,
      status: res.status,
      sample: { finalStatus: res.status, redirectedTo: res.headers.get('location') },
    }
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err?.message ?? String(err) }
  }
})

/**
 * Endpoint público (status only) — para o chat saber se há config ativa.
 */
export const getPublicResearchStatus = onRequest({ cors: true }, async (_req: Request, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  try {
    // Usar getFirestore() DIRETAMENTE (não via getDb() wrapper) para garantir
    // que o admin SDK pega a app default do runtime do Firebase Functions
    const db = getFirestore()
    const research = await db.doc('admin-config/research').get()
    const web = await db.doc('admin-config/web-search').get()
    const intranet = await db.doc('admin-config/intranet').get()
    res.json({
      research: research.exists ? research.data() : DEFAULT_RESEARCH_CONFIG,
      webSearchEnabled: web.exists && (web.data() as WebSearchConfig).enabled,
      webSearchProvider: web.exists ? (web.data() as WebSearchConfig).provider : null,
      intranetEnabled: intranet.exists && (intranet.data() as IntranetConfig).enabled,
    })
  } catch (err) {
    const e = err as { message?: string }
    logger.error('getPublicResearchStatus failed', { err: e?.message })
    res.status(500).json({ error: e?.message ?? 'Internal error' })
  }
})
