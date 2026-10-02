import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEvents } from "@/data/load";
import type { AnswerOutput } from "@/domain/stages";
import { loadCases } from "./case";
import { runChecks } from "./checks";
import { MatrixSchema, expandRuns, loadMatrix } from "./matrix";
import { parseOptions } from "./options";
import { aggregateRuns, evaluationPassed, formatTables } from "./report";
import { runEvaluation } from "./runner";
import { buildSingleInput, runStrategy } from "./strategies";
import type { CaseResult } from "./types";

const answer: AnswerOutput = { summary: "No evidence.", facts: [], analysis: [], evidence_level: "none", missing_info: "Rate guidance.", follow_ups: [] };
const evaluationCase = loadCases().find((item) => item.id === "interest-rates-no-evidence")!;

function fakeResult(overrides: Partial<CaseResult> = {}): CaseResult {
  return { run: "default", strategy: "pipeline", selectModel: "google/gemini-2.5-flash", answerModel: "google/gemini-2.5-pro", caseId: evaluationCase.id,
    status: "ok", standaloneQuestion: evaluationCase.question, answer, checks: [{ name: "evidence_level", pass: true, detail: "Allowed." }],
    judge: null, judgeError: null, stages: [], verifyReport: null, error: null, costUsd: 0.02, latencyMs: 1000, ...overrides };
}

afterEach(() => vi.unstubAllEnvs());

describe("eval matrix", () => {
  it("expands three answer models and both strategies over six comparison cases", () => {
    const matrix = loadMatrix();
    expect(matrix.comparison.cases).toHaveLength(6);
    expect(matrix.comparison.answerModels.length).toBeGreaterThanOrEqual(3);
    expect(expandRuns(matrix, "comparison")).toHaveLength(matrix.comparison.answerModels.length * 2);
    expect(expandRuns(matrix, "default")[0]).toMatchObject({ id: "default", strategy: "pipeline", answerModel: "google/gemini-2.5-pro" });
  });
  it("rejects a judge from the answer or select model family", () => {
    const matrix = loadMatrix();
    expect(MatrixSchema.safeParse({ ...matrix, judgeModel: "google/gemini-2.5-flash" }).success).toBe(false);
    expect(MatrixSchema.safeParse({ ...matrix, comparison: { ...matrix.comparison, answerModels: ["openai/gpt-4.1", "google/gemini-2.5-pro", "mistralai/mistral-small-3.2-24b-instruct"] } }).success).toBe(false);
  });
  it("rejects duplicate comparison models and unknown case ids", () => {
    const matrix = loadMatrix();
    expect(() => expandRuns({ ...matrix, comparison: { ...matrix.comparison, cases: ["missing-case"] } }, "comparison")).toThrow(/missing-case/);
    expect(MatrixSchema.safeParse({ ...matrix, comparison: { ...matrix.comparison, answerModels: Array(3).fill("google/gemini-2.5-pro") } }).success).toBe(false);
  });
});

describe("eval command options", () => {
  it("defaults to replay and a judge even when the environment requests live", () => {
    vi.stubEnv("LLM_MODE", "live");
    expect(parseOptions([])).toEqual({ live: false, runs: "default", cases: [], judge: true });
    expect(parseOptions(["--live", "--runs", "all", "--cases", "a,b", "--judge", "off"])).toEqual({ live: true, runs: "all", cases: ["a", "b"], judge: false });
  });
  it.each([["--runs", "bad"], ["--judge", "yes"], ["--cases"], ["--unknown"]])("rejects invalid flags %j", (...args) => {
    expect(() => parseOptions(args)).toThrow();
  });
});

