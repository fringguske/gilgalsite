/**
 * Helpers for recognizing PostgreSQL errors (Npgsql PostgresException / EF
 * DbUpdateException equivalents). Drizzle wraps driver errors in
 * DrizzleQueryError, so the cause chain is walked like .NET InnerException.
 */
export const PostgresErrorCodes = Object.freeze({
  UniqueViolation: '23505',
  ForeignKeyViolation: '23503',
  CheckViolation: '23514',
  NotNullViolation: '23502',
  ExclusionViolation: '23P01',
  RaiseException: 'P0001',
  SerializationFailure: '40001',
  DeadlockDetected: '40P01',
  LockNotAvailable: '55P03',
})

export interface PostgresErrorLike {
  code: string
  constraint_name?: string
  table_name?: string
  message: string
}

export function findPostgresError(error: unknown): PostgresErrorLike | null {
  for (let current: unknown = error, depth = 0; current && depth < 10; depth++) {
    const candidate = current as { name?: string; code?: unknown; cause?: unknown; severity?: unknown }
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)
      && (candidate.name === 'PostgresError' || candidate.severity !== undefined)) {
      return candidate as unknown as PostgresErrorLike
    }
    current = candidate.cause
  }
  return null
}

/** True for a unique-index violation, optionally of one named constraint/index. */
export function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  const pg = findPostgresError(error)
  return pg?.code === PostgresErrorCodes.UniqueViolation
    && (constraintName === undefined || pg.constraint_name === constraintName)
}

/** Serialization failure or deadlock: the client may retry (Retry-After: 1). */
export function isRetryableDatabaseConflict(error: unknown): boolean {
  const code = findPostgresError(error)?.code
  return code === PostgresErrorCodes.SerializationFailure || code === PostgresErrorCodes.DeadlockDetected
}

/** EF DbUpdateException equivalent: an integrity/trigger rejection of a write. */
export function isDbUpdateError(error: unknown): boolean {
  const code = findPostgresError(error)?.code
  return code !== undefined && (code.startsWith('23') || code === PostgresErrorCodes.RaiseException)
}
