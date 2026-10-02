import { describe, expect, it, vi } from "vitest";
import type { StageRequest, StageResult, runStage } from "@/llm/gateway";
import { loadPrompt } from "@/pipeline/prompts";
import { loadCases } from "./case";
import { buildJudgeInput, CORE_CRITERIA, judgeAnswer } from "./judge";
import { recordingGateway } from "./recording";
import type { StrategyResult } from "./types";

const item = loadCases().find((entry) => entry.id === "interest-rates-no-evidence")!;
const result: StrategyResult = { status: "ok", answer: { summary: "No evidence.", facts: [], analysis: [], evidence_level: "none", missing_info: "Rate forecasts.", follow_ups: [] }, standaloneQuestion: item.question, stages: [], verifyReport: null, error: null };

function fakeGateway(scores: unknown) {
  const mock = vi.fn(async <T>(request: StageRequest<T>): Promise<StageResult<T>> => ({ object: request.schema.parse({ scores }), usage: { inputTokens: 10, outputTokens: 10 }, costUsd: 0.01, latencyMs: 100, raw: "{}", model: request.model, source: "replay" }));
  return mock as typeof mock & typeof runStage;
}

describe("eval judge", () => {
  it("receives evidence and candidate but never either strategy system prompt", () => {
    const input = buildJudgeInput(item, result);
    expect(input).toContain("evt_030");
    expect(input).toContain(item.question);
    expect(input).toContain(CORE_CRITERIA[0]);
    expect(input).not.toContain(loadPrompt("answer").text);
    expect(input).not.toContain(loadPrompt("single").text);
  });
  it("scores every criterion and retains the judge's separate cost and latency", async () => {
    const scores = [...CORE_CRITERIA, ...item.judge].map((criterion) => ({ criterion, score: 2, reason: "Correctly reports insufficient evidence." }));
    const call = fakeGateway(scores);
    const judgment = await judgeAnswer("openai/gpt-4.1", item, result, { mode: "replay" }, call);
    expect(judgment.mean).toBe(2);
    expect(judgment.record).toMatchObject({ stage: "judge", costUsd: 0.01 });
    expect(call.mock.calls[0][0].stage).toBe("judge");
  });
  it("rejects missing criteria instead of reporting an inflated score", async () => {
    await expect(judgeAnswer("openai/gpt-4.1", item, result, { mode: "replay" }, fakeGateway([]))).rejects.toThrow(/every requested criterion/);
  });
});

describe("eval recording session", () => {
  it("never applies a spending cap to expensive historical replay fixtures", async () => {
    const base = fakeGateway([]);
    const call: typeof runStage = async (request) => ({ ...await base(request), object: request.schema.parse({ scores: [] }), costUsd: 6, billedCostUsd: 6 });
    const gateway = recordingGateway(call);
    const request = { stage: "judge", model: "openai/gpt-4.1", schema: (await import("./judge")).JudgeOutputSchema, system: "Evaluate.", input: "First." };
    await gateway.call(request, { mode: "replay" });
    await expect(gateway.call({ ...request, input: "Second." }, { mode: "replay" })).resolves.toBeDefined();
    expect(gateway.costUsd()).toBe(12);
    expect(gateway.newCallCostUsd()).toBe(0);
  });
  it("reuses identical calls so repeated selection cannot overwrite earlier fixtures", async () => {
    const call = fakeGateway([]);
    const gateway = recordingGateway(call);
    const request = { stage: "judge", model: "openai/gpt-4.1", schema: (await import("./judge")).JudgeOutputSchema, system: "Evaluate.", input: "Data." };
    const results = await Promise.all([gateway.call(request), gateway.call(request)]);
    expect(results[0]).toEqual(results[1]);
    expect(call).toHaveBeenCalledTimes(1);
    expect(gateway.costUsd()).toBe(0.01);
  });
});
