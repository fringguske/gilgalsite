import { existsSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import type { AppDbContext } from '@/ConstructionMS.Infrastructure/Data/AppDbContext'

/** Loads .env.local / .env for command-line tools (Next.js does this itself for the web app). */
export function loadLocalEnvironment(): void {
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) process.loadEnvFile(file)
  }
}

/** Replaces EF's GetPendingMigrationsAsync() check: the Supabase schema script must have been applied. */
export async function requireSchemaAsync(db: AppDbContext, command: string): Promise<void> {
  const [row] = await db.execute<{ ready: boolean }>(sql`
    SELECT to_regclass('public."Users"') IS NOT NULL
       AND EXISTS (SELECT 1 FROM "Roles" WHERE "RoleName" = 'Administrator') AS ready`)
  if (!row?.ready) {
    throw new Error(`Apply database/supabase-schema.sql before running ${command}.`)
  }
}
