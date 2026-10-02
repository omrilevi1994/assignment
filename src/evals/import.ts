import { z } from "zod";
import { FeedbackInputSchema } from "@/domain/feedback";
import { AnswerOutputSchema } from "@/domain/stages";
import { EvalCaseSchema, type EvalCase, type Turn } from "./case";
import { citedEventIds } from "./checks";

interface StoredTurn {
  role: "user" | "assistant";
  content: unknown;
}

/** Structural input keeps database access outside the eval layer. */
export interface FeedbackDraftInput {
  turnId: string;
  note: string;
  createdAt: Date;
  turn: StoredTurn;
  question: { content: unknown } | null;
  history: StoredTurn[];
}

const QuestionSchema = z.object({ text: z.string().trim().min(1) });
const StoredAnswerSchema = z.object({ answer: AnswerOutputSchema });

/** Keeps explicit event references alongside the summary for follow-up eval questions. */
function answerHistoryText(content: unknown): string {
  const { answer } = StoredAnswerSchema.parse(content);
  const ids = citedEventIds(answer);
  const cited = ids.length > 0 ? ` (cited: ${ids.join(", ")})` : "";
  return `${answer.summary}${cited}`;
}

/** Restores a user question or the saved answer summary and citations to eval history. */
function historyTurn(turn: StoredTurn): Turn {
  const text = turn.role === "user" ? QuestionSchema.parse(turn.content).text
    : answerHistoryText(turn.content);
  return { role: turn.role, text };
}

/** Maps a saved report to a draft requiring review before entering the active eval suite. */
export function feedbackToDraft(input: FeedbackDraftInput): EvalCase {
  const feedback = FeedbackInputSchema.parse({ turnId: input.turnId, note: input.note });
  const date = z.date().parse(input.createdAt).toISOString().slice(0, 10);
  const cited = input.turn.role === "assistant"
    ? citedEventIds(StoredAnswerSchema.parse(input.turn.content).answer) : [];
  return EvalCaseSchema.parse({
    id: `${date}-${feedback.turnId.slice(0, 8)}`,
    tags: ["draft", "feedback"],
    question: QuestionSchema.parse(input.question?.content).text,
    history: input.history.map(historyTurn),
    expect: { must_cite: cited },
    judge: [`Reviewer note: ${feedback.note}`],
  });
}
