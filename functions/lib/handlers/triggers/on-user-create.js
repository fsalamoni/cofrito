"use strict";
/**
 * Trigger: ao criar usuário, inicializa perfil padrão.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUserCreate = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
exports.onUserCreate = (0, firestore_1.onDocumentCreated)({ document: 'users/{uid}', region: 'southamerica-east1' }, async (event) => {
    const uid = event.params.uid;
    const userData = event.data?.data();
    if (!userData)
        return;
    const db = (0, firestore_2.getFirestore)();
    await db.doc(`users/${uid}/profile/main`).set({
        uid,
        areasAtuacao: [],
        areasInferidas: [],
        preferences: { tone: 'formal', detail: 'medium', language: 'pt-BR' },
        updatedAt: firestore_2.Timestamp.now(),
    }, { merge: true });
    await db.collection('audit').add({
        userId: uid,
        action: 'user.created',
        resource: `users/${uid}`,
        at: firestore_2.Timestamp.now(),
        meta: {},
    });
    v2_1.logger.info('user.created', { uid });
});
//# sourceMappingURL=on-user-create.js.map