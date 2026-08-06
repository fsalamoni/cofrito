"use strict";
/**
 * Middleware de auth — verifica se usuário é admin.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertAdmin = assertAdmin;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
async function assertAdmin(uid) {
    const db = (0, firestore_1.getFirestore)();
    const adminDoc = await db.doc(`admins/${uid}`).get();
    if (!adminDoc.exists) {
        throw new https_1.HttpsError('permission-denied', 'Operação restrita a administradores.');
    }
}
//# sourceMappingURL=auth.js.map