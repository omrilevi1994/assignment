import { eq, inArray } from "drizzle-orm";
import { ZodError } from "zod";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { StageRecord } from "@/domain/trace";
import { createDb } from "./client";
import {
  appendTurn,
  createConversation,
  findConversation,
  listConversations,
  loadConversation,
  loadHistory,
  saveTrace,
} from "./repository";
import { conversations, traces, turns } from "./schema";
import type { TurnRole } from "./types";
import { databaseUrl } from "./url";

const db = createDb(databaseUrl());
const createdIds: string[] = [];

/** Creates a conversation that afterEach deletes again, together with its turns and traces. */
async function newConversation(title?: string) {
  const conversation = await createConversation({ title }, db);
  createdIds.push(conversation.id);
  return conversation;
}

/** Appends a turn whose content records its own index, so order is easy to check. */
function append(conversationId: string, role: TurnRole, index: number) {
  return appendTurn({ conversationId, role, content: { text: `turn ${index}` } }, db);
}

const stage: StageRecord = {
  stage: "select",
  model: "openai/gpt-4.1-mini",
  inputTokens: 1200,
  outputTokens: 80,
  costUsd: 0.0006,
  latencyMs: 640,
  promptHash: "3f2a9c",
  source: "live",
};

afterEach(async () => {
  const ids = createdIds.splice(0);
  if (ids.length > 0) await db.delete(conversations).where(inArray(conversations.id, ids));
});

afterAll(async () => {
  await db.$client.end();
});

