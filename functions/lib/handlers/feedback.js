"use strict";
/**
 * Handler para feedback do usuário.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitFeedback = void 0;
const https_1 = require("firebase-functions/v2/https");
const zod_1 = require("zod");
const firestore_1 = require("firebase-admin/firestore");
const FeedbackSchema = zod_1.z.object({
    messageId: zod_1.z.string(),
    helpful: zod_1.z.boolean(),
    comment: zod_1.z.string().max(500).optional(),
});
exports.submitFeedback = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Faça login.');
    }
    const parsed = FeedbackSchema.safeParse(request.data);
    if (!parsed.success) {
        throw new https_1.HttpsError('invalid-argument', 'Feedback inválido.');
    }
    const db = (0, firestore_1.getFirestore)();
    const userId = request.auth.uid;
    const feedbackId = `${userId}-${parsed.data.messageId}`;
    await db.collection('feedback').doc(feedbackId).set({
        userId,
        messageId: parsed.data.messageId,
        helpful: parsed.data.helpful,
        comment: parsed.data.comment || null,
        createdAt: firestore_1.Timestamp.now(),
    }, { merge: true });
    return { ok: true };
});
//# sourceMappingURL=feedback.js.map