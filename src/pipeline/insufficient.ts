import type { AnswerOutput, SelectOutput } from "@/domain/stages";

/** Said when the selection stage left its gap blank. */
const DEFAULT_GAP = "None of the events bears on this question.";

/** Questions the events can always answer, offered when this one cannot be. */
const FOLLOW_UPS = [
  "Which three events matter most to Asteron right now?",
  "Which events could affect Asteron's supply chain or energy costs?",
];

/**
 * The answer given without calling the answer model, when the selection stage
 * found nothing to answer from. It states no facts and no analysis, so there
 * is nothing for a model to make up.
 */
export function insufficientEvidenceAnswer(select: SelectOutput): AnswerOutput {
  return {
    summary: "The events contain no evidence for this question, so there is nothing grounded to report.",
    facts: [],
    analysis: [],
    evidence_level: "none",
    missing_info: select.gap.trim() === "" ? DEFAULT_GAP : select.gap,
    follow_ups: [...FOLLOW_UPS],
  };
}
