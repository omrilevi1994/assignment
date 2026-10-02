import { z } from "zod";

/** Identifier of a row in the events workbook, e.g. `evt_007`. */
export const EventIdSchema = z.string().regex(/^evt_\d{3}$/, "expected an id like evt_001");

/**
 * One external event. Field names mirror the workbook columns so a citation
 * in an answer can be traced back to the source row without a mapping step.
 */
export const EventSchema = z.object({
  event_id: EventIdSchema,
  event_date: z.iso.date(),
  title: z.string().min(1),
  summary: z.string().min(1),
  region: z.string().min(1),
  domain: z.string().min(1),
  source_name: z.string().min(1),
  // Source URLs are placeholders in the exercise data, so only presence is checked.
  source_url: z.string().min(1),
});

export type Event = z.infer<typeof EventSchema>;
export type EventId = z.infer<typeof EventIdSchema>;
