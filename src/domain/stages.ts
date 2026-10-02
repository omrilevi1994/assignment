import { z } from "zod";
import { COMPANY_FIELDS } from "@/domain/company";
import { EventIdSchema } from "@/domain/event";

/**
 * Where a claim comes from: an event row, which is evidence, or a company
 * profile field, which is context for analysis only.
 */
export const SourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("event"), id: EventIdSchema }),
  z.object({ type: z.literal("company_profile"), field: z.enum(COMPANY_FIELDS) }),
]);

export type Source = z.infer<typeof SourceSchema>;

/**
 * Output of the selection stage. The question is rewritten to stand on its
 * own, and `gap` explains what is missing; it may be empty when answerable.
 */
export const SelectOutputSchema = z.object({
  standalone_question: z.string().min(1),
  answerable: z.boolean(),
  selected: z.array(z.object({ event_id: EventIdSchema, reason: z.string().min(1) })),
  gap: z.string(),
});

export type SelectOutput = z.infer<typeof SelectOutputSchema>;

/** How well the cited events support the answer as a whole. */
export const EvidenceLevelSchema = z.enum(["strong", "partial", "none"]);

export type EvidenceLevel = z.infer<typeof EvidenceLevelSchema>;

/** One statement in an answer together with the sources it relies on. */
export const ClaimSchema = z.object({
  claim: z.string().min(1),
  sources: z.array(SourceSchema),
});

export type Claim = z.infer<typeof ClaimSchema>;

/**
 * Output of the answer stage. `facts` must rest on cited events; `analysis`
 * holds interpretation that may also draw on the company profile.
 */
export const AnswerOutputSchema = z.object({
  summary: z.string(),
  facts: z.array(ClaimSchema),
  analysis: z.array(ClaimSchema),
  evidence_level: EvidenceLevelSchema,
  missing_info: z.string(),
  follow_ups: z.array(z.string()),
});

export type AnswerOutput = z.infer<typeof AnswerOutputSchema>;
