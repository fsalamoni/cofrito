/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { getFirestore } from 'firebase-admin/firestore'

import { retrieveRelevantChunks } from '../services/retrieval'
import { generateWithProvider, type LLMConfigLike } from '../services/llm-providers'
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
    const { conversationId, message, allowExternal, context } = parsed.data
    const start = Date.now()

    try {
      // 1. Anonimiza
      const sanitizedText = filterPII(message).text

      // 2. Histórico
      const history = await getRecentHistory(userId, conversationId, 6)

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

      // 7. System prompt + mensagens
      const systemPrompt = buildSystemPrompt({
        userName: profile.displayName,
        userAreas: profile.inferredAreas,
        allowExternal,
        hasCorpusChunks: chunks.length > 0,
      })
      const messages = [
        ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: sanitizedText },
      ]

      // 8. Geração
      let content: string = ''
      let tokensUsed = { input: 0, output: 0, total: 0 }

      try {
        const out = await generateWithProvider({
          systemPrompt,
          messages,
          config: configToUse,
          geminiApiKey: process.env.GEMINI_API_KEY || '',
        })
        content = out.content
        tokensUsed = out.tokens
      } catch (err: any) {
        logger.error('generateWithProvider falhou', { provider, model, err: err?.message })
        // FALLBACK CHAIN: se a config principal falhar, tenta OpenRouter (se não for já)
        //   e depois Gemini (se não for já) antes do erro fatal.
        const tried = new Set([provider])
        let recovered = false
        // Tentativa 1: OpenRouter (se ainda não tentou e tiver key)
        if (!tried.has('openrouter') && process.env.OPENROUTER_API_KEY) {
          try {
            const out = await generateWithProvider({
              systemPrompt,
              messages,
              config: {
                provider: 'openrouter',
                model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
                apiKey: process.env.OPENROUTER_API_KEY,
              },
              geminiApiKey: process.env.GEMINI_API_KEY || '',
            })
            content = out.content
            tokensUsed = out.tokens
            provider = 'openrouter'
            model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
            recovered = true
            logger.warn('chat.fallback.openrouter', { userId, originalProvider: effectiveConfig?.provider, originalModel: effectiveConfig?.model })
          } catch (err2: any) {
            logger.error('Fallback OpenRouter falhou', { err: err2?.message })
          }
        }
        // Tentativa 2: Gemini nativo (se ainda não tentou e tiver key)
        if (!recovered && !tried.has('google') && process.env.GEMINI_API_KEY) {
          try {
            const out = await generateWithProvider({
              systemPrompt,
              messages,
              config: { provider: 'google', model: 'gemini-2.5-flash', apiKey: process.env.GEMINI_API_KEY },
              geminiApiKey: process.env.GEMINI_API_KEY,
            })
            content = out.content
            tokensUsed = out.tokens
            provider = 'google'
            model = 'gemini-2.5-flash'
            recovered = true
            logger.warn('chat.fallback.gemini', { userId, originalProvider: effectiveConfig?.provider, originalModel: effectiveConfig?.model })
          } catch (err3: any) {
            logger.error('Fallback Gemini falhou', { err: err3?.message })
          }
        }
        if (!recovered) {
          content = `⚠️ Erro ao chamar o provedor ${provider} (${model}): ${err?.message ?? 'desconhecido'}. Configure um provedor em Configurações ou contate o admin.`
        }
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
      logAnalytics('chat', { userId, intent: context?.intent ?? 'general', sourcesCount: sources.length, latencyMs, tokensUsed, allowExternal, provider, model })

      logger.info('chat.success', { userId, conversationId: newConvId, messageId, latencyMs, tokensUsed, allowExternal, provider, model })

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
      }
    } catch (err: any) {
      logger.error('chat.error', { userId, err: err?.message ?? err })
      throw new HttpsError('internal', 'Erro ao processar sua mensagem. Tente novamente.')
    }
  },
)
