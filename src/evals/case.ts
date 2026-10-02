import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { EventIdSchema } from "@/domain/event";
import { EvidenceLevelSchema } from "@/domain/stages";

/** Directory of the committed case files at the repository root, one JSON file per case. */
export const CASES_DIR = fileURLToPath(new URL("../../evals/cases/", import.meta.url));

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** One earlier turn of the conversation that the case question follows. */
export const TurnSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1),
});

export type Turn = z.infer<typeof TurnSchema>;

/**
 * Deterministic expectations on an answer. Every list may be left out and then
 * sets no expectation. Unknown keys are rejected so that a misspelt
 * expectation fails loudly instead of never running.
 */
export const ExpectationsSchema = z.strictObject({
  /** Every id must be cited by a fact or an analysis claim. */
  must_cite: z.array(EventIdSchema).default([]),
  /** At least one id must be cited; ignored when empty. */
  must_cite_any: z.array(EventIdSchema).default([]),
  /** No id may be cited; ids absent from the data are allowed here on purpose. */
  must_not_cite: z.array(EventIdSchema).default([]),
  /** Evidence levels the answer may report; empty means any. */
  evidence_level: z.array(EvidenceLevelSchema).default([]),
  /** Case-insensitive phrases that must occur in the summary, facts or analysis. */
  must_mention: z.array(z.string().min(1)).default([]),
  /** Case-insensitive phrases that must not occur there. */
  must_not_mention: z.array(z.string().min(1)).default([]),
  /** When true the answer must state at least one fact. */
  facts_required: z.boolean().default(false),
});

export type Expectations = z.infer<typeof ExpectationsSchema>;

/**
 * One eval case: a question, the conversation before it, the deterministic
 * expectations and the soft criteria left to a judge.
 */
export const EvalCaseSchema = z.strictObject({
  id: z.string().min(1).regex(KEBAB_CASE, "expected a kebab-case id such as cloud-dependency-risk"),
  tags: z.array(z.string().min(1)),
  question: z.string().min(1),
  history: z.array(TurnSchema).default([]),
  expect: ExpectationsSchema.prefault({}),
  judge: z.array(z.string().min(1)).default([]),
});

export type EvalCase = z.infer<typeof EvalCaseSchema>;

/** Reads a file as JSON, naming the file when it cannot be read or parsed. */
function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read eval case ${path.basename(file)}: ${(error as Error).message}`, { cause: error });
  }
}

/** Reads and validates one case file, naming the file in any validation error. */
function readCaseFile(file: string): EvalCase {
  const result = EvalCaseSchema.safeParse(readJson(file));
  if (!result.success) {
    throw new Error(`Invalid eval case ${path.basename(file)}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Throws an error naming the first case id that appears more than once. */
export function assertUniqueCaseIds(cases: readonly EvalCase[]): void {
  const seen = new Set<string>();
  for (const { id } of cases) {
    if (seen.has(id)) throw new Error(`Duplicate eval case id: ${id}`);
    seen.add(id);
  }
}

/**
 * Loads every `*.json` file in `dir` as an eval case, validates each one,
 * rejects duplicate ids and returns the cases sorted by id.
 */
export function loadCases(dir: string = CASES_DIR): EvalCase[] {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const cases = files.map((name) => readCaseFile(path.join(dir, name)));
  assertUniqueCaseIds(cases);
  return cases.sort((a, b) => (a.id < b.id ? -1 : 1));
}
