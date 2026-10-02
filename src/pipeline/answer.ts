import { loadCompany } from "@/data/load";
import type { CompanyProfile } from "@/domain/company";
import type { Event } from "@/domain/event";
import { renderCompanyProfile, renderFullList } from "@/domain/render";
import { type AnswerOutput, AnswerOutputSchema } from "@/domain/stages";
import { type HistoryTurn, renderHistory } from "./history";
import { ANSWER_MODEL, ANSWER_TIMEOUT_MS } from "./models";
import { loadPrompt } from "./prompts";
import { type StageContext, type StageOutcome, callStage } from "./stage";

/** What the answer stage reads: the standalone question, the recent turns, the selected events and the profile. */
export type AnswerInput = {
  question: string;
  history: readonly HistoryTurn[];
  events: Event[];
  profile: CompanyProfile;
};

/**
 * Builds the answer stage's message: the company profile field by field, the
 * selected events in full, the recent conversation and the standalone
 * question, each in its own tagged section.
 */
export function buildAnswerInput({ question, history, events, profile }: AnswerInput): string {
  return [
    `<company_profile>\n${renderCompanyProfile(profile)}\n</company_profile>`,
    `<selected_events>\n${renderFullList(events)}\n</selected_events>`,
    `<conversation>\n${renderHistory(history)}\n</conversation>`,
    `<question>\n${question.trim()}\n</question>`,
  ].join("\n\n");
}

/** Runs the answer stage with the strong model over the selected events and the committed profile. */
export function runAnswer(
  input: Omit<AnswerInput, "profile">,
  ctx: StageContext,
): Promise<StageOutcome<AnswerOutput>> {
  return callStage(
    {
      stage: "answer",
      model: ANSWER_MODEL,
      schema: AnswerOutputSchema,
      prompt: loadPrompt("answer"),
      input: buildAnswerInput({ ...input, profile: loadCompany() }),
      timeoutMs: ANSWER_TIMEOUT_MS,
    },
    ctx,
  );
}
