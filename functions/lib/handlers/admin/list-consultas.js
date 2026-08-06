"use strict";
/**
 * Admin: lista consultas formais.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminListConsultas = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("../../middleware/auth");
exports.adminListConsultas = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Faça login.');
    await (0, auth_1.assertAdmin)(request.auth.uid);
    const db = (0, firestore_1.getFirestore)();
    const snap = await db.collection('consultas-formais').orderBy('createdAt', 'desc').limit(200).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
});
//# sourceMappingURL=list-consultas.js.map