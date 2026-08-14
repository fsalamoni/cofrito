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
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { z } from 'zod'
import { getFirestore } from '../services/firestore'

import { retrieveRelevantChunks } from '../services/retrieval'
import { type LLMConfigLike } from '../services/llm-providers'
import { buildSystemPrompt } from '../prompts/system'
import { saveMessage, getRecentHistory } from '../services/history'
import { createOnTrailHandler } from '../services/agent-events'
import { checkScopeGuardrail } from '../services/guardrails'
import { getUserProfile } from '../services/profile'
import { logAnalytics } from '../services/analytics'
import { filterPII } from '../services/anonymizer'

/**
 * Desembrulha o doc admin-config/llm (gravado com envelope { data: {...} }),
 * aceitando também o formato legado (campos na raiz). Retorna null se inválido.
 */
function unwrapGlobalLLM(raw: unknown): LLMConfigLike | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, any>
  const d = r.data && typeof r.data === 'object' ? r.data : r
  if (d && d.provider && d.model) return d as LLMConfigLike
  return null
}

const ChatRequestSchema = z.object({
  conversationId: z.string().nullable().optional(),
  message: z.string().min(1).max(2000),
  allowExternal: z.boolean().optional().default(false),
  requestLegalAnalysis: z.boolean().optional().default(false),
  effort: z.enum(['rapido', 'padrao', 'profundo']).optional().default('padrao'),
  // Canal de eventos gerado pelo cliente ANTES de enviar, para a timeline ao vivo.
  clientEventId: z.string().min(6).max(80).optional(),
  context: z.object({
    documentId: z.string().nullable().optional(),
    intent: z.string().nullable().optional(),
  }).optional(),
})

