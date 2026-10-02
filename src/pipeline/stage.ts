import type { z } from "zod";
import type { StageRecord } from "@/domain/trace";
import type { GatewayDeps, StageResult, runStage } from "@/llm/gateway";
import { type Prompt, promptLabel } from "./prompts";

/** How a stage reaches the gateway; tests swap `runStage` for a fake. */
export type StageContext = { runStage: typeof runStage; gateway: GatewayDeps };

/** Everything one stage call needs: which model, which schema, which prompt and what input. */
export type StageCall<T> = {
  stage: "select" | "answer";
  model: string;
  schema: z.ZodType<T>;
  prompt: Prompt;
  input: string;
  timeoutMs: number;
};

/** What a stage produced: its schema-checked object and the trace record of the call. */
export type StageOutcome<T> = { object: T; record: StageRecord };

/** Turns a gateway result into the trace record of one stage, naming the prompt version it ran with. */
export function toStageRecord(stage: string, result: StageResult<unknown>, prompt: Prompt): StageRecord {
  return {
    stage,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
    promptHash: promptLabel(prompt),
    source: result.source,
  };
}

/** Runs one stage through the gateway with the prompt text as the system message. Gateway errors propagate. */
export async function callStage<T>(call: StageCall<T>, ctx: StageContext): Promise<StageOutcome<T>> {
  const { stage, model, schema, prompt, input, timeoutMs } = call;
  const result = await ctx.runStage({ stage, model, schema, system: prompt.text, input, timeoutMs }, ctx.gateway);
  return { object: result.object, record: toStageRecord(stage, result, prompt) };
}
