"use strict";
/**
 * Embeddings service — wrapper Gemini text-embedding-004.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.embed = embed;
exports.embedBatch = embedBatch;
exports.getCachedEmbedding = getCachedEmbedding;
exports.setCachedEmbedding = setCachedEmbedding;
exports.embedWithCache = embedWithCache;
const generative_ai_1 = require("@google/generative-ai");
const MODEL = 'text-embedding-004';
const BATCH_SIZE = 100;
let cachedClient = null;
function getClient(apiKey) {
    if (!cachedClient) {
        cachedClient = new generative_ai_1.GoogleGenerativeAI(apiKey);
    }
    return cachedClient;
}
/**
 * Gera embedding de um texto.
 */
async function embed(text, apiKey) {
    const client = getClient(apiKey);
    const model = client.getGenerativeModel({ model: MODEL });
    const result = await model.embedContent(text);
    return result.embedding.values;
}
/**
 * Gera embeddings em batch.
 */
async function embedBatch(texts, apiKey) {
    if (texts.length === 0)
        return [];
    if (texts.length <= BATCH_SIZE) {
        return embedBatchInternal(texts, apiKey);
    }
    const results = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const batchResults = await embedBatchInternal(batch, apiKey);
        results.push(...batchResults);
    }
    return results;
}
async function embedBatchInternal(texts, apiKey) {
    const client = getClient(apiKey);
    const model = client.getGenerativeModel({ model: MODEL });
    // Gemini suporta batch embedding
    const result = await model.batchEmbedContents({
        requests: texts.map((t) => ({ content: { role: 'user', parts: [{ text: t }] } })),
    });
    return result.embeddings.map((e, i) => ({
        text: texts[i],
        vector: e.values,
        tokens: Math.ceil(texts[i].length / 4),
    }));
}
/**
 * Cache de embeddings em memória (para chunks já embedados nesta instância).
 */
const memoryCache = new Map();
function getCachedEmbedding(text) {
    return memoryCache.get(text) ?? null;
}
function setCachedEmbedding(text, vector) {
    memoryCache.set(text, vector);
}
async function embedWithCache(text, apiKey) {
    const cached = getCachedEmbedding(text);
    if (cached)
        return cached;
    const vector = await embed(text, apiKey);
    setCachedEmbedding(text, vector);
    return vector;
}
//# sourceMappingURL=embeddings.js.map