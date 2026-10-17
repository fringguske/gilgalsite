import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as tables from './schema'
import * as relations from './relations'

/**
 * Replaces the EF Core AppDbContext. `db.query.<table>.findMany({ with: ... })`
 * is the `.Include(...)` equivalent; `db.select()/insert()/update()` are the
 * LINQ/SaveChanges equivalents; `db.transaction(fn, { isolationLevel })` is
 * `BeginTransactionAsync(IsolationLevel.X)`.
 *
 * The append-only and source-immutability rules that EF enforced in
 * SaveChanges are enforced by the PostgreSQL triggers in
 * database/supabase-schema.sql, so they hold for every writer.
 */
export const schema = { ...tables, ...relations }

export type AppDbContext = PostgresJsDatabase<typeof schema>
export type AppDbTransaction = Parameters<Parameters<AppDbContext['transaction']>[0]>[0]
/** Either the root context or an open transaction; services accept both. */
export type DbExecutor = AppDbContext | AppDbTransaction

export const IsolationLevel = Object.freeze({
  ReadCommitted: 'read committed',
  RepeatableRead: 'repeatable read',
  Serializable: 'serializable',
} as const)

const globalForDb = globalThis as unknown as { constructionMsDb?: AppDbContext; constructionMsSql?: postgres.Sql }

function createAppDbContext(): AppDbContext {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString || connectionString.trim() === '') {
    throw new Error(
      'The DATABASE_URL connection string is required. Use .env.local for local development ' +
      'or the Vercel project environment variables when deployed.')
  }

  // Supabase's transaction pooler (port 6543) does not support prepared statements.
  const client = postgres(connectionString, {
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  })
  globalForDb.constructionMsSql = client
  return drizzle(client, { schema, casing: undefined })
}

/** One pooled client per server instance (reused across warm serverless invocations). */
export function getAppDbContext(): AppDbContext {
  globalForDb.constructionMsDb ??= createAppDbContext()
  return globalForDb.constructionMsDb
}

export async function closeAppDbContext(): Promise<void> {
  await globalForDb.constructionMsSql?.end({ timeout: 5 })
  globalForDb.constructionMsDb = undefined
  globalForDb.constructionMsSql = undefined
}
