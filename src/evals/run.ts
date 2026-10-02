import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadCases, type EvalCase } from "./case";
import { expandRuns, loadMatrix } from "./matrix";
import { parseOptions } from "./options";
import { aggregateRuns, evaluationPassed, formatTables } from "./report";
import { runEvaluation } from "./runner";
import { recordingGateway } from "./recording";
import { runStrategy } from "./strategies";
import { judgeAnswer } from "./judge";
import type { CaseResult } from "./types";

/** Rejects typos before spending and preserves the committed case order. */
function selectedCases(ids: string[]): EvalCase[] {
  const cases = loadCases();
  for (const id of ids) if (!cases.some((item) => item.id === id)) throw new Error(`Unknown case: ${id}`);
  return ids.length ? cases.filter((item) => ids.includes(item.id)) : cases;
}

/** Writes a timestamped report and its latest alias with explicit measurement semantics. */
function saveResults(results: CaseResult[], live: boolean, costs: { uniqueRecordedCostUsd: number; newCallCostUsd: number }): void {
  const timestamp = new Date().toISOString();
  const directory = path.resolve("evals/results");
  const report = { timestamp, ...costs, mode: live ? "record" : "replay", measurements: {
    cost: "Table costs are token usage priced with the committed model snapshot, including judge calls.",
    billing: "uniqueRecordedCostUsd is historical cost for distinct recordings. newCallCostUsd is newly completed provider-call billing (or a price estimate when unavailable), zero in replay. Timed-out attempts without a response are not included.",
    latency: "Recorded strategy stage latency; judge latency is separate in its record. Legacy recordings without latency report zero.",
  }, summaries: aggregateRuns(results), results };
  mkdirSync(directory, { recursive: true });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(path.join(directory, `${timestamp}.json`), json);
  writeFileSync(path.join(directory, "latest.json"), json);
}

/** Records only on explicit opt-in; otherwise replay never loads an API key from disk. */
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.live) process.loadEnvFile(".env.local");
  const cases = selectedCases(options.cases);
  const runs = expandRuns(loadMatrix(), options.runs);
  const gateway = recordingGateway();
  const results = await runEvaluation(runs, cases, {
    /** Reuses identical fixture inputs across matrix runs. */
    strategy: (run, item, deps) => runStrategy(run, item, deps, gateway.call),
    /** Reuses identical judgments without additional spending. */
    judgeCall: (model, item, result, deps) => judgeAnswer(model, item, result, deps, gateway.call),
    mode: options.live ? "record" : "replay", judge: options.judge,
    /** Writes progress to stderr, leaving stdout as reproducible tables. */
    onResult: (row) => console.error(`${row.run} · ${row.caseId} · ${row.status}${row.judgeError ? " · judge failed" : ""}`),
  });
  saveResults(results, options.live, { uniqueRecordedCostUsd: gateway.costUsd(), newCallCostUsd: gateway.newCallCostUsd() });
  console.log(formatTables(results));
  if (!evaluationPassed(results)) process.exitCode = 1;
}

main().catch(() => {
  console.error("Evaluation failed. Check the flags, matrix, fixtures and live-mode credentials.");
  process.exitCode = 1;
});
