import { existsSync } from "node:fs";
import { runMigrations } from "../src/db/migrate";
import { databaseUrl } from "../src/db/url";

const LOCAL_ENV_FILE = ".env.local";

/** Applies pending migrations to DATABASE_URL (from .env.local when present) or the Compose database. */
async function main(): Promise<void> {
  if (existsSync(LOCAL_ENV_FILE)) process.loadEnvFile(LOCAL_ENV_FILE);
  const url = databaseUrl();
  await runMigrations(url);
  console.log(`migrations applied to ${new URL(url).host}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
