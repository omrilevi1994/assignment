import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { databaseReachable } from "../src/db/reachable";
import { DEFAULT_DATABASE_URL } from "../src/db/url";

const execute = promisify(execFile);

/** A safe startup message that can be printed without leaking a database URL or driver error. */
export class DatabaseStartupError extends Error {}

interface Dependencies {
  reachable?: typeof databaseReachable;
  start?: () => Promise<void>;
}

/** Starts the existing Compose service, with a deadline for Docker failures. */
async function startCompose(): Promise<void> {
  await execute("docker", ["compose", "up", "-d", "--wait", "db"], { timeout: 90_000 });
}

/** Reuses a working database and only starts Compose for the unavailable default local URL. */
export async function ensureDatabase(url: string, deps: Dependencies = {}): Promise<"reused" | "started"> {
  const reachable = deps.reachable ?? databaseReachable;
  if (await reachable(url)) return "reused";
  if (url !== DEFAULT_DATABASE_URL) {
    throw new DatabaseStartupError("Configured database is unavailable. Check DATABASE_URL and network access.");
  }
  try {
    await (deps.start ?? startCompose)();
  } catch {
    throw new DatabaseStartupError("Could not start the local database. Check that Docker is running.");
  }
  if (!await reachable(url)) {
    throw new DatabaseStartupError("Local database is still unavailable after Compose startup.");
  }
  return "started";
}
