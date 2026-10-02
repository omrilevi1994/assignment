import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fixtureKey, readFixture, writeFixture } from "./fixtures";
import { type StageRequest, runStage } from "./gateway";
import { type ModelInfo, costFromUsage, findModel, loadRegistry } from "./registry";

const testModel: ModelInfo = {
  id: "acme/test-model",
  name: "Acme: Test Model",
  promptUsdPerToken: 0.000002,
  completionUsdPerToken: 0.000008,
  contextLength: 32000,
};
const registry = [testModel];

const schema = z.object({ answer: z.string() });

const req: StageRequest<{ answer: string }> = {
  stage: "answer",
  model: testModel.id,
  schema,
  system: "Answer in one word.",
  input: "What colour is the sky?",
};

/** A mock model that answers every call with the given text. */
function mockModel(text: string, finishReason: "stop" | "length" = "stop"): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: finishReason, raw: undefined },
      usage: {
        inputTokens: { total: 1000, noCache: 1000, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 200, text: 200, reasoning: undefined },
      },
      warnings: [],
      providerMetadata: { openrouter: { usage: { cost: 0.0021 } } },
    }),
  });
}

/** A fetch that fails the test if the gateway ever reaches the network. */
function forbiddenFetch() {
  return vi.fn(async (): Promise<Response> => {
    throw new Error("the network must not be used");
  });
}

/** An OpenRouter chat completion whose message is the given text. */
function completion(content: string): Response {
  return Response.json({
    id: "gen-1",
    created: 1790000000,
    model: testModel.id,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 },
  });
}

/** An OpenRouter error response with the given HTTP status. */
function failure(status: number): Response {
  return Response.json({ error: { code: status, message: `upstream said ${status}` } }, { status });
}

/** A fetch that answers each call with the next response from the list. */
function scriptedFetch(...responses: Array<() => Response>) {
  let call = 0;
  return vi.fn(async (): Promise<Response> => responses[Math.min(call++, responses.length - 1)]());
}

// 1 000 input tokens at $2/M plus 200 output tokens at $8/M.
const expectedCost = 0.002 + 0.0016;

