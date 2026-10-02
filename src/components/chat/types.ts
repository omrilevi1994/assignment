import type { CompanyField } from "@/domain/company";
import type { Event } from "@/domain/event";
import type { AnswerOutput, Claim } from "@/domain/stages";
import type { StageRecord, TraceStatus } from "@/domain/trace";
import type { VerifyReport } from "@/domain/verify";

export interface EvidenceEntry { event: Event; reason: string }
export interface AnswerView {
  turnId: string;
  status: "ok" | "degraded";
  answer: AnswerOutput;
  standaloneQuestion: string;
  evidence: { cited: EvidenceEntry[]; considered: EvidenceEntry[] };
  verifyReport: VerifyReport;
  trace: {
    id: string;
    status: TraceStatus;
    stages: StageRecord[];
    totals: { costUsd: number; latencyMs: number; inputTokens: number; outputTokens: number };
  };
}
export interface ErrorView { kind: string; message: string }
export type LoadingStage = "select" | "answer" | "verify";
export interface ConversationSummary { id: string; title: string }
export interface InferenceGroup {
  claim: string;
  events: { event: Event; facts: Claim[] }[];
  profileFields: CompanyField[];
}
