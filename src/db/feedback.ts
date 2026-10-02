import { randomUUID } from "node:crypto";
import { and, asc, eq, lte } from "drizzle-orm";
import { FeedbackInputSchema, type FeedbackInput } from "@/domain/feedback";
import { getDb, type Database } from "./client";
import { feedback, turns, type FeedbackRow, type TurnRow } from "./schema";

export interface FeedbackWithTurns extends FeedbackRow {
  turn: TurnRow;
  question: TurnRow | null;
  history: TurnRow[];
}

/** Saves validated feedback, or returns null when the referenced turn does not exist. */
export async function saveFeedback(input: FeedbackInput, db: Database = getDb()): Promise<FeedbackRow | null> {
  const value = FeedbackInputSchema.parse(input);
  const [turn] = await db.select({ id: turns.id }).from(turns).where(eq(turns.id, value.turnId));
  if (!turn) return null;
  const [row] = await db.insert(feedback).values({ id: randomUUID(), ...value }).returning();
  return row;
}

/** Reads the question behind a report and its earlier context, never later turns. */
async function withContext(row: FeedbackRow, turn: TurnRow, db: Database): Promise<FeedbackWithTurns> {
  const preceding = await db.select().from(turns)
    .where(and(eq(turns.conversationId, turn.conversationId), lte(turns.position, turn.position)))
    .orderBy(asc(turns.position));
  const question = preceding.findLast((entry) => entry.role === "user") ?? null;
  const history = question ? preceding.filter((entry) => entry.position < question.position) : [];
  return { ...row, turn, question, history };
}

/** Returns reports oldest first with their saved answers and original conversation context. */
export async function listFeedbackWithTurns(db: Database = getDb()): Promise<FeedbackWithTurns[]> {
  const rows = await db.select({ feedback, turn: turns }).from(feedback)
    .innerJoin(turns, eq(feedback.turnId, turns.id)).orderBy(asc(feedback.createdAt), asc(feedback.id));
  return Promise.all(rows.map((row) => withContext(row.feedback, row.turn, db)));
}
