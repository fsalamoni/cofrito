/**
 * Scheduled: agrega métricas diárias.
 * Roda diariamente à meia-noite.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore, Timestamp } from '../../services/firestore'
import { logger } from 'firebase-functions/v2'

export const aggregateAnalytics = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'America/Sao_Paulo' },
  async () => {
    const db = getFirestore()
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const usageRef = db.doc(`system/usage-daily/${today}`)
    await usageRef.set(
      {
        date: today,
        lastAggregatedAt: Timestamp.now(),
      },
      { merge: true },
    )
    logger.info('aggregateAnalytics.done', { date: today })
  },
)
