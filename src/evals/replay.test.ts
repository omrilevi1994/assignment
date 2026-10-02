import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { loadCases } from "./case";
import { judgeAnswer } from "./judge";
import { expandRuns, loadMatrix } from "./matrix";
import { recordingGateway } from "./recording";
import { formatTables } from "./report";
import { runEvaluation } from "./runner";
import { runStrategy } from "./strategies";
import type { CaseResult } from "./types";

/** Reads the reviewed baseline directly; local run outputs never choose the expected result. */
function recordedMatrix(): CaseResult[] {
  const file = new URL("../../evals/results/baseline.json", import.meta.url);
  const report = JSON.parse(readFileSync(file, "utf8")) as { results: CaseResult[] };
  return report.results;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("reproduces the complete recorded matrix tables without credentials or network", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  vi.stubEnv("LLM_MODE", "live");
  const fetch = vi.fn(() => { throw new Error("Replay must not contact a provider."); });
  vi.stubGlobal("fetch", fetch);
  const gateway = recordingGateway();
  const runs = expandRuns(loadMatrix(), "all");
  const results = await runEvaluation(runs, loadCases(), { mode: "replay", judge: true,
    strategy: (run, item, deps) => runStrategy(run, item, deps, gateway.call),
    judgeCall: (model, item, result, deps) => judgeAnswer(model, item, result, deps, gateway.call),
  });
  expect(results).toHaveLength(runs.reduce((total, run) => total + run.cases.length, 0));
  const saved = recordedMatrix();
  expect(saved).toHaveLength(results.length);
  expect(results.filter((row) => row.status === "failed" || row.judgeError)).toEqual([]);
  expect(formatTables(results)).toBe(formatTables(saved));
  expect(fetch).not.toHaveBeenCalled();
});