describe("createConversation", () => {
  it("returns a generated id and stores the row", async () => {
    const conversation = await newConversation("Supplier exposure");

    expect(conversation.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const rows = await db.select().from(conversations).where(eq(conversations.id, conversation.id));
    expect(rows).toEqual([{ id: conversation.id, title: "Supplier exposure", createdAt: expect.any(Date) }]);
  });

  it("stores a null title when none is given", async () => {
    const conversation = await newConversation();

    expect(conversation.title).toBeNull();
  });
});

describe("appendTurn", () => {
  it("assigns increasing positions within a conversation", async () => {
    const { id } = await newConversation();

    const first = await append(id, "user", 0);
    const second = await append(id, "assistant", 1);
    const third = await append(id, "user", 2);

    expect([first.position, second.position, third.position]).toEqual([0, 1, 2]);
    expect(second).toMatchObject({ conversationId: id, role: "assistant", content: { text: "turn 1" } });
  });

  it("numbers every conversation from zero", async () => {
    const a = await newConversation();
    const b = await newConversation();
    await append(a.id, "user", 0);

    const firstOfB = await append(b.id, "user", 0);

    expect(firstOfB.position).toBe(0);
  });

  it("gives concurrent appends to one conversation distinct positions", async () => {
    const { id } = await newConversation();

    const appended = await Promise.all([0, 1, 2, 3, 4].map((index) => append(id, "user", index)));

    expect(appended.map((turn) => turn.position).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("rejects a system role before writing anything", async () => {
    const { id } = await newConversation();

    const attempt = appendTurn({ conversationId: id, role: "system" as TurnRole, content: { text: "x" } }, db);

    await expect(attempt).rejects.toBeInstanceOf(ZodError);
    expect(await db.select().from(turns).where(eq(turns.conversationId, id))).toEqual([]);
  });
});

describe("loadHistory", () => {
  it("returns only the last n turns, oldest first", async () => {
    const { id } = await newConversation();
    for (const [index, role] of (["user", "assistant", "user", "assistant"] as const).entries()) {
      await append(id, role, index);
    }

    const history = await loadHistory(id, 2, db);

    expect(history.map((turn) => [turn.position, turn.role, turn.content])).toEqual([
      [2, "user", { text: "turn 2" }],
      [3, "assistant", { text: "turn 3" }],
    ]);
  });
});

describe("saveTrace", () => {
  /** Reads a trace back by id. */
  async function readTrace(id: string) {
    const [row] = await db.select().from(traces).where(eq(traces.id, id));
    return row;
  }

  it("round-trips the trace of a successful turn", async () => {
    const { id } = await newConversation();
    await append(id, "user", 0);
    const answer = await append(id, "assistant", 1);
    const trace = {
      turnId: answer.id,
      status: "ok" as const,
      stages: [stage, { ...stage, stage: "answer", outputTokens: 420, costUsd: 0.0021 }],
      verifyReport: { unsupportedClaims: [], checkedCitations: 3 },
      totalCostUsd: 0.0027,
      totalLatencyMs: 2310,
      error: null,
    };

    const saved = await saveTrace(trace, db);

    expect(await readTrace(saved.id)).toEqual({ ...trace, id: saved.id, createdAt: expect.any(Date) });
  });

  it("round-trips the trace of a failed turn", async () => {
    const { id } = await newConversation();
    const question = await append(id, "user", 0);
    const trace = {
      turnId: question.id,
      status: "failed" as const,
      stages: [],
      verifyReport: null,
      totalCostUsd: 0,
      totalLatencyMs: 15003,
      error: "answer stage timed out",
    };

    const saved = await saveTrace(trace, db);

    expect(await readTrace(saved.id)).toEqual({ ...trace, id: saved.id, createdAt: expect.any(Date) });
  });

  it("rejects an invalid trace before writing anything", async () => {
    const { id } = await newConversation();
    const question = await append(id, "user", 0);
    const invalid = {
      turnId: question.id,
      status: "ok" as const,
      stages: [{ ...stage, costUsd: -1 }],
      verifyReport: null,
      totalCostUsd: -1,
      totalLatencyMs: 10,
      error: null,
    };

    await expect(saveTrace(invalid, db)).rejects.toBeInstanceOf(ZodError);
    expect(await db.select().from(traces).where(eq(traces.turnId, question.id))).toEqual([]);
  });
});

describe("findConversation", () => {
  it("returns the stored conversation", async () => {
    const conversation = await newConversation("Energy exposure");

    expect(await findConversation(conversation.id, db)).toEqual(conversation);
  });

  it("returns null for an unknown id", async () => {
    expect(await findConversation("00000000-0000-4000-8000-000000000000", db)).toBeNull();
  });
});

describe("listConversations", () => {
  it("lists conversations newest first", async () => {
    const first = await newConversation("first");
    const second = await newConversation("second");
    const third = await newConversation();
    const ours = new Set([first.id, second.id, third.id]);

    const listed = (await listConversations(50, db)).filter((row) => ours.has(row.id));

    expect(listed).toEqual([
      { id: third.id, title: null, createdAt: third.createdAt },
      { id: second.id, title: "second", createdAt: second.createdAt },
      { id: first.id, title: "first", createdAt: first.createdAt },
    ]);
  });

  it("returns at most the given number of conversations", async () => {
    await newConversation("a");
    await newConversation("b");

    expect(await listConversations(1, db)).toHaveLength(1);
  });
});

describe("loadConversation", () => {
  const failedTrace = {
    status: "failed" as const,
    stages: [],
    verifyReport: null,
    totalCostUsd: 0,
    totalLatencyMs: 900,
    error: "select stage failed (timeout)",
  };
  const okTrace = {
    status: "ok" as const,
    stages: [stage],
    verifyReport: { removed_citations: [], demoted_claims: [], evidence_level_changed: null },
    totalCostUsd: 0.0006,
    totalLatencyMs: 640,
    error: null,
  };

  it("returns the turns in position order, each with its trace or null", async () => {
    const { id } = await newConversation("Cloud risk");
    const failedQuestion = await append(id, "user", 0);
    await saveTrace({ ...failedTrace, turnId: failedQuestion.id }, db);
    const question = await append(id, "user", 1);
    const answer = await append(id, "assistant", 2);
    await saveTrace({ ...okTrace, turnId: answer.id }, db);

    const loaded = await loadConversation(id, db);

    expect(loaded).toEqual({
      id,
      title: "Cloud risk",
      turns: [
        { id: failedQuestion.id, role: "user", position: 0, content: { text: "turn 0" }, createdAt: expect.any(Date), trace: failedTrace },
        { id: question.id, role: "user", position: 1, content: { text: "turn 1" }, createdAt: expect.any(Date), trace: null },
        { id: answer.id, role: "assistant", position: 2, content: { text: "turn 2" }, createdAt: expect.any(Date), trace: okTrace },
      ],
    });
  });

  it("returns a conversation without turns with an empty list", async () => {
    const { id } = await newConversation();

    expect(await loadConversation(id, db)).toEqual({ id, title: null, turns: [] });
  });

  it("returns null for an unknown id", async () => {
    expect(await loadConversation("00000000-0000-4000-8000-000000000000", db)).toBeNull();
  });
});
