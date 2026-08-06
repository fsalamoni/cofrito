"use strict";
/**
 * History — lê e escreve mensagens.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveMessage = saveMessage;
exports.getRecentHistory = getRecentHistory;
exports.getConversations = getConversations;
const firestore_1 = require("firebase-admin/firestore");
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
// generateId disponível para uso futuro (atualmente o Firestore gera o ID via .doc())
void generateId;
async function saveMessage(userId, conversationId, role, content, sources = [], tokensUsed = 0) {
    const db = (0, firestore_1.getFirestore)();
    const now = firestore_1.Timestamp.now();
    let convId = conversationId;
    if (!convId) {
        const newConvRef = db.collection(`users/${userId}/conversations`).doc();
        convId = newConvRef.id;
        await newConvRef.set({
            uid: userId,
            title: content.slice(0, 60) + (content.length > 60 ? '...' : ''),
            status: 'active',
            createdAt: now,
            lastActivityAt: now,
            messageCount: 0,
        });
    }
    const messageRef = db
        .collection(`users/${userId}/conversations/${convId}/messages`)
        .doc();
    await messageRef.set({
        role,
        content,
        sources,
        tokens: tokensUsed ? { prompt: 0, completion: 0, total: tokensUsed } : null,
        createdAt: now,
    });
    // Atualiza lastActivityAt e messageCount
    await db.doc(`users/${userId}/conversations/${convId}`).update({
        lastActivityAt: now,
        messageCount: (await db.collection(`users/${userId}/conversations/${convId}/messages`).count().get()).data().count,
    });
    return { conversationId: convId, messageId: messageRef.id };
}
async function getRecentHistory(userId, conversationId, limit) {
    const db = (0, firestore_1.getFirestore)();
    if (!conversationId)
        return [];
    const snap = await db
        .collection(`users/${userId}/conversations/${conversationId}/messages`)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
    return snap.docs
        .map((d) => d.data())
        .reverse()
        .map((m) => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
    }));
}
async function getConversations(userId) {
    const db = (0, firestore_1.getFirestore)();
    const snap = await db
        .collection(`users/${userId}/conversations`)
        .orderBy('lastActivityAt', 'desc')
        .limit(50)
        .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
//# sourceMappingURL=history.js.map