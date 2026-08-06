"use strict";
/**
 * Serviço de retrieval.
 * Embedding da query + busca vetorial no Firestore.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrieveRelevantChunks = retrieveRelevantChunks;
const generative_ai_1 = require("@google/generative-ai");
const firestore_1 = require("firebase-admin/firestore");
async function retrieveRelevantChunks(query, options = {}) {
    const { topK = 8, minSimilarity = 0.55, filterType, filterArea } = options;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
        throw new Error('GEMINI_API_KEY não configurada');
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const embedModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const embedResult = await embedModel.embedContent(query);
    const queryVector = embedResult.embedding.values;
    const db = (0, firestore_1.getFirestore)();
    let query_ref = db.collectionGroup('chunks');
    if (filterType) {
        query_ref = query_ref.where('type', '==', filterType);
    }
    if (filterArea) {
        query_ref = query_ref.where('area', 'array-contains', filterArea);
    }
    const results = await query_ref
        .where('status', '==', 'ativo')
        .findNearest({
        vectorField: 'embedding',
        queryVector: queryVector,
        limit: topK,
        distanceMeasure: 'COSINE',
    })
        .get();
    const chunks = [];
    results.forEach((doc) => {
        const data = doc.data();
        const distance = doc.get('distance') ?? 1;
        const similarity = 1 - distance / 2;
        if (similarity < minSimilarity)
            return;
        chunks.push({
            id: doc.id,
            docId: doc.ref.parent.parent?.id ?? '',
            text: data.text ?? '',
            section: data.section ?? '',
            metadata: data.metadata ?? {},
            similarity,
        });
    });
    return chunks;
}
//# sourceMappingURL=retrieval.js.map