import { z } from "zod";
import { TraceSchema } from "@/domain/trace";

/** Who wrote a turn. System prompts are built per request and never stored. */
export const TURN_ROLES = ["user", "assistant"] as const;

export const TurnRoleSchema = z.enum(TURN_ROLES);

export type TurnRole = z.infer<typeof TurnRoleSchema>;

/** A trace as `saveTrace` receives it: the pipeline's record plus the turn it belongs to. */
export const TraceInputSchema = TraceSchema.extend({
  turnId: z.string().min(1),
});

export type TraceInput = z.infer<typeof TraceInputSchema>;
