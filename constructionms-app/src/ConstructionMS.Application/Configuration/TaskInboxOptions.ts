/** Operational timing for the derived task inbox and its in-app reminders. */
export interface TaskInboxOptions {
  defaultDueHours: number
  urgentDueHours: number
  handoverDueHours: number
  /** Informational on Vercel: the sweep cadence is the cron schedule in vercel.json. */
  notificationSweepMinutes: number
  initialNotificationDelaySeconds: number
}

function readInt(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number, setting: string): number {
  const raw = env[name]
  const value = raw === undefined || raw === '' ? fallback : Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`TaskInbox:${setting} must be between ${min} and ${max}.`)
  }
  return value
}

export const TaskInboxOptions = Object.freeze({
  SectionName: 'TaskInbox',

  /** Env: TASK_INBOX_DEFAULT_DUE_HOURS, TASK_INBOX_URGENT_DUE_HOURS, TASK_INBOX_HANDOVER_DUE_HOURS, ... */
  fromEnvironment(env: NodeJS.ProcessEnv = process.env): TaskInboxOptions {
    return {
      defaultDueHours: readInt(env, 'TASK_INBOX_DEFAULT_DUE_HOURS', 48, 1, 720, 'DefaultDueHours'),
      urgentDueHours: readInt(env, 'TASK_INBOX_URGENT_DUE_HOURS', 24, 1, 720, 'UrgentDueHours'),
      handoverDueHours: readInt(env, 'TASK_INBOX_HANDOVER_DUE_HOURS', 12, 1, 720, 'HandoverDueHours'),
      notificationSweepMinutes: readInt(env, 'TASK_INBOX_NOTIFICATION_SWEEP_MINUTES', 5, 1, 1_440, 'NotificationSweepMinutes'),
      initialNotificationDelaySeconds: readInt(env, 'TASK_INBOX_INITIAL_NOTIFICATION_DELAY_SECONDS', 30, 1, 3_600, 'InitialNotificationDelaySeconds'),
    }
  },
})
