"use strict";
/**
 * Trigger: log de auditoria de feedback.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.onFeedbackCreate = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
exports.onFeedbackCreate = (0, firestore_1.onDocumentCreated)({ document: 'feedback/{feedbackId}', region: 'southamerica-east1' }, async (event) => {
    const data = event.data?.data();
    if (!data)
        return;
    const db = (0, firestore_2.getFirestore)();
    await db.collection('audit').add({
        userId: data.userId,
        action: 'feedback.created',
        resource: `feedback/${event.params.feedbackId}`,
        at: firestore_2.Timestamp.now(),
        meta: { helpful: data.helpful, hasComment: !!data.comment },
    });
});
//# sourceMappingURL=on-feedback-create.js.map