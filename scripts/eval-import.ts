import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb } from "../src/db/client";
import { listFeedbackWithTurns } from "../src/db/feedback";
import { databaseUrl } from "../src/db/url";
import { writeFeedbackDrafts } from "./eval-import-files";

/** Exports reports as drafts for review; the active eval loader ignores this directory. */
async function main(): Promise<void> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const db = createDb(databaseUrl());
  try {
    const records = await listFeedbackWithTurns(db);
    const dir = fileURLToPath(new URL("../evals/cases/drafts/", import.meta.url));
    const result = writeFeedbackDrafts(records, dir);
    console.log(`Feedback drafts: ${result.written} written, ${result.skipped} existing files skipped.`);
  } finally {
    await db.$client.end();
  }
}

main().catch(() => {
  console.error("Feedback import failed. Check the database connection and saved turn content.");
  process.exitCode = 1;
});
