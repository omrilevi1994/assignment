import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { appendTurn, createConversation } from "@/db/repository";
import { conversations, feedback } from "@/db/schema";
import { databaseUrl } from "@/db/url";
import { handleFeedback } from "./handler";

const db = createDb(databaseUrl());
const ids: string[] = [];

/** Creates a stored turn for a report. */
async function turnId() {
  const row = await createConversation({}, db);
  ids.push(row.id);
  const turn = await appendTurn({ conversationId: row.id, role: "assistant", content: {} }, db);
  return turn.id;
}

/** Makes a feedback JSON request. */
function request(body: unknown) {
  return new Request("http://localhost/api/feedback", { method: "POST", body: JSON.stringify(body) });
}

afterEach(async () => {
  await db.delete(conversations).where(inArray(conversations.id, ids.splice(0)));
});

afterAll(async () => {
  await db.$client.end();
});

describe("handleFeedback", () => {
  it("returns 201 and the persisted feedback id", async () => {
    const turn = await turnId();
    const response = await handleFeedback(request({ turnId: turn, note: "  Please check this. " }), { db });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(await db.select().from(feedback).where(eq(feedback.id, body.id))).toMatchObject([
      { turnId: turn, note: "Please check this." },
    ]);
  });

  it.each([{}, null, { turnId: "x", note: "test" }, { turnId: randomUUID(), note: " " },
    { turnId: randomUUID(), note: "x".repeat(2001) }])("returns 400 for invalid input", async (body) => {
    const response = await handleFeedback(request(body), { db });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { kind: "validation" } });
  });

  it("returns 400 for malformed JSON", async () => {
    const invalid = new Request("http://localhost/api/feedback", { method: "POST", body: "{" });
    expect((await handleFeedback(invalid, { db })).status).toBe(400);
  });

  it("returns 400 for an unknown turn", async () => {
    const response = await handleFeedback(request({ turnId: randomUUID(), note: "Check this." }), { db });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { fields: { turnId: expect.any(Array) } } });
  });

  it("returns a safe 500 without database errors or secrets", async () => {
    const save = async () => { throw new Error("private database credentials"); };
    const response = await handleFeedback(request({ turnId: randomUUID(), note: "Check this." }), { db, save });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: {
      kind: "internal_error", message: "Something went wrong. Please try again.",
    } });
  });
});
