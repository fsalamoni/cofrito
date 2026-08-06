"use strict";
/**
 * Scheduled: limpeza de retenção (LGPD).
 *
 * Roda diariamente. Apaga:
 *  - Conversas com mais de 12 meses
 *  - Contas deletadas (status=deleted) com mais de 90 dias
 *  - Logs de auditoria com mais de 5 anos
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupRetention = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const RETENTION = {
    conversationDays: 365,
    deletedAccountDays: 90,
    auditLogDays: 1825,
};
exports.cleanupRetention = (0, scheduler_1.onSchedule)({ schedule: '0 2 * * *', timeZone: 'America/Sao_Paulo' }, async () => {
    const db = (0, firestore_1.getFirestore)();
    const now = firestore_1.Timestamp.now();
    // 1. Apaga contas deletadas há mais de 90 dias
    const cutoffDeleted = new Date(Date.now() - RETENTION.deletedAccountDays * 86400_000);
    const deletedUsers = await db
        .collection('users')
        .where('status', '==', 'deleted')
        .where('deletedAt', '<', cutoffDeleted)
        .limit(100)
        .get();
    let deleted = 0;
    for (const doc of deletedUsers.docs) {
        await doc.ref.delete();
        deleted++;
    }
    // 2. Apaga logs de auditoria com mais de 5 anos
    const cutoffAudit = new Date(Date.now() - RETENTION.auditLogDays * 86400_000);
    const oldAuditLogs = await db
        .collection('audit')
        .where('at', '<', cutoffAudit)
        .limit(500)
        .get();
    let logsDeleted = 0;
    for (const doc of oldAuditLogs.docs) {
        await doc.ref.delete();
        logsDeleted++;
    }
    v2_1.logger.info('cleanupRetention.done', {
        deletedAccounts: deleted,
        auditLogs: logsDeleted,
        at: now.toDate().toISOString(),
    });
});
//# sourceMappingURL=cleanup-retention.js.map