/**
 * Admin Debug Public - endpoint SEM auth para diagnostico.
 * USAR APENAS EM DEV. Em prod, deve ser protegido.
 *
 * - adminDebugAcervoPublic: retorna estado REAL de todos os docs do corpus
 *   (status, analysisError, llm config, env vars)
 */
import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from '../services/firestore'
import { resolveLLMConfigForAnalysis } from './admin-documents'

export const adminDebugAcervoPublic = onRequest(
  { cors: true, region: 'southamerica-east1' },
  async (_req, res) => {
    try {
      const db = getFirestore()
      const snap = await db.collection('corpus').limit(50).get()

      const statusCount: Record<string, number> = {}
      const sampleErrors: Array<{ docId: string; error: string; status: string }> = []
      const docs: Array<Record<string, unknown>> = []

      snap.docs.forEach((d) => {
        const data = d.data()
        const status = data.status || '(sem status)'
        statusCount[status] = (statusCount[status] || 0) + 1
        if (data.analysisError && sampleErrors.length < 5) {
          sampleErrors.push({ docId: d.id, error: String(data.analysisError).slice(0, 300), status: data.status })
        }
        docs.push({
          id: d.id,
          fileName: data.fileName,
          status: data.status,
          hasText: !!((data.textOriginal as string) || (data.textContent as string)),
          textLength: (((data.textOriginal as string) || '').length) + (((data.textContent as string) || '').length),
          hasTextContent: !!data.textContent,
          textContentLength: (data.textContent as string || '').length,
          hasClassification: !!data.classification,
          classificationTipo: data.classification?.tipoDocumento || null,
          hasEmenta: !!data.ementa,
          ementaTipo: data.ementa?.tipo || null,
          hasKeyPoints: !!data.keyPoints,
          keyPointsCount: (data.keyPoints?.items as string[])?.length || 0,
          analysisError: data.analysisError ? String(data.analysisError).slice(0, 200) : null,
          analysisStartedAt: data.analysisStartedAt,
          analysisCompletedAt: data.analysisCompletedAt,
        })
      })

      // Tentar resolver LLM config
      const llmConfig = await resolveLLMConfigForAnalysis('debug')

      const env = {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'set (length=' + process.env.GEMINI_API_KEY.length + ')' : 'NOT SET',
        GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash (default)',
      }

      res.json({
        total: docs.length,
        statusCount,
        sampleErrors,
        llmConfig: llmConfig ? {
          provider: llmConfig.provider,
          model: llmConfig.model,
          hasApiKey: !!llmConfig.apiKey,
          apiKeyLength: llmConfig.apiKey?.length || 0,
        } : null,
        env,
        docs: docs.slice(0, 20),
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      res.status(500).json({ error: String((err as Error).message) })
    }
  },
)
