/**
 * Handler principal do chat.
 * Recebe pergunta, faz RAG, retorna resposta.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { z } from 'zod'

import { retrieveRelevantChunks } from '../services/retrieval'
import { generateAnswer } from '../services/llm'
import { saveMessage, getRecentHistory } from '../services/history'
import { checkScopeGuardrail } from '../services/guardrails'
import { getUserProfile } from '../services/profile'
import { logAnalytics } from '../services/analytics'
import { filterPII } from '../services/anonymizer'

const ChatRequestSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(2000),
  context: z
    .object({
      documentId: z.string().optional(),
      intent: z.string().optional(),
    })
    .optional(),
})

export const chat = onCall(
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
    const { conversationId, message, context } = parsed.data

    const start = Date.now()

    try {
      // 1. Anonimiza PII
      const sanitized = filterPII(message)
      const sanitizedText = sanitized.text

      // 2. Recupera histórico recente
      const history = await getRecentHistory(userId, conversationId, 6)

      // 3. Retrieval
      const chunks = await retrieveRelevantChunks(sanitizedText, { topK: 8, minSimilarity: 0.55 })

      // 4. Guardrail
      const scopeCheck = checkScopeGuardrail(sanitizedText, chunks)
      if (!scopeCheck.inScope) {
        const messageId = await saveMessage(userId, conversationId, 'assistant', scopeCheck.refusalMessage ?? 'Fora do escopo.', [], 0)
        await saveMessage(userId, conversationId, 'user', message)
        logAnalytics('chat', { userId, intent: 'out_of_scope', sourcesCount: 0, latencyMs: Date.now() - start, guardrailTriggered: scopeCheck.reason })
        return {
          conversationId: messageId.conversationId,
          messageId: messageId.messageId,
          reply: scopeCheck.refusalMessage,
          sources: [],
          intent: scopeCheck.reason || 'out_of_scope',
          inScope: false,
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
        displayName: userProfile.displayName,
        inferredAreas: userProfile.areasInferidas,
      }

      // 6. LLM
      // Integração LLM deliberadamente fora de escopo neste deploy (decisão 2026-08).
      // apiKey é string vazia → services/llm.ts retorna mensagem amigável.
      const { content, sources, tokensUsed } = await generateAnswer({
        userMessage: sanitizedText,
        history,
        chunks,
        profile,
        apiKey: '',
      })

      // 7. Persistência
      await saveMessage(userId, conversationId, 'user', message)
      const { conversationId: newConvId, messageId } = await saveMessage(
        userId,
        conversationId,
        'assistant',
        content,
        sources,
        tokensUsed.total,
      )

      const latencyMs = Date.now() - start
      logAnalytics('chat', { userId, intent: context?.intent, sourcesCount: sources.length, latencyMs, tokensUsed })

      logger.info('chat.success', { userId, conversationId: newConvId, messageId, latencyMs, tokensUsed })

      return {
        conversationId: newConvId,
        messageId,
        reply: content,
        sources,
        intent: context?.intent || 'unknown',
        inScope: true,
        feedbackToken: messageId,
        suggestions: [],
        actions: [{ type: 'open_consulta', label: 'Abrir consulta formal' }],
        usage: {
          prompt: tokensUsed.input,
          completion: tokensUsed.output,
          total: tokensUsed.total,
        },
        latencyMs,
      }
    } catch (err) {
      logger.error('chat.error', { userId, err })
      throw new HttpsError('internal', 'Erro ao processar sua mensagem. Tente novamente.')
    }
  },
)
