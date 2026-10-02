import type { CaseResult, RunSummary } from "./types";

/** True only when an answer exists and at least one deterministic check runs, with all passing. */
export function casePassed(result: CaseResult): boolean {
  return result.status !== "failed" && result.answer !== null && result.checks.length > 0 && result.checks.every((check) => check.pass);
}

/** The command fails on any deterministic or execution failure after preserving its report. */
export function evaluationPassed(results: CaseResult[]): boolean {
  return results.length > 0 && results.every((row) => casePassed(row) && row.judgeError === null);
}

/** Reduces one run with a case-level pass rate and an unweighted mean across judged cases. */
function summarize(rows: CaseResult[]): RunSummary {
  const first = rows[0];
  const judged = rows.flatMap((row) => row.judge ? [row.judge.mean] : []);
  return { run: first.run, strategy: first.strategy, selectModel: first.selectModel, answerModel: first.answerModel,
    cases: rows.length, passRate: rows.filter(casePassed).length / rows.length,
    judgeMean: judged.length ? judged.reduce((total, score) => total + score, 0) / judged.length : null,
    judgedCases: judged.length, judgeFailures: rows.filter((row) => row.judgeError !== null).length,
    costUsd: rows.reduce((total, row) => total + row.costUsd, 0),
    meanLatencyMs: rows.reduce((total, row) => total + row.latencyMs, 0) / rows.length };
}

/** Groups cases in first-seen order for reproducible summary tables. */
export function aggregateRuns(results: CaseResult[]): RunSummary[] {
  const groups = new Map<string, CaseResult[]>();
  for (const result of results) groups.set(result.run, [...(groups.get(result.run) ?? []), result]);
  return [...groups.values()].map(summarize);
}

/** Escapes user-derived text so tables retain their column and row boundaries. */
function cell(value: string | number): string {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ");
}

/** Renders a simple Markdown table suitable for local output and a PR body. */
function table(headers: string[], rows: Array<Array<string | number>>): string {
  const lines = [headers, headers.map(() => "---"), ...rows];
  return lines.map((row) => `| ${row.map(cell).join(" | ")} |`).join("\n");
}

/** Makes missing judgments visible instead of calling them disabled or averaging silently. */
function judgeScore(row: RunSummary): string {
  if (row.judgeMean === null) return row.judgeFailures ? "unavailable" : "off";
  const coverage = row.judgeFailures ? ` (${row.judgedCases}/${row.cases} scored)` : "";
  return `${row.judgeMean.toFixed(2)}/2${coverage}`;
}

/** Formats aggregate quality, cost including judging, and strategy-only latency. */
function runTable(results: CaseResult[]): string {
  return table(["run", "strategy", "select", "answer", "cases", "deterministic pass rate", "judge mean", "total cost", "mean latency"], aggregateRuns(results).map((row) => [
    row.run, row.strategy, row.strategy === "pipeline" ? row.selectModel : "—", row.answerModel, row.cases,
    `${(row.passRate * 100).toFixed(1)}%`, judgeScore(row),
    `$${row.costUsd.toFixed(4)}`, `${(row.meanLatencyMs / 1000).toFixed(2)} s`,
  ]));
}

/** Shows each default case, naming checks that failed instead of hiding them in a percentage. */
function caseTable(results: CaseResult[]): string {
  return table(["case", "check results", "evidence", "judge", "cost", "latency"], results.filter((row) => row.run === "default").map((row) => [
    row.caseId, row.error ?? row.checks.map((check) => `${check.name}: ${check.pass ? "pass" : "FAIL"}`).join(", "),
    row.answer?.evidence_level ?? "—", row.judgeError ?? (row.judge ? `${row.judge.mean.toFixed(2)}/2` : "off"),
    `$${row.costUsd.toFixed(4)}`, `${(row.latencyMs / 1000).toFixed(2)} s`,
  ]));
}

/** Both requested tables, stable across live and replay recordings. */
export function formatTables(results: CaseResult[]): string {
  return `${runTable(results)}\n\n${caseTable(results)}`;
}
