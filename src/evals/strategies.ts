import { loadCompany, loadEvents } from "@/data/load";
import { AnswerOutputSchema } from "@/domain/stages";
import { verify } from "@/domain/verify";
import { type GatewayDeps, runStage } from "@/llm/gateway";
import { runTurn, type HistoryTurn } from "@/pipeline";
import { buildAnswerInput } from "@/pipeline/answer";
import { ANSWER_TIMEOUT_MS } from "@/pipeline/models";
import { loadPrompt } from "@/pipeline/prompts";
import { toStageRecord } from "@/pipeline/stage";
import { safeError, settleStatus } from "@/pipeline/turn";
import type { EvalCase, Turn } from "./case";
import type { EvalRun, StrategyResult } from "./types";

/** Separates the canonical exported citation suffix while retaining natural event mentions. */
function historyTurn(turn: Turn): HistoryTurn {
  if (turn.role === "user") return turn;
  const suffix = / \(cited: (evt_\d{3}(?:, evt_\d{3})*)\)$/.exec(turn.text);
  const text = suffix ? turn.text.slice(0, suffix.index) : turn.text;
  const ids = suffix ? suffix[1].split(", ") : turn.text.match(/evt_\d{3}/g) ?? [];
  return { ...turn, text, citedIds: [...new Set(ids)] };
}

/** Carries the explicit event references in recorded history into the pipeline contract. */
function caseHistory(evaluationCase: EvalCase): HistoryTurn[] {
  return evaluationCase.history.map(historyTurn);
}

/** The baseline reads the full event catalogue with the same company and history context. */
export function buildSingleInput(evaluationCase: EvalCase): string {
  return buildAnswerInput({ question: evaluationCase.question, history: caseHistory(evaluationCase), events: loadEvents(), profile: loadCompany() });
}

/** Overrides stage models through the existing injection point without mutating process state. */
async function pipeline(run: EvalRun, evaluationCase: EvalCase, gateway: GatewayDeps, call: typeof runStage): Promise<StrategyResult> {
  const result = await runTurn(evaluationCase.question, caseHistory(evaluationCase), { gateway,
    /** Applies the matrix stage models. */
    runStage: (request, deps) => call({ ...request, model: request.stage === "select" ? run.selectModel : run.answerModel }, deps),
  });
  return { status: result.status, answer: result.answer, standaloneQuestion: result.standaloneQuestion,
    stages: result.trace.stages, verifyReport: result.verifyReport, error: result.error?.kind ?? null };
}

/** Runs the all-events baseline and applies exactly the same deterministic verifier. */
async function singleCall(run: EvalRun, evaluationCase: EvalCase, gateway: GatewayDeps, call: typeof runStage): Promise<StrategyResult> {
  const prompt = loadPrompt("single");
  const result = await call({ stage: "single", model: run.answerModel, schema: AnswerOutputSchema,
    system: prompt.text, input: buildSingleInput(evaluationCase), timeoutMs: ANSWER_TIMEOUT_MS }, gateway);
  const ids = loadEvents().map((event) => event.event_id);
  const verified = verify(result.object, ids, ids);
  return { status: settleStatus(verified.report), answer: verified.answer, standaloneQuestion: evaluationCase.question,
    stages: [toStageRecord("single", result, prompt)], verifyReport: verified.report, error: null };
}

/** Runs a strategy with explicit gateway mode and converts failures into reportable results. */
export async function runStrategy(run: EvalRun, evaluationCase: EvalCase, gateway: GatewayDeps, call: typeof runStage = runStage): Promise<StrategyResult> {
  try {
    return await (run.strategy === "pipeline" ? pipeline : singleCall)(run, evaluationCase, gateway, call);
  } catch (error) {
    return { status: "failed", answer: null, standaloneQuestion: evaluationCase.question, stages: [], verifyReport: null, error: safeError(error).kind };
  }
}
