/**
 * Scheduled: limpeza de retenção (LGPD).
 *
 * Roda diariamente. Apaga:
 *  - Conversas com mais de 12 meses
 *  - Contas deletadas (status=deleted) com mais de 90 dias
 *  - Logs de auditoria com mais de 5 anos
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

const RETENTION = {
  conversationDays: 365,
  deletedAccountDays: 90,
  auditLogDays: 1825,
}

export const cleanupRetention = onSchedule(
  { schedule: '0 2 * * *', timeZone: 'America/Sao_Paulo' },
  async () => {
    const db = getFirestore()
    const now = Timestamp.now()

    // 1. Apaga contas deletadas há mais de 90 dias
    const cutoffDeleted = new Date(Date.now() - RETENTION.deletedAccountDays * 86400_000)
    const deletedUsers = await db
      .collection('users')
      .where('status', '==', 'deleted')
      .where('deletedAt', '<', cutoffDeleted)
      .limit(100)
      .get()

    let deleted = 0
    for (const doc of deletedUsers.docs) {
      await doc.ref.delete()
      deleted++
    }

    // 2. Apaga logs de auditoria com mais de 5 anos
    const cutoffAudit = new Date(Date.now() - RETENTION.auditLogDays * 86400_000)
    const oldAuditLogs = await db
      .collection('audit')
      .where('at', '<', cutoffAudit)
      .limit(500)
      .get()

    let logsDeleted = 0
    for (const doc of oldAuditLogs.docs) {
      await doc.ref.delete()
      logsDeleted++
    }

    logger.info('cleanupRetention.done', {
      deletedAccounts: deleted,
      auditLogs: logsDeleted,
      at: now.toDate().toISOString(),
    })
  },
)
