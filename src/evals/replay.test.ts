import { readFileSync, readdirSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { loadCases } from "./case";
import { judgeAnswer } from "./judge";
import { expandRuns, loadMatrix } from "./matrix";
import { recordingGateway } from "./recording";
import { formatTables } from "./report";
import { runEvaluation } from "./runner";
import { runStrategy } from "./strategies";
import type { CaseResult } from "./types";

/** Uses an immutable complete report; running a filtered CLI eval may replace latest.json. */
function recordedMatrix(expectedCount: number): CaseResult[] {
  const directory = new URL("../../evals/results/", import.meta.url);
  const reports = readdirSync(directory).filter((name) => /^\d{4}-.*\.json$/.test(name)).sort().reverse();
  for (const name of reports) {
    const report = JSON.parse(readFileSync(new URL(name, directory), "utf8")) as { results: CaseResult[] };
    if (report.results.length === expectedCount) return report.results;
  }
  throw new Error("Record a complete matrix before testing its replay.");
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
  const saved = recordedMatrix(results.length);
  expect(results.filter((row) => row.status === "failed" || row.judgeError)).toEqual([]);
  expect(formatTables(results)).toBe(formatTables(saved));
  expect(fetch).not.toHaveBeenCalled();
});
