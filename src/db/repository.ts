import { randomUUID } from "node:crypto";
import { asc, desc, eq, max } from "drizzle-orm";
import type { Trace } from "@/domain/trace";
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

/** A conversation as listed in the sidebar. */
export type ConversationSummary = { id: string; title: string | null; createdAt: Date };

/** One stored turn with the trace of the pipeline run it belongs to, or null when it has none. */
export type ConversationTurn = {
  id: string;
  role: TurnRole;
  position: number;
  content: unknown;
  createdAt: Date;
  trace: Trace | null;
};

/** A conversation with all of its turns, oldest first. */
export type ConversationDetail = { id: string; title: string | null; turns: ConversationTurn[] };

/** The conversation with this id, or null when there is none. */
export async function findConversation(conversationId: string, db: Database = getDb()): Promise<ConversationRow | null> {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  return row ?? null;
}

/** The most recent conversations, newest first. */
export async function listConversations(limit = 50, db: Database = getDb()): Promise<ConversationSummary[]> {
  return db
    .select({ id: conversations.id, title: conversations.title, createdAt: conversations.createdAt })
    .from(conversations)
    .orderBy(desc(conversations.createdAt))
    .limit(limit);
}

/** A stored trace without its row bookkeeping (id, turn id, insert time). */
function toTrace(row: TraceRow): Trace {
  const { status, stages, verifyReport, totalCostUsd, totalLatencyMs, error } = row;
  return { status, stages, verifyReport, totalCostUsd, totalLatencyMs, error };
}

/**
 * The turns of a conversation in position order, each joined with its trace.
 * A turn has at most one trace; should there be more, the latest wins.
 */
async function turnsWithTraces(conversationId: string, db: Database): Promise<ConversationTurn[]> {
  const rows = await db
    .select({ turn: turns, trace: traces })
    .from(turns)
    .leftJoin(traces, eq(traces.turnId, turns.id))
    .where(eq(turns.conversationId, conversationId))
    .orderBy(asc(turns.position), asc(traces.createdAt));
  const byId = new Map<string, ConversationTurn>();
  for (const { turn, trace } of rows) {
    const { id, role, position, content, createdAt } = turn;
    byId.set(id, { id, role, position, content, createdAt, trace: trace ? toTrace(trace) : null });
  }
  return [...byId.values()];
}

/** A conversation with every turn and trace, ready to render; null when the id is unknown. */
export async function loadConversation(conversationId: string, db: Database = getDb()): Promise<ConversationDetail | null> {
  const conversation = await findConversation(conversationId, db);
  if (!conversation) return null;
  const { id, title } = conversation;
  return { id, title, turns: await turnsWithTraces(conversationId, db) };
}
