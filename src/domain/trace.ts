import { z } from "zod";

/**
 * How a turn ended: `ok` when every stage succeeded, `degraded` when an answer
 * was produced but a stage fell back or verification flagged it, `failed` when
 * no answer was produced.
 */
export const TRACE_STATUSES = ["ok", "degraded", "failed"] as const;

export const TraceStatusSchema = z.enum(TRACE_STATUSES);

export type TraceStatus = z.infer<typeof TraceStatusSchema>;

const count = z.number().int().nonnegative();

/** What one pipeline stage cost and where its output came from. */
export const StageRecordSchema = z.object({
  stage: z.string().min(1),
  model: z.string().min(1),
  inputTokens: count,
  outputTokens: count,
  costUsd: z.number().nonnegative(),
  latencyMs: count,
  promptHash: z.string().min(1),
  source: z.string().min(1),
});

export type StageRecord = z.infer<typeof StageRecordSchema>;

/**
 * The record of one assistant turn: per-stage usage, the verification report
 * (opaque here, shaped by the verifier) and the totals shown in the trace view.
 */
export const TraceSchema = z.object({
  status: TraceStatusSchema,
  stages: z.array(StageRecordSchema),
  verifyReport: z.record(z.string(), z.unknown()).nullable(),
  totalCostUsd: z.number().nonnegative(),
  totalLatencyMs: count,
  error: z.string().nullable(),
});

export type Trace = z.infer<typeof TraceSchema>;
