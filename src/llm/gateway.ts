import path from "node:path";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel, Output, generateText } from "ai";
import type { z } from "zod";
import { GatewayError, isRetryable, toGatewayError } from "./errors";
import { type FixtureRecord, fixtureDir, fixtureKey, readFixture, writeFixture } from "./fixtures";
import { type ModelInfo, type TokenUsage, costFromUsage, findModel, loadRegistry } from "./registry";

/** How the gateway reaches a model: call it, call it and record the answer, or serve recorded answers only. */
export type LLMMode = "live" | "record" | "replay";

/** One structured-output call made on behalf of a pipeline stage. */
export type StageRequest<T> = {
  stage: string;
  model: string;
  schema: z.ZodType<T>;
  system: string;
  input: string;
  timeoutMs?: number;
};

/** Injection points. Production code passes nothing; tests replace the network, the model or the clock. */
export type GatewayDeps = {
  mode?: LLMMode;
  fixtureDir?: string;
  registry?: ModelInfo[];
  fetchImpl?: typeof fetch;
  languageModel?: LanguageModel;
  sleep?: (ms: number) => Promise<void>;
};

/** The outcome of one stage call. */
export type StageResult<T> = {
  object: T;
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;
  raw: string;
  model: string;
  source: "live" | "replay";
};

/** What one call produced, live or replayed, before it is priced. */
type Answer<T> = { object: T; usage: TokenUsage; raw: string };

const MODES: readonly string[] = ["live", "record", "replay"];
const DEFAULT_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 500;

/** Reads `LLM_MODE`. Unset means replay, so tests and fresh checkouts never reach the network by accident. */
function modeFromEnv(value: string | undefined): LLMMode {
  if (!value) return "replay";
  if (!MODES.includes(value)) throw new Error(`LLM_MODE must be one of ${MODES.join(", ")}; got "${value}".`);
  return value as LLMMode;
}

/** Waits the given number of milliseconds. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The only place the provider is built. The key is read here, so replay never needs one. */
function openRouterModel(modelId: string, fetchImpl: typeof fetch | undefined): LanguageModel {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new GatewayError("provider_error", "OPENROUTER_API_KEY is not set; live and record modes need it.");
  return createOpenRouter({ apiKey, fetch: fetchImpl, compatibility: "strict" }).chat(modelId);
}

/** One attempt: a structured-output call with its own timeout and no SDK-level retries. */
async function callModel<T>(req: StageRequest<T>, model: LanguageModel): Promise<Answer<T>> {
  const result = await generateText({
    model,
    instructions: req.system,
    prompt: req.input,
    output: Output.object({ schema: req.schema }),
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  const usage = { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 };
  return { object: result.output, usage, raw: result.text };
}

/** Runs an attempt and, after a retryable failure, waits once and runs it again. Failures leave as GatewayError. */
async function withRetry<R>(attempt: () => Promise<R>, sleep: (ms: number) => Promise<void>): Promise<R> {
  try {
    return await attempt();
  } catch (first) {
    const error = toGatewayError(first, false);
    if (!isRetryable(error.kind, error.status)) throw error;
    await sleep(RETRY_DELAY_MS);
    try {
      return await attempt();
    } catch (second) {
      throw toGatewayError(second, true);
    }
  }
}

/** Serves a recorded answer. A missing fixture, or one that no longer fits the schema, fails without a network call. */
function fromFixture<T>(req: StageRequest<T>, dir: string, key: string): Answer<T> {
  const record = readFixture(dir, key);
  if (!record) {
    const where = path.join(dir, `${key}.json`);
    throw new GatewayError(
      "provider_error",
      `No fixture for stage "${req.stage}" and model "${req.model}" (key ${key}, expected at ${where}). Record it with LLM_MODE=record.`,
    );
  }
  const parsed = req.schema.safeParse(record.object);
  if (!parsed.success) {
    throw new GatewayError("invalid_output", `Fixture ${key} no longer matches the "${req.stage}" schema; record it again.`, {
      cause: parsed.error,
    });
  }
  return { object: parsed.data, usage: record.usage, raw: record.raw };
}

/** The fixture written in record mode: the prompt and the answer side by side. */
function toRecord<T>(req: StageRequest<T>, answer: Answer<T>): FixtureRecord {
  const { stage, model, system, input } = req;
  return { stage, model, system, input, ...answer, recordedAt: new Date().toISOString() };
}

/** Prices an answer and stamps it with latency, model and source. */
function toResult<T>(answer: Answer<T>, model: ModelInfo, startedAt: number, source: StageResult<T>["source"]): StageResult<T> {
  const latencyMs = Math.round(performance.now() - startedAt);
  return { ...answer, costUsd: costFromUsage(model, answer.usage), latencyMs, model: model.id, source };
}

/**
 * Runs one pipeline stage against a model and returns a schema-checked object with usage, cost and latency.
 * `replay` serves fixtures only, `record` calls the model and saves a fixture, `live` just calls the model.
 * Every model failure is thrown as a GatewayError; timeouts, 429 and 5xx are retried once.
 */
export async function runStage<T>(req: StageRequest<T>, deps: GatewayDeps = {}): Promise<StageResult<T>> {
  const mode = deps.mode ?? modeFromEnv(process.env.LLM_MODE);
  const model = findModel(deps.registry ?? loadRegistry(), req.model);
  const dir = fixtureDir(deps.fixtureDir);
  const key = fixtureKey(req);
  const startedAt = performance.now();
  if (mode === "replay") return toResult(fromFixture(req, dir, key), model, startedAt, "replay");
  const languageModel = deps.languageModel ?? openRouterModel(req.model, deps.fetchImpl);
  const answer = await withRetry(() => callModel(req, languageModel), deps.sleep ?? wait);
  if (mode === "record") writeFixture(dir, key, toRecord(req, answer));
  return toResult(answer, model, startedAt, "live");
}
