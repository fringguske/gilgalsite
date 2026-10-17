import { sql } from 'drizzle-orm'
import type { DbExecutor } from '../../Data/AppDbContext'

const LockNamespace = 20_260_809 // 2_026_080_9

/** Serializes concurrent username claims with a transaction-scoped advisory lock. */
export const UsernameReservationLock = Object.freeze({
  async acquireAsync(db: DbExecutor, normalizedUsername: string): Promise<void> {
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${normalizedUsername}, ${LockNamespace}))`)
  },
})
