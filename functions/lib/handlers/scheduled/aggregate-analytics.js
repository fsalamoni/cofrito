"use strict";
/**
 * Scheduled: agrega métricas diárias.
 * Roda diariamente à meia-noite.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateAnalytics = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
exports.aggregateAnalytics = (0, scheduler_1.onSchedule)({ schedule: '0 3 * * *', timeZone: 'America/Sao_Paulo' }, async () => {
    const db = (0, firestore_1.getFirestore)();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const usageRef = db.doc(`system/usage-daily/${today}`);
    await usageRef.set({
        date: today,
        lastAggregatedAt: firestore_1.Timestamp.now(),
    }, { merge: true });
    v2_1.logger.info('aggregateAnalytics.done', { date: today });
});
//# sourceMappingURL=aggregate-analytics.js.map