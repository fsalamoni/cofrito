/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-imports */
/**
 * Chat v2 — usa o LLM config do user/master.
 *
 * Ordem de prioridade:
 *  1. LLM global (admin-config/llm) — se existir, TODOS usam ele
 *  2. LLM pessoal (users/{uid}/llmConfig) — se existir, só esse user usa
 *  3. Fallback: GEMINI_API_KEY do ambiente (legado, opcional)
 *  4. Stub mode (sem API key)
 */
import { onCall, HttpsError } from

logger.info("Function module loaded");
 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { z } from 'zod'
import { getFirestore } from 'firebase-admin/firestore'

import { retrieveRelevantChunks } from '../services/retrieval'
import { type LLMConfigLike } from '../services/llm-providers'
import { buildSystemPrompt } from '../prompts/system'
import { saveMessage, getRecentHistory } from '../services/history'
import { checkScopeGuardrail } from '../services/guardrails'
import { getUserProfile } from '../services/profile'
import { logAnalytics } from '../services/analytics'
import { filterPII } from '../services/anonymizer'

const ChatRequestSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(2000),
  allowExternal: z.boolean().optional().default(false),
  requestLegalAnalysis: z.boolean().optional().default(false),
  effort: z.enum(['rapido', 'padrao', 'profundo']).optional().default('padrao'),
  context: z.object({
    documentId: z.string().optional(),
    intent: z.string().optional(),
  }).optional(),
})

