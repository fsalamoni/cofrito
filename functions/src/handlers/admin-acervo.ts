/**
 * Admin Acervo Pipeline — configuracao do pipeline de analise automatica.
 *
 * Permite ao admin master:
 *  - Ativar/desativar cada agente (classificador, ementa, keyPoints)
 *  - Override do modelo LLM (opcional, default: usa o LLM global)
 *  - Ativar/desativar rerank com LLM no researcher-internal (Camada 3)
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'

import { saveConfigDoc, loadConfigDoc } from '../services/config-store'
import { assertAdminMaster } from '../middleware/auth'

export interface AcervoPipelineConfig {
  // Quais agentes estao ativos
  enableClassifier: boolean
  enableEmenta: boolean
  enableKeyPoints: boolean
  // Se TRUE: rerank com LLM no researcher-internal (Camada 3)
  enableLlmRerank: boolean
  // Override de modelo (opcional). Se null: usa o LLM global carregado.
  llmOverride: {
    provider?: 'openrouter' | 'google' | 'openai' | 'anthropic' | 'custom'
    model?: string
    apiKey?: string
  } | null
  // Limiar de ambiguidade para ativar rerank (0-1). Default 0.15
  rerankAmbiguityThreshold: number
}

export const DEFAULT_ACERVO_PIPELINE_CONFIG: AcervoPipelineConfig = {
  enableClassifier: true,
  enableEmenta: true,
  enableKeyPoints: true,
  enableLlmRerank: true,
  llmOverride: null,
  rerankAmbiguityThreshold: 0.15,
}

export const getAcervoPipelineConfig = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const config = await loadConfigDoc<AcervoPipelineConfig>(
      'admin-config/acervo-pipeline',
      'acervo-pipeline',
    )
    return config?.data ?? DEFAULT_ACERVO_PIPELINE_CONFIG
  },
)

export const saveAcervoPipelineConfig = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const input = (request.data || {}) as Partial<AcervoPipelineConfig>
    // Validacao basica
    const merged: AcervoPipelineConfig = {
      enableClassifier: input.enableClassifier !== false,
      enableEmenta: input.enableEmenta !== false,
      enableKeyPoints: input.enableKeyPoints !== false,
      enableLlmRerank: input.enableLlmRerank !== false,
      llmOverride: input.llmOverride || null,
      rerankAmbiguityThreshold: typeof input.rerankAmbiguityThreshold === 'number'
        ? Math.max(0, Math.min(1, input.rerankAmbiguityThreshold))
        : 0.15,
    }
    await saveConfigDoc(merged, { path: 'admin-config/acervo-pipeline', tag: 'acervo-pipeline', uid: request.auth.uid })
    logger.info('acervo-pipeline.saved', { uid: request.auth.uid, config: merged })
    return { ok: true, config: merged }
  },
)

// ── Forcar insercao do corpus seed (Sobre o Cofrito, Sobre o CAOCIPP, etc) ─

export const adminSeedCorpus = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Faça login.')
    await assertAdminMaster(request.auth.uid)
    const { ensureSeedCorpus } = await import('../services/seed-corpus')
    const result = await ensureSeedCorpus()
    logger.info('adminSeedCorpus.done', { uid: request.auth.uid, ...result })
    return { ok: true, ...result }
  },
)
