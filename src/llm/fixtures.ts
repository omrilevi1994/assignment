import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** The inputs that identify one recorded call. */
export type FixtureCall = { stage: string; model: string; system: string; input: string };

/** One recorded call: the prompt and the answer side by side, so a reviewer can read both. */
export type FixtureRecord = FixtureCall & {
  object: unknown;
  usage: { inputTokens: number; outputTokens: number };
  raw: string;
  recordedAt: string;
  latencyMs?: number;
  billedCostUsd?: number;
};

const FixtureRecordSchema = z.object({
  stage: z.string(),
  model: z.string(),
  system: z.string(),
  input: z.string(),
  object: z.unknown(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  raw: z.string(),
  recordedAt: z.string(),
  latencyMs: z.number().int().nonnegative().optional(),
  billedCostUsd: z.number().nonnegative().optional(),
});

/** Where fixtures live when nothing else is configured, relative to the repo root. */
const DEFAULT_FIXTURE_DIR = "fixtures/llm";

/** sha256 hex of stage, model, system prompt and input; JSON encoding keeps the field boundaries. */
export function fixtureKey({ stage, model, system, input }: FixtureCall): string {
  return createHash("sha256")
    .update(JSON.stringify([stage, model, system, input]))
    .digest("hex");
}

/** The fixture directory: the explicit option, else `LLM_FIXTURE_DIR`, else `fixtures/llm`. */
export function fixtureDir(explicit?: string): string {
  return path.resolve(explicit || process.env.LLM_FIXTURE_DIR || DEFAULT_FIXTURE_DIR);
}

/** Path of the fixture file for a key. */
function fixturePath(dir: string, key: string): string {
  return path.join(dir, `${key}.json`);
}

/** Reads the fixture for a key, or undefined when none was recorded. Throws on a malformed file. */
export function readFixture(dir: string, key: string): FixtureRecord | undefined {
  const file = fixturePath(dir, key);
  if (!existsSync(file)) return undefined;
  return FixtureRecordSchema.parse(JSON.parse(readFileSync(file, "utf8"))) as FixtureRecord;
}

/** Writes the fixture for a key as indented JSON, creating the directory when needed. */
export function writeFixture(dir: string, key: string, record: FixtureRecord): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(fixturePath(dir, key), `${JSON.stringify(record, null, 2)}\n`);
}
