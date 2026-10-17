import { defineConfig } from 'drizzle-kit'

// Used only to re-introspect src/ConstructionMS.Infrastructure/Data/schema.ts after a
// reviewed change to database/supabase-schema.sql. The SQL file remains the source of truth.
export default defineConfig({
  dialect: 'postgresql',
  out: './drizzle-introspection',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  schemaFilter: ['public'],
})
