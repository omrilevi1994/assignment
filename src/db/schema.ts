import { sql, type SQL } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  type PgColumn,
} from "drizzle-orm/pg-core";
import { TRACE_STATUSES, type StageRecord } from "@/domain/trace";
import { TURN_ROLES } from "./types";

/**
 * `column in ('a', 'b')` with the values written into the SQL, because a check
 * constraint cannot take bind parameters. The values are code constants.
 */
function oneOf(column: PgColumn, values: readonly string[]): SQL {
  const list = values.map((value) => `'${value}'`).join(", ");
  return sql`${column} in (${sql.raw(list)})`;
}

/** Insert time, set by the database. */
function createdAt() {
  return timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
}

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title"),
  createdAt: createdAt(),
});

export const turns = pgTable(
  "turns",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    role: text("role", { enum: TURN_ROLES }).notNull(),
    content: jsonb("content").$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("turns_conversation_position_unique").on(table.conversationId, table.position),
    check("turns_role_check", oneOf(table.role, TURN_ROLES)),
  ],
);

export const traces = pgTable(
  "traces",
  {
    id: text("id").primaryKey(),
    turnId: text("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "cascade" }),
    status: text("status", { enum: TRACE_STATUSES }).notNull(),
    stages: jsonb("stages").$type<StageRecord[]>().notNull(),
    verifyReport: jsonb("verify_report").$type<Record<string, unknown>>(),
    totalCostUsd: doublePrecision("total_cost_usd").notNull(),
    totalLatencyMs: integer("total_latency_ms").notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (table) => [
    index("traces_turn_id_idx").on(table.turnId),
    check("traces_status_check", oneOf(table.status, TRACE_STATUSES)),
  ],
);

export const feedback = pgTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    turnId: text("turn_id").notNull().references(() => turns.id, { onDelete: "cascade" }),
    note: text("note").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("feedback_turn_id_idx").on(table.turnId),
    check("feedback_note_length_check", sql`char_length(btrim(${table.note})) between 1 and 2000`),
  ],
);

export type ConversationRow = typeof conversations.$inferSelect;
export type TurnRow = typeof turns.$inferSelect;
export type TraceRow = typeof traces.$inferSelect;
export type FeedbackRow = typeof feedback.$inferSelect;
