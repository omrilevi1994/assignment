import { describe, expect, it } from "vitest";
import { StageRecordSchema, TraceSchema, TraceStatusSchema, type StageRecord } from "./trace";

const selectStage: StageRecord = {
  stage: "select",
  model: "openai/gpt-4.1-mini",
  inputTokens: 1200,
  outputTokens: 80,
  costUsd: 0.0006,
  latencyMs: 640,
  promptHash: "3f2a9c",
  source: "live",
};

describe("trace schema", () => {
  it("accepts a successful trace with its stage records", () => {
    const trace = {
      status: "ok",
      stages: [selectStage, { ...selectStage, stage: "answer", outputTokens: 400 }],
      verifyReport: { unsupportedClaims: [] },
      totalCostUsd: 0.0012,
      totalLatencyMs: 1900,
      error: null,
    };
    expect(TraceSchema.parse(trace)).toEqual(trace);
  });

  it("accepts a failed trace with an error and no stages", () => {
    const trace = {
      status: "failed",
      stages: [],
      verifyReport: null,
      totalCostUsd: 0,
      totalLatencyMs: 12,
      error: "provider timeout",
    };
    expect(TraceSchema.parse(trace)).toEqual(trace);
  });

  it("knows only the ok, degraded and failed statuses", () => {
    expect(TraceStatusSchema.options).toEqual(["ok", "degraded", "failed"]);
    expect(TraceStatusSchema.safeParse("partial").success).toBe(false);
  });

  it("rejects a stage record with negative token counts", () => {
    expect(StageRecordSchema.safeParse({ ...selectStage, inputTokens: -1 }).success).toBe(false);
  });
});
