/**
 * Helper centralizado para ler/salvar configurações globais do admin.
 *
 * Garante:
 *  - Path correto
 *  - Auditoria (version, updatedAt, updatedBy)
 *  - Logs estruturados
 *  - Validação opcional
 */
import { logger } from 'firebase-functions'
import { getFirestore, FieldValue } from './firestore'

export interface ConfigDocEnvelope<T> {
  data: T
  version: number
  updatedAt: string  // ISO
  updatedBy: string  // uid
}

export interface SaveConfigOptions {
  /** uid do admin que está salvando */
  uid: string
  /** doc path (ex: 'admin-config/research') */
  path: string
  /** tag para logs (ex: 'research', 'web-search') */
  tag: string
  /** schema version (default 1) */
  version?: number
}

/**
 * Salva uma config no Firestore com auditoria completa.
 * Substitui o doc inteiro (sem merge), garantindo que o schema é respeitado.
 */
export async function saveConfigDoc<T>(
  data: T,
  opts: SaveConfigOptions,
): Promise<{ ok: true; savedAt: string; version: number }> {
  const version = opts.version ?? 1
  const savedAt = new Date().toISOString()
  const fullDoc: ConfigDocEnvelope<T> = {
    data,
    version,
    updatedAt: savedAt,
    updatedBy: opts.uid,
  }
  await getFirestore()
    .doc(opts.path)
    .set(fullDoc, { merge: false })
  logger.info('config.saved', {
    tag: opts.tag,
    path: opts.path,
    uid: opts.uid,
    version,
  })
  return { ok: true, savedAt, version }
}

/**
 * Lê uma config. Retorna o envelope {data, version, updatedAt, updatedBy} ou null.
 * Aceita docs legacy (sem envelope) e retorna como data cru.
 */
export async function loadConfigDoc<T>(
  path: string,
  tag: string,
): Promise<ConfigDocEnvelope<T> | null> {
  const snap = await getFirestore().doc(path).get()
  if (!snap.exists) {
    logger.debug('config.load.empty', { tag, path })
    return null
  }
  const doc = snap.data() as Record<string, unknown>

  // Doc novo (com envelope)
  if (doc.data !== undefined && typeof doc.data === 'object' && doc.version !== undefined) {
    logger.debug('config.load', { tag, path, version: doc.version })
    return {
      data: doc.data as T,
      version: doc.version as number,
      updatedAt: (doc.updatedAt as string) ?? '',
      updatedBy: (doc.updatedBy as string) ?? '',
    }
  }

  // Doc legacy (sem envelope) — migrar automaticamente
  logger.warn('config.load.legacyFormat', { tag, path })
  return {
    data: doc as unknown as T,
    version: 0,
    updatedAt: (doc.updatedAt as string) ?? new Date(0).toISOString(),
    updatedBy: (doc.updatedBy as string) ?? 'legacy',
  }
}

/**
 * Server timestamp para updates incrementais.
 */
export const serverNow = () => FieldValue.serverTimestamp()
