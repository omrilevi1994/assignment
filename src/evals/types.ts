import type { AnswerOutput } from "@/domain/stages";
import type { StageRecord, TraceStatus } from "@/domain/trace";
import type { VerifyReport } from "@/domain/verify";
import type { CheckResult } from "./checks";

export type Strategy = "pipeline" | "single-call";
export type RunGroup = "default" | "comparison" | "all";
export type EvalRun = { id: string; strategy: Strategy; selectModel: string; answerModel: string; judgeModel: string; cases: string[] };
export type StrategyResult = { status: TraceStatus; answer: AnswerOutput | null; standaloneQuestion: string; stages: StageRecord[]; verifyReport: VerifyReport | null; error: string | null };
export type JudgeScore = { criterion: string; score: number; reason: string };
export type JudgeResult = { scores: JudgeScore[]; mean: number; record: StageRecord };
export type CaseResult = StrategyResult & { run: string; strategy: Strategy; selectModel: string; answerModel: string; caseId: string; checks: CheckResult[]; judge: JudgeResult | null; judgeError: string | null; costUsd: number; latencyMs: number };
export type RunSummary = { run: string; strategy: Strategy; selectModel: string; answerModel: string; cases: number; passRate: number; judgeMean: number | null; judgedCases: number; judgeFailures: number; costUsd: number; meanLatencyMs: number };
