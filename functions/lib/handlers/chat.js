"use strict";
/**
 * Handler principal do chat.
 * Recebe pergunta, faz RAG, retorna resposta.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.chat = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
const zod_1 = require("zod");
const retrieval_1 = require("../services/retrieval");
const llm_1 = require("../services/llm");
const history_1 = require("../services/history");
const guardrails_1 = require("../services/guardrails");
const profile_1 = require("../services/profile");
const analytics_1 = require("../services/analytics");
const anonymizer_1 = require("../services/anonymizer");
const GEMINI_API_KEY = (0, params_1.defineSecret)('GEMINI_API_KEY');
const ChatRequestSchema = zod_1.z.object({
    conversationId: zod_1.z.string().optional(),
    message: zod_1.z.string().min(1).max(2000),
    context: zod_1.z
        .object({
        documentId: zod_1.z.string().optional(),
        intent: zod_1.z.string().optional(),
    })
        .optional(),
});
exports.chat = (0, https_1.onCall)({ secrets: [GEMINI_API_KEY], cors: true, enforceAppCheck: false }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Faça login para conversar com o Cofrito.');
    }
    const userId = request.auth.uid;
    const parsed = ChatRequestSchema.safeParse(request.data);
    if (!parsed.success) {
        throw new https_1.HttpsError('invalid-argument', 'Mensagem inválida.');
    }
    const { conversationId, message, context } = parsed.data;
    const start = Date.now();
    try {
        // 1. Anonimiza PII
        const sanitizedText = (0, anonymizer_1.filterPII)(message).text;
        // 2. Recupera histórico recente
        const history = await (0, history_1.getRecentHistory)(userId, conversationId, 6);
        // 3. Retrieval
        const chunks = await (0, retrieval_1.retrieveRelevantChunks)(sanitizedText, { topK: 8, minSimilarity: 0.55 });
        // 4. Guardrail
        const scopeCheck = (0, guardrails_1.checkScopeGuardrail)(sanitizedText, chunks);
        if (!scopeCheck.inScope) {
            const messageId = await (0, history_1.saveMessage)(userId, conversationId ?? '', 'assistant', scopeCheck.refusalMessage ?? 'Fora do escopo.', [], 0);
            await (0, history_1.saveMessage)(userId, conversationId ?? '', 'user', message);
            (0, analytics_1.logAnalytics)('chat', { userId, intent: 'out_of_scope', sourcesCount: 0, latencyMs: Date.now() - start, guardrailTriggered: scopeCheck.reason });
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
            };
        }
        // 5. Perfil
        const profile = await (0, profile_1.getUserProfile)(userId);
        // 6. LLM
        const { content, sources, tokensUsed } = await (0, llm_1.generateAnswer)({
            userMessage: sanitizedText,
            history,
            chunks,
            profile: {
                displayName: profile?.displayName ?? 'Promotor',
                inferredAreas: profile?.areasInferidas ?? [],
            },
            apiKey: GEMINI_API_KEY.value(),
        });
        // 7. Persistência
        await (0, history_1.saveMessage)(userId, conversationId ?? '', 'user', message);
        const { conversationId: newConvId, messageId } = await (0, history_1.saveMessage)(userId, conversationId ?? '', 'assistant', content, sources, tokensUsed.total);
        const latencyMs = Date.now() - start;
        (0, analytics_1.logAnalytics)('chat', { userId, intent: context?.intent ?? 'general', sourcesCount: sources.length, latencyMs, tokensUsed });
        v2_1.logger.info('chat.success', { userId, conversationId: newConvId, messageId, latencyMs, tokensUsed });
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
        };
    }
    catch (err) {
        v2_1.logger.error('chat.error', { userId, err });
        throw new https_1.HttpsError('internal', 'Erro ao processar sua mensagem. Tente novamente.');
    }
});
//# sourceMappingURL=chat.js.map