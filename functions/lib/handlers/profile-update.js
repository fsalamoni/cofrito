"use strict";
/**
 * Handler de atualização de perfil.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const firestore_1 = require("firebase-admin/firestore");
const zod_1 = require("zod");
const UpdateProfileSchema = zod_1.z.object({
    displayName: zod_1.z.string().min(1).max(120).optional(),
    unidade: zod_1.z.string().max(200).optional(),
    areasAtuacao: zod_1.z.array(zod_1.z.string()).max(20).optional(),
    preferences: zod_1.z
        .object({
        tone: zod_1.z.enum(['formal', 'conversational']).optional(),
        detail: zod_1.z.enum(['low', 'medium', 'high']).optional(),
    })
        .optional(),
});
exports.updateProfile = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Faça login para atualizar o perfil.');
    }
    const userId = request.auth.uid;
    const parsed = UpdateProfileSchema.safeParse(request.data);
    if (!parsed.success) {
        throw new https_1.HttpsError('invalid-argument', 'Dados inválidos.', { issues: parsed.error.issues });
    }
    const db = (0, firestore_1.getFirestore)();
    const userRef = db.doc(`users/${userId}`);
    const update = {
        updatedAt: firestore_1.Timestamp.now(),
        lastSeen: firestore_1.Timestamp.now(),
    };
    if (parsed.data.displayName !== undefined)
        update.displayName = parsed.data.displayName;
    if (parsed.data.unidade !== undefined)
        update.unidade = parsed.data.unidade;
    if (parsed.data.areasAtuacao !== undefined)
        update.areasAtuacao = parsed.data.areasAtuacao;
    if (parsed.data.preferences !== undefined)
        update.preferences = parsed.data.preferences;
    await userRef.set(update, { merge: true });
    v2_1.logger.info('profile.updated', { userId });
    return { ok: true, userId };
});
//# sourceMappingURL=profile-update.js.map