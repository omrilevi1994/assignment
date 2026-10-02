import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/** The stages that have a versioned system prompt. */
export type PromptName = "select" | "answer";

/** A system prompt as loaded from `prompts/<name>.v<N>.txt`. */
export type Prompt = { name: PromptName; version: number; text: string; hash: string };

/** Where the committed prompt files live, relative to the repository root the app runs from. */
export const PROMPTS_DIR = path.resolve(process.cwd(), "prompts");

/** The version numbers present in `dir` for a prompt, from file names such as `select.v2.txt`. */
function versionsOf(name: PromptName, dir: string): number[] {
  const pattern = new RegExp(`^${name}\\.v(\\d+)\\.txt$`);
  return readdirSync(dir).flatMap((file) => {
    const match = pattern.exec(file);
    return match ? [Number(match[1])] : [];
  });
}

/** First 12 hex characters of the sha256 of the text: short enough for a trace, long enough to tell versions apart. */
function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/**
 * Loads the highest version of a prompt from `dir` (the committed `prompts/`
 * by default). Throws when no version exists, naming the prompt and directory.
 */
export function loadPrompt(name: PromptName, dir: string = PROMPTS_DIR): Prompt {
  const versions = versionsOf(name, dir);
  if (versions.length === 0) throw new Error(`No prompt file for "${name}" in ${dir}; expected ${name}.v1.txt.`);
  const version = Math.max(...versions);
  const text = readFileSync(path.join(dir, `${name}.v${version}.txt`), "utf8");
  return { name, version, text, hash: hashOf(text) };
}

/** How a prompt is named in a trace, e.g. `select v1 · 3f2a9c0d1e2b`. */
export function promptLabel(prompt: Prompt): string {
  return `${prompt.name} v${prompt.version} · ${prompt.hash}`;
}
