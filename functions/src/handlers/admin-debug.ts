/**
 * Admin Debug — endpoint de diagnostico do acervo.
 *
 * - adminDebugAcervo: retorna o estado REAL de todos os docs do acervo,
 *   incluindo o status, analysisError, e se tem LLM config disponivel.
 *   NAO bloqueia com auth (debug). Em producao real, deveria ter.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from '../services/firestore'
import { resolveLLMConfigForAnalysis } from './admin-documents'

export const adminDebugAcervo = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    // Forcar auth de admin master
    const { assertAdminMaster } = await import('../middleware/auth')
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)

    const db = getFirestore()
    const snap = await db.collection('corpus').limit(500).get()

    // Status distribution
    const statusCount: Record<string, number> = {}
    const sampleErrors: Array<{ docId: string; error: string; status: string }> = []

    const docs: Array<Record<string, unknown>> = []
    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>
      const status = String(data.status ?? '(sem status)')
      statusCount[status] = (statusCount[status] || 0) + 1

      // Coletar amostras de erros
      if (data.analysisError !== undefined && data.analysisError !== null && sampleErrors.length < 3) {
        sampleErrors.push({ docId: d.id, error: String(data.analysisError ?? ''), status: String(data.status ?? '') })
      }

      docs.push({
        id: d.id,
        fileName: data.fileName,
        status: data.status,
        hasText: !!((data.textOriginal as string) || (data.textContent as string)),
        textLength: ((data.textOriginal as string) || (data.textContent as string) || '').length,
        hasClassification: !!data.classification,
        hasEmenta: !!data.ementa,
        hasKeyPoints: !!data.keyPoints,
        analysisError: data.analysisError,
        analysisStartedAt: data.analysisStartedAt,
        analysisCompletedAt: data.analysisCompletedAt,
        analyzedAt: data.analyzedAt,
      })
    })

    // LLM config
    const llmConfig = await resolveLLMConfigForAnalysis(request.auth.uid)

    // Env vars
    const env = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'set (length=' + process.env.GEMINI_API_KEY.length + ')' : 'NOT SET',
      GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash (default)',
    }

    return {
      total: docs.length,
      statusCount,
      sampleErrors,
      llmConfig: llmConfig ? {
        provider: llmConfig.provider,
        model: llmConfig.model,
        hasApiKey: !!llmConfig.apiKey,
        apiKeyLength: llmConfig.apiKey ? llmConfig.apiKey.length : 0,
      } : null,
      env,
      docs: docs.slice(0, 30),  // amostra de 30
      timestamp: new Date().toISOString(),
    }
  },
)
