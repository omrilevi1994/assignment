import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrl } from "./url";

/**
 * Opens a connection pool to `url` and wraps it in Drizzle. Prepared
 * statements are off because the Supabase transaction pooler (port 6543)
 * does not support them; Compose Postgres does not mind either way.
 */
export function createDb(url: string) {
  return drizzle(postgres(url, { prepare: false }), { schema });
}

export type Database = ReturnType<typeof createDb>;

// Kept on globalThis so `next dev` reloads reuse one pool instead of opening a new one each time.
const shared = globalThis as typeof globalThis & { eventIntelDb?: Database };

/** The process-wide database, created from DATABASE_URL on first use. */
export function getDb(): Database {
  shared.eventIntelDb ??= createDb(databaseUrl());
  return shared.eventIntelDb;
}
