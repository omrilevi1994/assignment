import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { listFeedbackWithTurns, saveFeedback } from "./feedback";
import { appendTurn, createConversation } from "./repository";
import { conversations, feedback, turns } from "./schema";
import { databaseUrl } from "./url";

const db = createDb(databaseUrl());
const createdIds: string[] = [];

/** Creates an isolated conversation for each feedback test. */
async function conversation() {
  const row = await createConversation({}, db);
  createdIds.push(row.id);
  return row.id;
}

/** Appends one test turn and returns its stored row. */
function append(conversationId: string, role: "user" | "assistant", text: string) {
  return appendTurn({ conversationId, role, content: { text } }, db);
}

afterEach(async () => {
  await db.delete(conversations).where(inArray(conversations.id, createdIds.splice(0)));
});

afterAll(async () => {
  await db.$client.end();
});

describe("saveFeedback", () => {
  it("stores a trimmed note and generated id against a real turn", async () => {
    const turn = await append(await conversation(), "assistant", "A disputed answer.");
    const saved = await saveFeedback({ turnId: turn.id, note: "  The evidence is unclear.\n " }, db);
    expect(saved).toMatchObject({ id: expect.any(String), turnId: turn.id, note: "The evidence is unclear." });
    expect(await db.select().from(feedback).where(eq(feedback.turnId, turn.id))).toEqual([saved]);
  });

  it.each(["", " \n\t ", "x".repeat(2001)])("rejects an invalid note before saving", async (note) => {
    const turn = await append(await conversation(), "assistant", "A disputed answer.");
    await expect(saveFeedback({ turnId: turn.id, note }, db)).rejects.toThrow();
    expect(await db.select().from(feedback).where(eq(feedback.turnId, turn.id))).toEqual([]);
  });

  it("accepts exactly 2000 characters without truncation", async () => {
    const turn = await append(await conversation(), "assistant", "A disputed answer.");
    expect((await saveFeedback({ turnId: turn.id, note: "x".repeat(2000) }, db))?.note).toHaveLength(2000);
  });

  it("returns null for an unknown turn", async () => {
    expect(await saveFeedback({ turnId: randomUUID(), note: "Missing turn." }, db)).toBeNull();
  });

  it("cascades feedback when its turn is deleted", async () => {
    const turn = await append(await conversation(), "assistant", "A disputed answer.");
    await saveFeedback({ turnId: turn.id, note: "Review this." }, db);
    await db.delete(turns).where(eq(turns.id, turn.id));
    expect(await db.select().from(feedback).where(eq(feedback.turnId, turn.id))).toEqual([]);
  });
});

describe("listFeedbackWithTurns", () => {
  it("includes the nearest question and earlier turns, excluding future and unrelated turns", async () => {
    const id = await conversation();
    const first = await append(id, "user", "Which developments matter?");
    const second = await append(id, "assistant", "Cloud and electricity.");
    const question = await append(id, "user", "Which of those affect costs?");
    const turn = await append(id, "assistant", "Both affect costs.");
    await append(id, "user", "A future question.");
    await append(await conversation(), "user", "An unrelated question.");
    const saved = await saveFeedback({ turnId: turn.id, note: "Explain the mechanism." }, db);
    const record = (await listFeedbackWithTurns(db)).find((row) => row.id === saved?.id);
    expect(record).toMatchObject({ ...saved, turn, question, history: [first, second] });
  });

  it("uses a flagged user turn as its own question for failed attempts", async () => {
    const question = await append(await conversation(), "user", "Why did this fail?");
    const saved = await saveFeedback({ turnId: question.id, note: "The request failed." }, db);
    const record = (await listFeedbackWithTurns(db)).find((row) => row.id === saved?.id);
    expect(record).toMatchObject({ turn: question, question, history: [] });
  });
});
