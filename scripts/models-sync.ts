import { writeFileSync } from "node:fs";
import path from "node:path";
import { fetchRegistry, serializeRegistry } from "../src/llm/registry";

const SNAPSHOT_PATH = path.resolve("src/llm/models.snapshot.json");

/** Fetches OpenRouter's public model list and rewrites the committed price snapshot. */
async function main(): Promise<void> {
  const models = await fetchRegistry();
  writeFileSync(SNAPSHOT_PATH, serializeRegistry(models));
  console.log(`Wrote ${models.length} priced models to ${path.relative(process.cwd(), SNAPSHOT_PATH)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
