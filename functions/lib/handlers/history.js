"use strict";
/**
 * Handler para listar histórico de conversas.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHistory = void 0;
const https_1 = require("firebase-functions/v2/https");
const history_1 = require("../services/history");
exports.getHistory = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Faça login.');
    }
    const convs = await (0, history_1.getConversations)(request.auth.uid);
    return convs.map((c) => ({
        id: c.id,
        uid: c.uid,
        title: c.title,
        status: c.status,
        createdAt: c.createdAt,
        lastActivityAt: c.lastActivityAt,
        messageCount: c.messageCount,
    }));
});
//# sourceMappingURL=history.js.map