describe("eval results", () => {
  it("includes failures in case pass rate and averages available judge scores", () => {
    const judged = { scores: [{ criterion: "Grounding", score: 2, reason: "Supported." }], mean: 2, record: { stage: "judge", model: "openai/gpt-4.1", inputTokens: 10, outputTokens: 10, costUsd: 0.01, latencyMs: 100, promptHash: "judge v1", source: "replay" } };
    const rows = [fakeResult({ judge: judged }), fakeResult({ status: "failed", answer: null, error: "provider_error", checks: [], costUsd: 0.01, latencyMs: 2000 })];
    expect(aggregateRuns(rows)[0]).toMatchObject({ cases: 2, passRate: 0.5, judgeMean: 2, costUsd: 0.03, meanLatencyMs: 1500 });
  });
  it("fails the command for deterministic, provider, judge or empty-run failures", () => {
    expect(evaluationPassed([fakeResult()])).toBe(true);
    expect(evaluationPassed([fakeResult({ checks: [{ name: "evidence_level", pass: false, detail: "Wrong level." }] })])).toBe(false);
    expect(evaluationPassed([fakeResult({ status: "failed", answer: null })])).toBe(false);
    expect(evaluationPassed([fakeResult({ judgeError: "Unavailable." })])).toBe(false);
    expect(evaluationPassed([])).toBe(false);
  });
  it("formats stable, escaped run and default-case tables", () => {
    const tables = formatTables([fakeResult({ caseId: "case|with\nline" })]);
    expect(tables).toContain("| run | strategy | select | answer | cases | deterministic pass rate | judge mean | total cost | mean latency |");
    expect(tables).toContain("| default | pipeline | google/gemini-2.5-flash | google/gemini-2.5-pro | 1 | 100.0% | off | $0.0200 | 1.00 s |");
    expect(tables).toContain("case\\|with line");
  });
  it("reports judge failure as unavailable while preserving deterministic results", async () => {
    const strategy = vi.fn(async () => ({ status: "ok" as const, answer, standaloneQuestion: evaluationCase.question, stages: [], verifyReport: null, error: null }));
    const judgeCall = vi.fn(async () => { throw new Error("unavailable"); });
    const run = expandRuns(loadMatrix(), "default")[0];
    const rows = await runEvaluation([run], [evaluationCase], { judge: true, mode: "replay", strategy, judgeCall });
    expect(rows[0].judgeError).toBeTruthy();
    expect(rows[0].checks.every((check) => check.pass)).toBe(true);
    expect(formatTables(rows)).toContain("| unavailable |");
  });
  it("aggregates fake strategy results without invoking a model", async () => {
    const strategy = vi.fn(async () => ({ status: "ok" as const, answer, standaloneQuestion: evaluationCase.question, stages: [], verifyReport: null, error: null }));
    const run = expandRuns(loadMatrix(), "default")[0];
    const rows = await runEvaluation([run], [evaluationCase], { judge: false, mode: "replay", strategy });
    expect(rows).toHaveLength(1);
    expect(rows[0].checks).toEqual([{ name: "evidence_level", pass: true, detail: 'Evidence level "none" is allowed.' }]);
    expect(strategy).toHaveBeenCalledTimes(1);
  });
});

describe("eval strategies", () => {
  it("includes all 30 complete events, company profile and conversation in the single-call input", () => {
    const input = buildSingleInput(evaluationCase);
    for (const event of loadEvents()) {
      expect(input).toContain(event.event_id);
      expect(input).toContain(event.summary);
    }
    expect(input.match(/^\[evt_\d{3}\]/gm)).toHaveLength(30);
    expect(input).toContain("<company_profile>");
    expect(input).toContain(evaluationCase.question);
  });
  it("preserves natural event mentions and renders an exported citation suffix once", () => {
    const history = [{ role: "assistant" as const, text: "The evt_001 outage matters. (cited: evt_001, evt_006)" }];
    const input = buildSingleInput({ ...evaluationCase, history });
    expect(input).toContain("Assistant: The evt_001 outage matters. (cited: evt_001, evt_006)");
    expect(input.match(/\(cited:/g)).toHaveLength(1);
    expect(input).not.toContain("(cited: evt_001, evt_006) (cited:");
  });
  it("replays the interest-rate case keylessly and only passes with no evidence", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", undefined);
    vi.stubEnv("LLM_MODE", "live");
    const result = await runStrategy(expandRuns(loadMatrix(), "default")[0], evaluationCase, { mode: "replay" });
    expect(result.answer?.evidence_level).toBe("none");
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0].source).toBe("replay");
    expect(runChecks(evaluationCase.expect, result.answer!)[0].pass).toBe(true);
    for (const evidence_level of ["partial", "strong"] as const) {
      expect(runChecks(evaluationCase.expect, { ...result.answer!, evidence_level })[0].pass).toBe(false);
    }
  });
});
