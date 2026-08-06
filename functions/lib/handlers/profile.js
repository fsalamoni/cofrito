"use strict";
/**
 * Handlers de perfil.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.getProfile = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const profile_1 = require("../services/profile");
const zod_1 = require("zod");
exports.getProfile = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Faça login.');
    }
    const profile = await (0, profile_1.getUserProfile)(request.auth.uid);
    return profile;
});
const UpdateProfileSchema = zod_1.z.object({
    displayName: zod_1.z.string().min(2).max(100).optional(),
    unidade: zod_1.z.string().max(200).optional(),
    areasAtuacao: zod_1.z.array(zod_1.z.string()).max(20).optional(),
    preferences: zod_1.z
        .object({
        tone: zod_1.z.enum(['formal', 'conversational']).optional(),
        detail: zod_1.z.enum(['low', 'medium', 'high']).optional(),
        language: zod_1.z.literal('pt-BR').optional(),
    })
        .optional(),
});
exports.updateProfile = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Faça login.');
    }
    const parsed = UpdateProfileSchema.safeParse(request.data);
    if (!parsed.success) {
        throw new https_1.HttpsError('invalid-argument', 'Dados inválidos.');
    }
    const db = (0, firestore_1.getFirestore)();
    const userId = request.auth.uid;
    const userRef = db.doc(`users/${userId}`);
    const profileRef = db.doc(`users/${userId}/profile/main`);
    const userUpdates = { lastSeen: firestore_1.Timestamp.now() };
    if (parsed.data.displayName)
        userUpdates.displayName = parsed.data.displayName;
    const profileUpdates = { updatedAt: firestore_1.Timestamp.now() };
    if (parsed.data.unidade)
        profileUpdates.unidade = parsed.data.unidade;
    if (parsed.data.areasAtuacao)
        profileUpdates.areasAtuacao = parsed.data.areasAtuacao;
    if (parsed.data.preferences)
        profileUpdates.preferences = parsed.data.preferences;
    await userRef.update(userUpdates);
    await profileRef.set(profileUpdates, { merge: true });
    return await (0, profile_1.getUserProfile)(userId);
});
//# sourceMappingURL=profile.js.map