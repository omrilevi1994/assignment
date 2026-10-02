/**
 * Model ids per stage. Selection uses a cheap, fast model that still follows
 * the reference-resolution rules; the answer uses a strong model. Both are
 * OpenRouter ids from the committed price snapshot, and the answer model must
 * accept the `oneOf` that the discriminated source union becomes in JSON Schema
 * (OpenAI strict structured output rejects it).
 */
export const DEFAULT_SELECT_MODEL = "google/gemini-2.5-flash";
export const DEFAULT_ANSWER_MODEL = "google/gemini-2.5-pro";

/** Per-stage timeouts. The answer model reasons before it writes, so it gets longer. */
export const SELECT_TIMEOUT_MS = 30_000;
export const ANSWER_TIMEOUT_MS = 90_000;

/** The model named by an environment variable, or the fallback when it is unset or blank. */
export function modelFromEnv(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? fallback : trimmed;
}

/** Model for the selection stage: `LLM_SELECT_MODEL`, else the default. */
export const SELECT_MODEL = modelFromEnv(process.env.LLM_SELECT_MODEL, DEFAULT_SELECT_MODEL);

/** Model for the answer stage: `LLM_ANSWER_MODEL`, else the default. */
export const ANSWER_MODEL = modelFromEnv(process.env.LLM_ANSWER_MODEL, DEFAULT_ANSWER_MODEL);