export const chatV2 = onCall(
  { cors: true, enforceAppCheck: false, timeoutSeconds: 300, memory: '1GiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para conversar com o Cofrito.')
    }
    const userId = request.auth.uid
    // Garantir que os documentos seed estao no corpus (idempotente, nao bloqueia)
    // Usa flag em memoria para so rodar uma vez por cold start
    if (!(globalThis as any).__cofritoSeedDone) {
      (globalThis as any).__cofritoSeedDone = true
      try {
        const { ensureSeedCorpus } = await import('../services/seed-corpus')
        void ensureSeedCorpus().catch((e) => logger.warn('seed-corpus init failed', { err: e?.message }))
      } catch (e) {
        logger.warn('seed-corpus import failed', { err: (e as Error).message })
      }
    }
    const parsed = ChatRequestSchema.safeParse(request.data)
    if (!parsed.success) {
      logger.error('chatV2 schema fail', { errors: parsed.error.errors, received: request.data })
      throw new HttpsError('invalid-argument', `Mensagem inválida: ${parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`)
    }
    const { conversationId, message, allowExternal, requestLegalAnalysis, effort, context, clientEventId } = parsed.data
    const start = Date.now()

    try {
      // 1. Anonimiza
      const sanitizedText = filterPII(message).text

      // 2. Histórico (try/catch — sem histórico, segue sem)
      try {
        await getRecentHistory(userId, conversationId || undefined, 6)
      } catch (histErr) {
        logger.warn('getRecentHistory falhou (continuando sem histórico)', { err: (histErr as Error)?.message })
      }

      // 3. Retrieval (try/catch — sem chunks, segue sem)
      let chunks: Awaited<ReturnType<typeof retrieveRelevantChunks>> = []
      try {
        chunks = await retrieveRelevantChunks(sanitizedText, { topK: 8, minSimilarity: 0.55 })
      } catch (retErr) {
        logger.warn('retrieveRelevantChunks falhou (continuando sem retrieval)', { err: (retErr as Error)?.message })
      }

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
      const [globalSnap, userDocSnap] = await Promise.all([
        db.doc('admin-config/llm').get(),
        db.doc(`users/${userId}`).get(),
      ])
      // admin-config/llm é gravado com envelope { data: {...} }; desembrulha + valida.
      const globalCfg = unwrapGlobalLLM(globalSnap.exists ? globalSnap.data() : null)
      if (globalCfg) {
        // A apiKey global fica no doc secreto (master-only); fallback à chave legada.
        const { readGlobalApiKey } = await import('../services/global-llm')
        globalCfg.apiKey = await readGlobalApiKey(globalCfg.apiKey)
      }
      // Config pessoal do usuário fica no CAMPO `llmConfig` do doc users/{uid}.
      const userDocData = userDocSnap.exists ? (userDocSnap.data() as Record<string, any>) : null
      const userCfgRaw = userDocData?.llmConfig
      const userCfg: LLMConfigLike | null =
        userCfgRaw && userCfgRaw.provider && userCfgRaw.model ? (userCfgRaw as LLMConfigLike) : null
      const userAgentsRaw = userDocData?.agentsConfig ?? null
      const adminForcesGlobal = !!globalCfg
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
      let systemPrompt = buildSystemPrompt({
        userName: profile.displayName,
        userAreas: profile.inferredAreas,
        allowExternal,
        hasCorpusChunks: chunks.length > 0,
      })

      // 7b. Aplicar config do agente orquestrador (modelo dedicado + skills)
      try {
        const {
          loadAgentsConfig, resolveAgentLLMConfig, buildAgentSkillsPrompt,
          normalizeUserAgentModels, resolveUserAgentLLMConfig,
        } = await import('../services/agents-config')
        const agentsConfig = await loadAgentsConfig()
        const orchestrator = agentsConfig.agents.orchestrator
        // Skills do orquestrador são sempre definidas pelo admin (global).
        const skillsPrompt = buildAgentSkillsPrompt(orchestrator)
        if (skillsPrompt) systemPrompt = `${systemPrompt}\n\n${skillsPrompt}`

        if (adminForcesGlobal) {
          // Admin define o modelo: dedicado do orquestrador (admin) > global.
          const resolved = resolveAgentLLMConfig(orchestrator, configToUse)
          if (resolved && orchestrator.model.mode === 'custom') {
            configToUse = resolved
            provider = resolved.provider
            model = resolved.model
          }
        } else {
          // Delegado ao usuário: modelo por-agente do próprio usuário > sua config base.
          const userAgents = normalizeUserAgentModels(userAgentsRaw)
          const resolved = resolveUserAgentLLMConfig(userAgents.orchestrator, configToUse)
          if (resolved && userAgents.orchestrator?.mode === 'custom') {
            configToUse = resolved
            provider = resolved.provider
            model = resolved.model
          }
        }
      } catch (agentsErr) {
        logger.warn('chat-v2: falha ao aplicar agents-config do orquestrador', { err: (agentsErr as Error)?.message })
      }

      // 8. Carregar configs de pesquisa (try/catch — usa defaults se Firestore falhar)
      const typesMod = await import('../agents/types')
      let researchConfig: import('../agents/types').ResearchConfig = typesMod.DEFAULT_RESEARCH_CONFIG
      let webSearchConfig: import('../agents/types').WebSearchConfig = typesMod.DEFAULT_WEB_SEARCH_CONFIG
      let intranetConfig: import('../agents/types').IntranetConfig = typesMod.DEFAULT_INTRANET_CONFIG
      try {
        const [researchSnap, webSearchSnap, intranetSnap] = await Promise.all([
          db.doc('admin-config/research').get(),
          db.doc('admin-config/web-search').get(),
          db.doc('admin-config/intranet').get(),
        ])
        if (researchSnap.exists) researchConfig = { ...typesMod.DEFAULT_RESEARCH_CONFIG, ...researchSnap.data() }
        if (webSearchSnap.exists) webSearchConfig = { ...typesMod.DEFAULT_WEB_SEARCH_CONFIG, ...webSearchSnap.data() }
        if (intranetSnap.exists) intranetConfig = { ...typesMod.DEFAULT_INTRANET_CONFIG, ...intranetSnap.data() }
      } catch (cfgErr) {
        logger.warn('loadAdminConfigs falhou (usando defaults)', { err: (cfgErr as Error)?.message })
      }

      // 9. Detectar se user pediu análise jurídica (toggle manual OU lexical)
      const requiresLegalWriting = requestLegalAnalysis || /\b(analis[ae]r?|analise|opinar?|elabor[ae]r?|redij[ae]r?|fundament[ae]r?|parecer[ ]?jur[íi]dico)\b/i.test(message)

      // 10. PIPELINE MULTI-AGENTE (orchestrator → internal → web → compiler → legal-writer → critic)
      let content: string = ''
      let pipelineError: string | null = null
      let tokensUsed = { input: 0, output: 0, total: 0 }
      let agentRunsCount = 0
      let iterations = 0
      let criticScore: number | undefined

      // Timeline em tempo real: usa o canal gerado pelo CLIENTE (clientEventId),
      // que já se inscreveu ANTES de enviar. Assim os eventos aparecem ao vivo,
      // inclusive na 1ª mensagem (quando ainda não há conversationId).
      const eventChannelId = clientEventId || conversationId || `pending_${userId}_${Date.now()}`
      const pipelineMessageId = clientEventId || `msg-${Date.now()}-live`
      const onTrail = createOnTrailHandler(eventChannelId, pipelineMessageId)

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
          onTrail,
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
        pipelineError = err?.message ?? 'desconhecido'
        content = `⚠️ Erro no pipeline de agentes: ${pipelineError}. Tente novamente.`
      }

      // 9. Persistência (try/catch para NÃO matar a request se Firestore falhar)
      let newConvId = conversationId || ''
      let messageId = `msg-${Date.now()}`
      const sources = chunks.map((c) => ({
        docId: c.docId,
        chunkId: c.id,
        section: c.section,
        title: c.section || c.docId,
        relevance: c.similarity,
      }))
      try {
        await saveMessage(userId, conversationId ?? '', 'user', message)
        const saved = await saveMessage(
          userId,
          conversationId ?? '',
          'assistant',
          content,
          sources,
          tokensUsed.total,
        )
        newConvId = saved.conversationId
        messageId = saved.messageId
      } catch (saveErr) {
        const e = saveErr as { message?: string }
        logger.error('chat.saveMessage falhou (continuando sem persistência)', { err: e?.message })
        // Continua sem falhar a request
      }

      const latencyMs = Date.now() - start
      logAnalytics('chat', { userId, intent: context?.intent ?? 'general', sourcesCount: sources.length, latencyMs, tokensUsed, allowExternal, provider, model, agentRunsCount, iterations, criticScore })

      logger.info('chat.success', { userId, conversationId: newConvId, messageId,
        pipelineMessageId, latencyMs, tokensUsed, allowExternal, provider, model, agentRunsCount, iterations, criticScore })

      return {
        conversationId: newConvId,
        messageId,
        pipelineMessageId,
        reply: content,
        sources,
        intent: context?.intent || 'unknown',
        inScope: true,
        allowExternal,
        feedbackToken: messageId,
        pipelineError,
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
      const msg = err?.message ?? String(err)
      logger.error('chat.error', { userId, err: msg, stack: err?.stack?.substring(0, 500) })
      // Temporariamente retorna o erro real para debug
      throw new HttpsError('internal', `Erro: ${msg}`)
    }
  },
)
