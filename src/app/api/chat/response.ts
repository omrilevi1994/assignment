import type { Database } from "@/db/client";
import { appendTurn, saveTrace } from "@/db/repository";
import type { TraceRow } from "@/db/schema";
import type { TurnResult } from "@/pipeline";
import { buildEvidence, storedEvidence } from "./evidence";

/** Exposes trace metadata and totals without internal errors or database bookkeeping. */
function responseTrace(trace: TraceRow) {
  return { id: trace.id, status: trace.status, stages: trace.stages, totals: {
    costUsd: trace.totalCostUsd, latencyMs: trace.totalLatencyMs,
    inputTokens: trace.stages.reduce((sum, stage) => sum + stage.inputTokens, 0),
    outputTokens: trace.stages.reduce((sum, stage) => sum + stage.outputTokens, 0),
  } };
}

/** Saves a failed attempt on the user turn, which remains available for retry. */
export async function failedResponse(result: TurnResult, conversationId: string, turnId: string, db: Database) {
  const trace = await saveTrace({ ...result.trace, turnId }, db);
  return Response.json({ error: result.error, conversationId, trace: responseTrace(trace) }, { status: 502 });
}

/** Persists the verified assistant turn and trace, then returns the full evidence view. */
export async function answeredResponse(result: TurnResult, conversationId: string, db: Database) {
  if (!result.answer || !result.verifyReport) throw new Error("Incomplete successful turn");
  const { answer, standaloneQuestion, selectedIds, verifyReport, status } = result;
  const evidence = buildEvidence(result, answer);
  const turn = await appendTurn({ conversationId, role: "assistant", content: {
    answer, standaloneQuestion, selectedIds, verifyReport, status, evidence: storedEvidence(evidence),
  } }, db);
  const trace = await saveTrace({ ...result.trace, turnId: turn.id }, db);
  return Response.json({ conversationId, turnId: turn.id, status, standaloneQuestion, answer,
    evidence, verifyReport, trace: responseTrace(trace) });
}
