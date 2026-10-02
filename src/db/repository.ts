import { randomUUID } from "node:crypto";
import { desc, eq, max } from "drizzle-orm";
import { getDb, type Database } from "./client";
import { conversations, traces, turns, type ConversationRow, type TraceRow, type TurnRow } from "./schema";
import { TraceInputSchema, TurnRoleSchema, type TraceInput, type TurnRole } from "./types";

/** A transaction handle as passed to the `db.transaction` callback. */
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Starts a conversation; the title is optional and can be set later. */
export async function createConversation(
  input: { title?: string },
  db: Database = getDb(),
): Promise<ConversationRow> {
  const [row] = await db
    .insert(conversations)
    .values({ id: randomUUID(), title: input.title ?? null })
    .returning();
  return row;
}

/**
 * Locks the conversation row and returns the position after its last turn.
 * The lock serialises concurrent appends to one conversation, which would
 * otherwise read the same last position and collide on the unique constraint.
 */
async function nextPosition(tx: Transaction, conversationId: string): Promise<number> {
  await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .for("update");
  const [last] = await tx
    .select({ position: max(turns.position) })
    .from(turns)
    .where(eq(turns.conversationId, conversationId));
  return last.position === null ? 0 : last.position + 1;
}

/** Adds a turn at the end of a conversation. `content` is stored as opaque JSON. */
export async function appendTurn(
  input: { conversationId: string; role: TurnRole; content: unknown },
  db: Database = getDb(),
): Promise<TurnRow> {
  const role = TurnRoleSchema.parse(input.role);
  return db.transaction(async (tx) => {
    const position = await nextPosition(tx, input.conversationId);
    const [row] = await tx
      .insert(turns)
      .values({
        id: randomUUID(),
        conversationId: input.conversationId,
        position,
        role,
        content: input.content,
      })
      .returning();
    return row;
  });
}

/** The last `n` turns of a conversation, oldest first, ready to be replayed as context. */
export async function loadHistory(conversationId: string, n: number, db: Database = getDb()): Promise<TurnRow[]> {
  const latest = await db
    .select()
    .from(turns)
    .where(eq(turns.conversationId, conversationId))
    .orderBy(desc(turns.position))
    .limit(n);
  return latest.reverse();
}

/** Stores the trace of one turn after checking it against the trace schema. */
export async function saveTrace(input: TraceInput, db: Database = getDb()): Promise<TraceRow> {
  const trace = TraceInputSchema.parse(input);
  const [row] = await db
    .insert(traces)
    .values({ id: randomUUID(), ...trace })
    .returning();
  return row;
}