let dir: string;
let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "llm-gateway-"));
  sleep = vi.fn(async () => {});
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("runStage in replay mode", () => {
  it("returns the recorded object and its cost without touching the network", async () => {
    writeFixture(dir, fixtureKey(req), {
      stage: req.stage,
      model: req.model,
      system: req.system,
      input: req.input,
      object: { answer: "Blue" },
      usage: { inputTokens: 1000, outputTokens: 200 },
      raw: '{"answer":"Blue"}',
      recordedAt: "2026-10-02T12:00:00.000Z",
    });
    const fetchImpl = forbiddenFetch();

    const result = await runStage(req, { mode: "replay", fixtureDir: dir, registry, fetchImpl });

    expect(result).toMatchObject({
      object: { answer: "Blue" },
      usage: { inputTokens: 1000, outputTokens: 200 },
      raw: '{"answer":"Blue"}',
      model: testModel.id,
      source: "replay",
    });
    expect(result.costUsd).toBeCloseTo(expectedCost, 12);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("names the missing fixture key and never calls the network", async () => {
    const fetchImpl = forbiddenFetch();
    const run = runStage(req, { mode: "replay", fixtureDir: dir, registry, fetchImpl });
    await expect(run).rejects.toMatchObject({ kind: "provider_error", retried: false });
    await expect(run).rejects.toThrow(fixtureKey(req));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a recorded object that no longer fits the schema as invalid_output", async () => {
    writeFixture(dir, fixtureKey(req), {
      ...req,
      object: { reply: "Blue" },
      usage: { inputTokens: 1, outputTokens: 1 },
      raw: '{"reply":"Blue"}',
      recordedAt: "2026-10-02T12:00:00.000Z",
    });
    await expect(runStage(req, { mode: "replay", fixtureDir: dir, registry })).rejects.toMatchObject({
      kind: "invalid_output",
    });
  });

  it("is the mode used when LLM_MODE is unset", async () => {
    vi.stubEnv("LLM_MODE", undefined);
    const fetchImpl = forbiddenFetch();
    await expect(runStage(req, { fixtureDir: dir, registry, fetchImpl })).rejects.toThrow(fixtureKey(req));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an LLM_MODE it does not know", async () => {
    vi.stubEnv("LLM_MODE", "offline");
    await expect(runStage(req, { fixtureDir: dir, registry })).rejects.toThrow(/LLM_MODE/);
  });
});

describe("the committed smoke fixture", () => {
  it("replays from fixtures/llm with the snapshot registry and no API key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", undefined);
    vi.stubEnv("LLM_FIXTURE_DIR", undefined);
    const fetchImpl = forbiddenFetch();
    const smoke = {
      stage: "smoke",
      model: "openai/gpt-4o-mini",
      schema,
      system: "You answer questions with a JSON object whose only field is answer.",
      input: "What is the capital of France? Answer with the city name only.",
    };

    const result = await runStage(smoke, { mode: "replay", fetchImpl });

    expect(result).toMatchObject({ object: { answer: "Paris" }, source: "replay", model: smoke.model });
    expect(result.costUsd).toBe(costFromUsage(findModel(loadRegistry(), smoke.model), result.usage));
    expect(result.costUsd).toBeGreaterThan(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("runStage in record mode", () => {
  it("writes a fixture that replay then reads back", async () => {
    const recorded = await runStage(req, {
      mode: "record",
      fixtureDir: dir,
      registry,
      languageModel: mockModel('{"answer":"Blue"}'),
    });
    expect(recorded).toMatchObject({ object: { answer: "Blue" }, source: "live" });

    const fixture = readFixture(dir, fixtureKey(req));
    expect(fixture).toMatchObject({
      stage: req.stage,
      model: req.model,
      system: req.system,
      input: req.input,
      object: { answer: "Blue" },
      usage: { inputTokens: 1000, outputTokens: 200 },
      raw: '{"answer":"Blue"}',
    });
    expect(new Date(fixture?.recordedAt ?? "").toISOString()).toBe(fixture?.recordedAt);

    const fetchImpl = forbiddenFetch();
    const replayed = await runStage(req, { mode: "replay", fixtureDir: dir, registry, fetchImpl });
    expect(replayed).toMatchObject({ object: recorded.object, usage: recorded.usage, raw: recorded.raw, source: "replay" });
    expect(replayed.costUsd).toBeCloseTo(recorded.costUsd, 12);
    expect(recorded.billedCostUsd).toBe(0.0021);
    expect(fixture?.billedCostUsd).toBe(0.0021);
    expect(replayed.billedCostUsd).toBe(0.0021);
    expect(fixture?.latencyMs).toBe(recorded.latencyMs);
    expect(replayed.latencyMs).toBe(recorded.latencyMs);
  });
});

describe("runStage in live mode", () => {
  it("returns the parsed object with usage, cost and raw text, and records nothing", async () => {
    const languageModel = mockModel('{"answer":"Blue"}');

    const result = await runStage(req, { mode: "live", fixtureDir: dir, registry, languageModel });

    expect(result).toMatchObject({
      object: { answer: "Blue" },
      usage: { inputTokens: 1000, outputTokens: 200 },
      raw: '{"answer":"Blue"}',
      model: testModel.id,
      source: "live",
    });
    expect(result.costUsd).toBeCloseTo(expectedCost, 12);
    expect(readdirSync(dir)).toEqual([]);
    const [call] = languageModel.doGenerateCalls;
    expect(call.prompt).toEqual([
      { role: "system", content: req.system },
      { role: "user", content: [{ type: "text", text: req.input }] },
    ]);
    expect(call.responseFormat).toMatchObject({ type: "json", schema: { type: "object" } });
  });

  it("calls OpenRouter's chat endpoint with the key from OPENROUTER_API_KEY and a JSON schema", async () => {
    const fetchImpl = scriptedFetch(() => completion('{"answer":"Blue"}'));

    const result = await runStage(req, { mode: "live", fixtureDir: dir, registry, fetchImpl, sleep });

    expect(result.object).toEqual({ answer: "Blue" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: testModel.id,
      response_format: { type: "json_schema" },
    });
  });

  it("fails with provider_error, before any request, when OPENROUTER_API_KEY is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", undefined);
    const fetchImpl = forbiddenFetch();
    const run = runStage(req, { mode: "live", fixtureDir: dir, registry, fetchImpl, sleep });
    await expect(run).rejects.toMatchObject({ kind: "provider_error", retried: false });
    await expect(run).rejects.toThrow(/OPENROUTER_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a model id that is not in the registry before calling anything", async () => {
    const languageModel = mockModel('{"answer":"Blue"}');
    const run = runStage({ ...req, model: "acme/missing" }, { mode: "live", registry, languageModel });
    await expect(run).rejects.toThrow(/acme\/missing/);
    expect(languageModel.doGenerateCalls).toHaveLength(0);
  });
});

describe("runStage errors and retries", () => {
  it("retries a provider 5xx once, then surfaces provider_error with retried: true", async () => {
    const fetchImpl = scriptedFetch(() => failure(500), () => failure(500));

    const run = runStage(req, { mode: "live", fixtureDir: dir, registry, fetchImpl, sleep });

    await expect(run).rejects.toMatchObject({ name: "GatewayError", kind: "provider_error", retried: true, status: 500 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("returns the answer when the retry after a 429 succeeds", async () => {
    const fetchImpl = scriptedFetch(() => failure(429), () => completion('{"answer":"Blue"}'));
    const result = await runStage(req, { mode: "live", fixtureDir: dir, registry, fetchImpl, sleep });
    expect(result.object).toEqual({ answer: "Blue" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 400", async () => {
    const fetchImpl = scriptedFetch(() => failure(400));
    const run = runStage(req, { mode: "live", fixtureDir: dir, registry, fetchImpl, sleep });
    await expect(run).rejects.toMatchObject({ kind: "provider_error", retried: false, status: 400 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each([
    ["whitespace that ends normally", "  \n", "stop"],
    ["nothing, cut off by the token limit", "", "length"],
  ] as const)("maps an answer of %s to empty_output without retrying", async (_label, text, finishReason) => {
    const languageModel = mockModel(text, finishReason);
    const run = runStage(req, { mode: "live", fixtureDir: dir, registry, languageModel, sleep });
    await expect(run).rejects.toMatchObject({ kind: "empty_output", retried: false });
    expect(languageModel.doGenerateCalls).toHaveLength(1);
  });

  it("maps an answer that does not match the schema to invalid_output without retrying", async () => {
    const languageModel = mockModel('{"answer": 42}');
    const run = runStage(req, { mode: "live", fixtureDir: dir, registry, languageModel, sleep });
    await expect(run).rejects.toMatchObject({ kind: "invalid_output", retried: false });
    expect(languageModel.doGenerateCalls).toHaveLength(1);
  });

  it("aborts a slow call after timeoutMs, retries once, then surfaces timeout", async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const run = runStage({ ...req, timeoutMs: 20 }, { mode: "live", fixtureDir: dir, registry, fetchImpl, sleep });
    await expect(run).rejects.toMatchObject({ kind: "timeout", retried: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
