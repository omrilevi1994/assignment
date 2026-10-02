import { z } from "zod";

/** A review note for a saved turn; whitespace is trimmed, never silently truncated. */
export const FeedbackInputSchema = z.strictObject({
  turnId: z.uuid(),
  note: z.string().trim().min(1).max(2000),
});

export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;
