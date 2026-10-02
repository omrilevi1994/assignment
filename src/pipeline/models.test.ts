import { describe, expect, it } from "vitest";
import { findModel, loadRegistry } from "@/llm/registry";
import { ANSWER_MODEL, DEFAULT_ANSWER_MODEL, DEFAULT_SELECT_MODEL, SELECT_MODEL, modelFromEnv } from "./models";

describe("modelFromEnv", () => {
  it("falls back to the default when the variable is unset or blank", () => {
    expect(modelFromEnv(undefined, "acme/default")).toBe("acme/default");
    expect(modelFromEnv("", "acme/default")).toBe("acme/default");
    expect(modelFromEnv("   ", "acme/default")).toBe("acme/default");
  });

  it("uses the variable when it names a model", () => {
    expect(modelFromEnv(" acme/other ", "acme/default")).toBe("acme/other");
  });
});

describe("stage models", () => {
  it("default to models that are in the committed price snapshot", () => {
    expect(() => findModel(loadRegistry(), DEFAULT_SELECT_MODEL)).not.toThrow();
    expect(() => findModel(loadRegistry(), DEFAULT_ANSWER_MODEL)).not.toThrow();
  });

  it("use a different, stronger model for the answer than for the selection", () => {
    const registry = loadRegistry();
    const select = findModel(registry, DEFAULT_SELECT_MODEL);
    const answer = findModel(registry, DEFAULT_ANSWER_MODEL);
    expect(answer.completionUsdPerToken).toBeGreaterThan(select.completionUsdPerToken);
  });

  it("read LLM_SELECT_MODEL and LLM_ANSWER_MODEL, with the defaults as fallback", () => {
    expect(SELECT_MODEL).toBe(modelFromEnv(process.env.LLM_SELECT_MODEL, DEFAULT_SELECT_MODEL));
    expect(ANSWER_MODEL).toBe(modelFromEnv(process.env.LLM_ANSWER_MODEL, DEFAULT_ANSWER_MODEL));
  });
});
