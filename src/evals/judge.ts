import { z } from "zod";
import { loadCompany, loadEvents } from "@/data/load";
import { renderCompanyProfile, renderFullList } from "@/domain/render";
import { type GatewayDeps, runStage } from "@/llm/gateway";
import { loadPrompt } from "@/pipeline/prompts";
import { toStageRecord } from "@/pipeline/stage";
import type { EvalCase } from "./case";
import type { JudgeResult, StrategyResult } from "./types";

export const CORE_CRITERIA = ["Facts and analytical inference are clearly separated.", "No unsupported general-knowledge claims leak into the answer.", "Company relevance is explained through the profile rather than merely repeating it."];
const ScoreSchema = z.object({ criterion: z.string().min(1), score: z.number().int().min(0).max(2), reason: z.string().min(1) });
export const JudgeOutputSchema = z.object({ scores: z.array(ScoreSchema) });

/** Evidence and the candidate are data for the judge; strategy system prompts are excluded. */
export function buildJudgeInput(evaluationCase: EvalCase, result: StrategyResult): string {
  return JSON.stringify({ criteria: [...CORE_CRITERIA, ...evaluationCase.judge], question: evaluationCase.question,
    history: evaluationCase.history, standaloneQuestion: result.standaloneQuestion, answer: result.answer,
    events: renderFullList(loadEvents()), companyProfile: renderCompanyProfile(loadCompany()) });
}

/** Rejects missing, repeated, reordered or invented criteria rather than quietly averaging them. */
function validateCriteria(scores: JudgeResult["scores"], expected: string[]): void {
  if (scores.length !== expected.length || scores.some((item, index) => item.criterion !== expected[index])) {
    throw new Error("Judge did not score every requested criterion in order.");
  }
}

/** Scores the case through the gateway without showing the judge any strategy prompt. */
export async function judgeAnswer(model: string, evaluationCase: EvalCase, result: StrategyResult, gateway: GatewayDeps, call: typeof runStage = runStage): Promise<JudgeResult> {
  const prompt = loadPrompt("judge");
  const output = await call({ stage: "judge", model, schema: JudgeOutputSchema, system: prompt.text,
    input: buildJudgeInput(evaluationCase, result), timeoutMs: 90_000 }, gateway);
  const scores = output.object.scores;
  validateCriteria(scores, [...CORE_CRITERIA, ...evaluationCase.judge]);
  return { scores, mean: scores.reduce((total, item) => total + item.score, 0) / scores.length, record: toStageRecord("judge", output, prompt) };
}
