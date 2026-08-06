"use strict";
/**
 * LLM service — wrapper para Gemini.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAnswer = generateAnswer;
const generative_ai_1 = require("@google/generative-ai");
const system_1 = require("../prompts/system");
async function generateAnswer(input) {
    const { userMessage, history, chunks, profile, apiKey } = input;
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: system_1.SYSTEM_PROMPT,
        generationConfig: {
            temperature: 0.2,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
        },
        safetySettings: [
            { category: generative_ai_1.HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
            { category: generative_ai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
            { category: generative_ai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
            { category: generative_ai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
        ],
    });
    const chunksText = chunks
        .map((c, i) => `[${i + 1}] (ref:${c.docId}#${c.id}, seção: "${c.section}", similaridade: ${c.similarity.toFixed(2)})\n${c.text}`)
        .join('\n\n---\n\n');
    const historyText = history
        .map((h) => `${h.role === 'user' ? 'Usuário' : 'Assistente'}: ${h.content}`)
        .join('\n');
    const userContent = `
# PERFIL DO USUÁRIO
Nome: ${profile.displayName}
Áreas de interesse: ${profile.inferredAreas.join(', ') || '(nenhuma ainda)'}

# HISTÓRICO RECENTE
${historyText || '(início da conversa)'}

# MATERIAL DO CORPUS
${chunksText}

# PERGUNTA
${userMessage}

Responda de forma direta, cite fontes no formato [ref:docId#chunkId], termine perguntando se foi suficiente.
`.trim();
    const chat = model.startChat();
    const result = await chat.sendMessage(userContent);
    const response = result.response;
    const text = response.text();
    return {
        content: text,
        sources: chunks.map((c) => ({
            docId: c.docId,
            chunkId: c.id,
            section: c.section,
            title: c.section || c.docId,
            relevance: c.similarity,
        })),
        tokensUsed: {
            input: response.usageMetadata?.promptTokenCount ?? 0,
            output: response.usageMetadata?.candidatesTokenCount ?? 0,
            total: response.usageMetadata?.totalTokenCount ?? 0,
        },
    };
}
//# sourceMappingURL=llm.js.map