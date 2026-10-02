import { z } from "zod";
import type { TurnRow } from "@/db/schema";
import { AnswerOutputSchema } from "@/domain/stages";
import type { HistoryTurn } from "@/pipeline";
import { answerEventIds } from "./evidence";

const UserContentSchema = z.object({ text: z.string() });
const AssistantContentSchema = z.object({ answer: AnswerOutputSchema });

/** Checks stored JSON at the boundary and gives the pipeline only conversational context. */
export function historyTurn(turn: TurnRow): HistoryTurn {
  if (turn.role === "user") return { role: "user", text: UserContentSchema.parse(turn.content).text };
  const { answer } = AssistantContentSchema.parse(turn.content);
  return { role: "assistant", text: answer.summary, citedIds: answerEventIds(answer) };
}
