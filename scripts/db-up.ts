import { existsSync } from "node:fs";
import { databaseUrl } from "../src/db/url";
import { DatabaseStartupError, ensureDatabase } from "./db-startup";

/** Loads local configuration and prepares the database without changing Compose ownership. */
async function main(): Promise<void> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const result = await ensureDatabase(databaseUrl());
  console.log(result === "reused" ? "Database ready: reusing the configured connection." : "Database ready: Compose started.");
}

main().catch((error: unknown) => {
  console.error(error instanceof DatabaseStartupError ? error.message : "Database startup failed. Check your configuration.");
  process.exitCode = 1;
});
