import { describe, expect, it } from "vitest";
import { TraceInputSchema, TurnRoleSchema } from "./types";

describe("turn role", () => {
  it("accepts user and assistant", () => {
    expect(TurnRoleSchema.parse("user")).toBe("user");
    expect(TurnRoleSchema.parse("assistant")).toBe("assistant");
  });

  it("rejects system", () => {
    expect(TurnRoleSchema.safeParse("system").success).toBe(false);
  });
});

describe("trace input", () => {
  const failed = {
    status: "failed",
    stages: [],
    verifyReport: null,
    totalCostUsd: 0,
    totalLatencyMs: 5,
    error: "provider timeout",
  };

  it("is a trace tied to a turn", () => {
    expect(TraceInputSchema.parse({ ...failed, turnId: "t1" })).toEqual({ ...failed, turnId: "t1" });
  });

  it("rejects a trace without a turn id", () => {
    expect(TraceInputSchema.safeParse(failed).success).toBe(false);
  });
});