export const chatV2 = onCall(
  { cors: true, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para conversar com o Cofrito.')
    }
    const userId = request.auth.uid
    const parsed = ChatRequestSchema.safeParse(request.data)
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Mensagem inválida.')
    }
    const { conversationId, message, allowExternal, requestLegalAnalysis, effort, context } = parsed.data
    const start = Date.now()

    try {
      // 1. Anonimiza
      const sanitizedText = filterPII(message).text

      // 2. Histórico
      const recentHistory = await getRecentHistory(userId, conversationId, 6); logger.debug("history.size", { size: recentHistory.length })

      // 3. Retrieval
      const chunks = await retrieveRelevantChunks(sanitizedText, { topK: 8, minSimilarity: 0.55 })

      // 4. Guardrail
      const scopeCheck = checkScopeGuardrail(sanitizedText, chunks)
      if (!scopeCheck.inScope) {
        const messageId = await saveMessage(userId, conversationId ?? '', 'assistant', scopeCheck.refusalMessage ?? 'Fora do escopo.', [], 0)
        await saveMessage(userId, conversationId ?? '', 'user', message)
        logAnalytics('chat', { userId, intent: 'out_of_scope', sourcesCount: 0, latencyMs: Date.now() - start, guardrailTriggered: scopeCheck.reason, allowExternal })
        return {
          conversationId: messageId.conversationId,
          messageId: messageId.messageId,
          reply: scopeCheck.refusalMessage,
          sources: [],
          intent: scopeCheck.reason || 'out_of_scope',
          inScope: false,
          allowExternal,
          feedbackToken: messageId.messageId,
          suggestions: ['O que é o CAOCIPP?', 'Tese sobre improbidade'],
          actions: [{ type: 'open_consulta', label: 'Abrir consulta formal' }],
          usage: { prompt: 0, completion: 0, total: 0 },
          latencyMs: Date.now() - start,
        }
      }

      // 5. Perfil
      const userProfile = await getUserProfile(userId)
      const profile = {
        displayName: userProfile?.displayName ?? 'Promotor',
        inferredAreas: userProfile?.areasInferidas ?? [],
      }

      // 6. Resolver LLM config
      const db = getFirestore()
      const globalSnap = await db.doc('admin-config/llm').get()
      const userSnap = await db.doc(`users/${userId}/llmConfig`).get()
      const globalCfg = globalSnap.exists ? (globalSnap.data() as LLMConfigLike) : null
      const userCfg = userSnap.exists ? (userSnap.data() as LLMConfigLike) : null
      const effectiveConfig: LLMConfigLike | null = globalCfg || userCfg

      // OpenRouter é o PROVIDOR PRINCIPAL E DE FALLBACK da plataforma.
      // Hierarquia: user config > global config > OPENROUTER_API_KEY > GEMINI_API_KEY > stub
      let provider: string
      let model: string
      let configToUse: LLMConfigLike

      if (effectiveConfig) {
        provider = effectiveConfig.provider
        model = effectiveConfig.model
        configToUse = effectiveConfig
      } else if (process.env.OPENROUTER_API_KEY) {
        provider = 'openrouter'
        model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
        configToUse = {
          provider: 'openrouter',
          model,
          apiKey: process.env.OPENROUTER_API_KEY,
        }
      } else if (process.env.GEMINI_API_KEY) {
        provider = 'google'
        model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
        configToUse = {
          provider: 'google',
          model,
          apiKey: process.env.GEMINI_API_KEY,
        }
      } else {
        // Stub mode final (sem nenhuma key configurada)
        provider = 'google'
        model = 'gemini-2.5-flash'
        configToUse = { provider: 'google', model, apiKey: '' }
      }

      // 7. System prompt
      const systemPrompt = buildSystemPrompt({
        userName: profile.displayName,
        userAreas: profile.inferredAreas,
        allowExternal,
        hasCorpusChunks: chunks.length > 0,
      })

      // 8. Carregar configs de pesquisa (research, web-search, intranet)
      const [researchSnap, webSearchSnap, intranetSnap] = await Promise.all([
        db.doc('admin-config/research').get(),
        db.doc('admin-config/web-search').get(),
        db.doc('admin-config/intranet').get(),
      ])
      const typesMod = await import('../agents/types')
      const researchConfig: import('../agents/types').ResearchConfig = researchSnap.exists
        ? { ...typesMod.DEFAULT_RESEARCH_CONFIG, ...researchSnap.data() }
        : typesMod.DEFAULT_RESEARCH_CONFIG
      const webSearchConfig: import('../agents/types').WebSearchConfig = webSearchSnap.exists
        ? { ...typesMod.DEFAULT_WEB_SEARCH_CONFIG, ...webSearchSnap.data() }
        : typesMod.DEFAULT_WEB_SEARCH_CONFIG
      const intranetConfig: import('../agents/types').IntranetConfig = intranetSnap.exists
        ? { ...typesMod.DEFAULT_INTRANET_CONFIG, ...intranetSnap.data() }
        : typesMod.DEFAULT_INTRANET_CONFIG

      // 9. Detectar se user pediu análise jurídica (toggle manual OU lexical)
      const requiresLegalWriting = requestLegalAnalysis || /\b(analis[ae]r?|analise|opinar?|elabor[ae]r?|redij[ae]r?|fundament[ae]r?|parecer[ ]?jur[íi]dico)\b/i.test(message)

      // 10. PIPELINE MULTI-AGENTE (orchestrator → internal → web → compiler → legal-writer → critic)
      let content: string = ''
      let tokensUsed = { input: 0, output: 0, total: 0 }
      let agentRunsCount = 0
      let iterations = 0
      let criticScore: number | undefined

      try {
        const { runAgentPipeline } = await import('../agents/pipeline')
        const result = await runAgentPipeline({
          userId,
          conversationId: conversationId ?? `pending_${userId}_${Date.now()}`,
          question: message,
          sanitizedQuestion: sanitizedText,
          allowExternal,
          requiresLegalWriting,
          effort: effort === 'rapido' ? 'rapido' : effort === 'profundo' ? 'profundo' : 'medio',
          userAreas: profile.inferredAreas,
          systemPrompt,
          llmConfig: configToUse,
          geminiApiKey: process.env.GEMINI_API_KEY || '',
          researchConfig,
          webSearchConfig,
          intranetConfig,
          logger: {
            info: (m: string, x?: unknown) => logger.info(m, x),
            warn: (m: string, x?: unknown) => logger.warn(m, x),
            error: (m: string, x?: unknown) => logger.error(m, x),
          },
        })
        content = result.finalAnswer
        agentRunsCount = result.agentRuns.length
        iterations = result.iterations
        criticScore = result.criticScore
        // Estimar tokens
        tokensUsed = {
          input: Math.ceil(message.length / 4),
          output: Math.ceil(content.length / 4),
          total: 0,
        }
        tokensUsed.total = tokensUsed.input + tokensUsed.output
      } catch (err: any) {
        logger.error('pipeline falhou', { err: err?.message })
        content = `⚠️ Erro no pipeline de agentes: ${err?.message ?? 'desconhecido'}.`
      }

      // 9. Persistência
      await saveMessage(userId, conversationId ?? '', 'user', message)
      const sources = chunks.map((c) => ({
        docId: c.docId,
        chunkId: c.id,
        section: c.section,
        title: c.section || c.docId,
        relevance: c.similarity,
      }))
      const { conversationId: newConvId, messageId } = await saveMessage(
        userId,
        conversationId ?? '',
        'assistant',
        content,
        sources,
        tokensUsed.total,
      )

      const latencyMs = Date.now() - start
      logAnalytics('chat', { userId, intent: context?.intent ?? 'general', sourcesCount: sources.length, latencyMs, tokensUsed, allowExternal, provider, model, agentRunsCount, iterations, criticScore })

      logger.info('chat.success', { userId, conversationId: newConvId, messageId, latencyMs, tokensUsed, allowExternal, provider, model, agentRunsCount, iterations, criticScore })

      return {
        conversationId: newConvId,
        messageId,
        reply: content,
        sources,
        intent: context?.intent || 'unknown',
        inScope: true,
        allowExternal,
        feedbackToken: messageId,
        suggestions: [],
        actions: [{ type: 'open_consulta', label: 'Abrir consulta formal' }],
        usage: {
          prompt: tokensUsed.input,
          completion: tokensUsed.output,
          total: tokensUsed.total,
        },
        latencyMs,
        provider,
        model,
        agentRuns: agentRunsCount,
        iterations,
        criticScore,
      }
    } catch (err: any) {
      logger.error('chat.error', { userId, err: err?.message ?? err })
      throw new HttpsError('internal', 'Erro ao processar sua mensagem. Tente novamente.')
    }
  },
)
