import { loadEvents } from "@/data/load";
import type { Event } from "@/domain/event";
import { SELECT_CONTEXT_CHAR_BUDGET, renderCompact } from "@/domain/render";
import { type SelectOutput, SelectOutputSchema } from "@/domain/stages";
import { type HistoryTurn, renderHistory } from "./history";
import { SELECT_MODEL, SELECT_TIMEOUT_MS } from "./models";
import { loadPrompt } from "./prompts";
import { type StageContext, type StageOutcome, callStage } from "./stage";

/** What the selection stage reads: the user's question, the recent turns and the event catalogue. */
export type SelectInput = { question: string; history: readonly HistoryTurn[]; events: Event[] };

/**
 * Builds the selection stage's message: the recent conversation, the compact
 * catalogue of every event and the question, each in its own tagged section.
 * Throws when the catalogue outgrows the selection budget.
 */
export function buildSelectInput({ question, history, events }: SelectInput): string {
  const catalogue = renderCompact(events);
  if (catalogue.length > SELECT_CONTEXT_CHAR_BUDGET) {
    throw new Error(`The event catalogue is ${catalogue.length} characters, over the ${SELECT_CONTEXT_CHAR_BUDGET}-character selection budget.`);
  }
  return [
    `<conversation>\n${renderHistory(history)}\n</conversation>`,
    `<catalogue>\n${catalogue}\n</catalogue>`,
    `<question>\n${question.trim()}\n</question>`,
  ].join("\n\n");
}

/** Runs the selection stage over the committed events with the cheap model. */
export function runSelect(
  input: Omit<SelectInput, "events">,
  ctx: StageContext,
): Promise<StageOutcome<SelectOutput>> {
  return callStage(
    {
      stage: "select",
      model: SELECT_MODEL,
      schema: SelectOutputSchema,
      prompt: loadPrompt("select"),
      input: buildSelectInput({ ...input, events: loadEvents() }),
      timeoutMs: SELECT_TIMEOUT_MS,
    },
    ctx,
  );
}
