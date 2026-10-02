/** The Postgres service from docker-compose.yml, used when DATABASE_URL is not set. */
export const DEFAULT_DATABASE_URL = "postgres://app:app@localhost:5432/event_intel";

/**
 * Returns the connection string from DATABASE_URL, or the local Compose
 * database when the variable is unset or empty.
 */
export function databaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}
