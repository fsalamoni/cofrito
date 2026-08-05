/**
 * Analytics — log de métricas.
 */

import { logger } from 'firebase-functions/v2'

export function logAnalytics(event: string, meta: Record<string, unknown> = {}): void {
  logger.info(`analytics.${event}`, meta)
}
