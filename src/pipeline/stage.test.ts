import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StageRecordSchema } from "@/domain/trace";
import type { StageRequest, StageResult, runStage } from "@/llm/gateway";
import { loadPrompt, promptLabel } from "./prompts";
import { callStage, toStageRecord } from "./stage";

const schema = z.object({ answer: z.string() });

const result: StageResult<{ answer: string }> = {
  object: { answer: "Blue" },
  usage: { inputTokens: 1200, outputTokens: 80 },
  costUsd: 0.0006,
  latencyMs: 640,
  raw: '{"answer":"Blue"}',
  model: "acme/test-model",
  source: "replay",
};

describe("toStageRecord", () => {
  it("copies model, tokens, cost, latency and source and labels the prompt", () => {
    const prompt = loadPrompt("select");
    const record = toStageRecord("select", result, prompt);
    expect(record).toEqual({
      stage: "select",
      model: "acme/test-model",
      inputTokens: 1200,
      outputTokens: 80,
      costUsd: 0.0006,
      latencyMs: 640,
      promptHash: promptLabel(prompt),
      source: "replay",
    });
    expect(StageRecordSchema.parse(record)).toEqual(record);
  });
});

describe("callStage", () => {
  it("sends the prompt text as the system message and returns the object with its record", async () => {
    const seen: StageRequest<unknown>[] = [];
    const fake = (async <T>(req: StageRequest<T>) => {
      seen.push(req as StageRequest<unknown>);
      return result as unknown as StageResult<T>;
    }) as typeof runStage;
    const prompt = loadPrompt("answer");
    const gateway = { mode: "replay" as const };

    const outcome = await callStage(
      { stage: "answer", model: "acme/test-model", schema, prompt, input: "the input", timeoutMs: 1234 },
      { runStage: fake, gateway },
    );

    expect(seen).toEqual([
      { stage: "answer", model: "acme/test-model", schema, system: prompt.text, input: "the input", timeoutMs: 1234 },
    ]);
    expect(outcome.object).toEqual({ answer: "Blue" });
    expect(outcome.record).toMatchObject({ stage: "answer", promptHash: promptLabel(prompt) });
  });

  it("passes the gateway options through", async () => {
    let options: unknown;
    const fake = (async <T>(_req: StageRequest<T>, deps?: unknown) => {
      options = deps;
      return result as unknown as StageResult<T>;
    }) as typeof runStage;
    const gateway = { mode: "replay" as const, fixtureDir: "/tmp/somewhere" };
    await callStage(
      { stage: "select", model: "acme/test-model", schema, prompt: loadPrompt("select"), input: "x", timeoutMs: 1 },
      { runStage: fake, gateway },
    );
    expect(options).toBe(gateway);
  });
});
