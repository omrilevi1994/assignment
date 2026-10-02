import type { GatewayDeps } from "@/llm/gateway";
import type { EvalCase } from "./case";
import { runChecks } from "./checks";
import { judgeAnswer } from "./judge";
import { runStrategy } from "./strategies";
import type { CaseResult, EvalRun, JudgeResult, StrategyResult } from "./types";

export type RunnerOptions = GatewayDeps & { judge: boolean; strategy?: typeof runStrategy; judgeCall?: typeof judgeAnswer; onResult?: (result: CaseResult) => void };

/** Collects judge failures separately so successful answers remain available for inspection. */
async function judgeResult(run: EvalRun, item: EvalCase, result: StrategyResult, options: RunnerOptions): Promise<{ judge: JudgeResult | null; judgeError: string | null }> {
  if (!options.judge || !result.answer) return { judge: null, judgeError: null };
  try {
    const judge = await (options.judgeCall ?? judgeAnswer)(run.judgeModel, item, result, options);
    return { judge, judgeError: null };
  } catch {
    return { judge: null, judgeError: "Judge failed; no score available." };
  }
}

/** Executes one strategy and judge, retaining evidence, checks and all measured stages. */
async function evaluateCase(run: EvalRun, item: EvalCase, options: RunnerOptions): Promise<CaseResult> {
  const result = await (options.strategy ?? runStrategy)(run, item, options);
  const judgment = await judgeResult(run, item, result, options);
  return { ...result, ...judgment, run: run.id, strategy: run.strategy, selectModel: run.selectModel,
    answerModel: run.answerModel, caseId: item.id, checks: result.answer ? runChecks(item.expect, result.answer) : [],
    costUsd: result.stages.reduce((total, stage) => total + stage.costUsd, judgment.judge?.record.costUsd ?? 0),
    latencyMs: result.stages.reduce((total, stage) => total + stage.latencyMs, 0) };
}

/** Runs a bounded batch concurrently while returning results in matrix/case order. */
export async function runEvaluation(runs: EvalRun[], cases: EvalCase[], options: RunnerOptions): Promise<CaseResult[]> {
  const jobs = runs.flatMap((run) => cases.filter((item) => run.cases.includes(item.id)).map((item) => ({ run, item })));
  const results: CaseResult[] = [];
  for (let index = 0; index < jobs.length; index += 3) {
    const batch = await Promise.all(jobs.slice(index, index + 3).map(async ({ run, item }) => {
      const result = await evaluateCase(run, item, options);
      options.onResult?.(result);
      return result;
    }));
    results.push(...batch);
  }
  return results;
}
