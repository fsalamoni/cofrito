/**
 * Global LLM secret — isola a apiKey global do documento legível pelo cliente.
 *
 * PROBLEMA: `admin-config/llm` é legível por qualquer usuário logado (regra do
 * Firestore, necessária para detectar se há um LLM global). Guardar a apiKey ali
 * expõe o segredo a todos.
 *
 * SOLUÇÃO: o doc principal `admin-config/llm` guarda só provider/model/params
 * (sem apiKey). A apiKey vai para `admin-config/llm-secret`, cujo READ é
 * restrito ao admin master nas regras.
 *
 * Retrocompatível: os leitores de servidor tentam o doc secreto e, se não houver,
 * caem na chave legada ainda presente no doc principal — nada quebra até o admin
 * re-salvar a configuração.
 */
import { logger } from 'firebase-functions'
import { getFirestore, FieldValue } from './firestore'

export const GLOBAL_LLM_PATH = 'admin-config/llm'
export const GLOBAL_LLM_SECRET_PATH = 'admin-config/llm-secret'

/** true se a chave está ausente/vazia/mascarada (não deve sobrescrever a salva). */
export function isMaskedKey(v: unknown): boolean {
  return typeof v !== 'string' || v === '' || v.includes('•')
}

/**
 * Lê a apiKey global do doc secreto (master-only). Fallback: chave legada
 * fornecida (do doc principal antigo). Nunca lança.
 */
export async function readGlobalApiKey(legacyKey?: string): Promise<string> {
  try {
    const snap = await getFirestore().doc(GLOBAL_LLM_SECRET_PATH).get()
    if (snap.exists) {
      const k = (snap.data() as Record<string, unknown>)?.apiKey
      if (typeof k === 'string' && k) return k
    }
  } catch (err) {
    logger.warn('readGlobalApiKey: falha ao ler secret', { err: (err as Error).message })
  }
  return legacyKey ?? ''
}

/** Grava a apiKey global no doc secreto (master-only). */
export async function writeGlobalApiKey(apiKey: string, uid: string): Promise<void> {
  await getFirestore().doc(GLOBAL_LLM_SECRET_PATH).set(
    { apiKey, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid },
    { merge: false },
  )
}

/** Remove o doc secreto (ao remover a config global). Nunca lança. */
export async function deleteGlobalApiKey(): Promise<void> {
  try {
    await getFirestore().doc(GLOBAL_LLM_SECRET_PATH).delete()
  } catch {
    /* ignore */
  }
}
