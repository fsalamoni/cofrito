/**
 * URL publica de download de um objeto do Storage.
 *
 * Usa o TOKEN de download do Firebase Storage (firebaseStorageDownloadTokens)
 * em vez de signed URL — assim NAO exige a permissao iam.serviceAccounts.signBlob
 * (que a conta de servico padrao das Cloud Functions nao tem). A URL resultante
 * abre/baixa o arquivo real em qualquer navegador, em nova aba.
 */
import { randomUUID } from 'node:crypto'

/**
 * Gera (ou reaproveita) a URL tokenizada de download para um storagePath.
 * Retorna null se nao houver caminho ou se o arquivo nao existir.
 */
export async function getPublicDownloadUrl(storagePath: string | undefined | null): Promise<string | null> {
  if (!storagePath) return null
  try {
    const { getStorage } = await import('./storage')
    const bucket = getStorage().bucket()
    const file = bucket.file(storagePath)
    const [exists] = await file.exists()
    if (!exists) return null
    const [meta] = await file.getMetadata()
    const existing = (meta.metadata || {}) as Record<string, string>
    let token = existing.firebaseStorageDownloadTokens || ''
    if (!token) {
      token = randomUUID()
      await file.setMetadata({ metadata: { ...existing, firebaseStorageDownloadTokens: token } })
    }
    const encodedPath = encodeURIComponent(storagePath)
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`
  } catch {
    return null
  }
}
