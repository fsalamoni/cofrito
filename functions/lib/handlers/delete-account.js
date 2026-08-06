"use strict";
/**
 * Handler para apagar conta (LGPD).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccount = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const v2_1 = require("firebase-functions/v2");
exports.deleteAccount = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Faça login.');
    }
    const userId = request.auth.uid;
    const db = (0, firestore_1.getFirestore)();
    // 1. Soft delete
    await db.doc(`users/${userId}`).set({
        status: 'deleted',
        deletedAt: firestore_1.Timestamp.now(),
        // Anonimiza dados pessoais
        displayName: 'Usuário removido',
        email: '[removed]',
    }, { merge: true });
    // 2. Log de auditoria
    await db.collection('audit').add({
        userId,
        action: 'account.deleted',
        resource: `users/${userId}`,
        at: firestore_1.Timestamp.now(),
        meta: {},
    });
    // 3. Apaga autenticação
    try {
        await (0, auth_1.getAuth)().deleteUser(userId);
    }
    catch (err) {
        v2_1.logger.error('deleteAccount.auth.error', { userId, err });
    }
    // 4. Cloud Function agendada (cleanupRetention) apaga após 90 dias
    return { ok: true };
});
//# sourceMappingURL=delete-account.js.map