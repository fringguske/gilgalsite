import { createLogger } from '@/ConstructionMS.Application/Common/Logger'
import { ServiceScope } from '../Program'

const logger = createLogger('OverdueNotificationWorker')

/**
 * The former BackgroundService sweep. Serverless functions cannot keep a PeriodicTimer
 * alive, so a scheduler (Vercel Cron or Supabase pg_cron) calls
 * /api/cron/overdue-notifications, which runs exactly one sweep per call.
 */
export const OverdueNotificationWorker = Object.freeze({
  async runSweepAsync(): Promise<number> {
    try {
      const scope = new ServiceScope(null)
      const inserted = await scope.inAppNotificationService.generateOverdueAsync()
      if (inserted > 0) {
        logger.information(`Generated ${inserted} overdue in-app notifications.`)
      }
      return inserted
    } catch (exception) {
      logger.error('Overdue in-app notification generation failed.', {}, exception)
      throw exception
    }
  },
})
