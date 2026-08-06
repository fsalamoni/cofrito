"use strict";
/**
 * Admin: estatísticas gerais.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminGetStats = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("../../middleware/auth");
exports.adminGetStats = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Faça login.');
    await (0, auth_1.assertAdmin)(request.auth.uid);
    const db = (0, firestore_1.getFirestore)();
    const [users, conversas, consultas, documents] = await Promise.all([
        db.collection('users').count().get(),
        db.collectionGroup('conversations').count().get(),
        db.collection('consultas-formais').count().get(),
        db.collection('corpus/documents').count().get(),
    ]);
    return {
        users: users.data().count,
        conversations: conversas.data().count,
        consultas: consultas.data().count,
        documents: documents.data().count,
        timestamp: new Date().toISOString(),
    };
});
//# sourceMappingURL=stats.js.map