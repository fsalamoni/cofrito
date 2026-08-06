"use strict";
/**
 * Profile — leitura e atualização de perfil.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserProfile = getUserProfile;
exports.updateInferredAreas = updateInferredAreas;
const firestore_1 = require("firebase-admin/firestore");
async function getUserProfile(userId) {
    const db = (0, firestore_1.getFirestore)();
    const userDoc = await db.doc(`users/${userId}`).get();
    const data = userDoc.data() || {};
    return {
        uid: userId,
        displayName: data.displayName || 'Usuário',
        email: data.email || '',
        institutionalEmail: data.institutionalEmail ?? (data.email?.endsWith('@mp.rs.gov.br') ?? false),
        role: data.role || 'externo',
        areasInferidas: data.areasInferidas || [],
        preferences: data.preferences || {
            tone: 'formal',
            detail: 'medium',
            language: 'pt-BR',
        },
        status: data.status || 'active',
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        lastSeen: data.lastSeen?.toDate?.()?.toISOString() || new Date().toISOString(),
        consent: data.consent || { acceptedAt: '', version: '1.0', ipHash: '', userAgent: '' },
    };
}
async function updateInferredAreas(userId, areas) {
    if (!areas?.length)
        return;
    const db = (0, firestore_1.getFirestore)();
    const profileRef = db.doc(`users/${userId}/profile/main`);
    const profileDoc = await profileRef.get();
    const current = profileDoc.data()?.areasInferidas || [];
    const updated = Array.from(new Set([...current, ...areas])).slice(0, 5);
    await profileRef.set({
        areasInferidas: updated,
        updatedAt: firestore_1.Timestamp.now(),
    }, { merge: true });
}
//# sourceMappingURL=profile.js.map