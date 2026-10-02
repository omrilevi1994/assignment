import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createDb } from "@/db/client";
import { appendTurn, createConversation, loadConversation } from "@/db/repository";
import { conversations, traces } from "@/db/schema";
import { databaseUrl } from "@/db/url";
import { runTurn, type TurnResult } from "@/pipeline";
import { handleChat } from "./handler";

const db = createDb(databaseUrl());
const createdIds: string[] = [];
const question = "What are the three developments most relevant to Asteron right now?";
const replay: typeof runTurn = (message, history) => runTurn(message, history, { gateway: { mode: "replay" } });

/** Builds a JSON chat request. */
function request(body: unknown) {
  return new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) });
}

/** Creates an isolated conversation that the test cleans up. */
async function conversation() {
  const row = await createConversation({ title: "Route test" }, db);
  createdIds.push(row.id);
  return row.id;
}

/** Sends a request and tracks any conversation it creates. */
async function chat(body: unknown, pipeline: typeof runTurn = replay) {
  const response = await handleChat(request(body), { db, runTurn: pipeline });
  const json = await response.json();
  if (json.conversationId) createdIds.push(json.conversationId);
  return { response, json };
}

/** A deterministic provider failure with a partial trace. */
function failure(): TurnResult {
  return {
    status: "failed", answer: null, select: null, standaloneQuestion: question,
    selectedIds: [], verifyReport: null,
    error: { kind: "timeout", message: "The model took too long to respond. Please try again." },
    trace: { status: "failed", stages: [], totalCostUsd: 0, totalLatencyMs: 1200,
      verifyReport: null, error: "select stage failed (timeout)" },
  };
}

afterEach(async () => {
  const ids = createdIds.splice(0);
  if (ids.length) await db.delete(conversations).where(inArray(conversations.id, ids));
});
afterAll(async () => { await db.$client.end(); });

describe("handleChat validation", () => {
  it.each([{}, { message: "  " }, { message: 3 }, { message: "x".repeat(2001) }])(
    "rejects invalid messages with field errors", async (body) => {
      const pipeline = vi.fn(replay);
      const { response, json } = await chat(body, pipeline);
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(json.error).toMatchObject({ kind: "validation", fields: { message: expect.any(Array) } });
      expect(pipeline).not.toHaveBeenCalled();
    },
  );

  it.each([null, []])("rejects a non-object JSON body", async (body) => {
    const { response, json } = await chat(body);
    expect(response.status).toBe(400);
    expect(json.error.fields.body).toEqual(expect.any(Array));
  });

  it("rejects malformed JSON with a body error", async () => {
    const response = await handleChat(new Request("http://localhost/api/chat", { method: "POST", body: "{" }), { db });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { kind: "validation", fields: { body: expect.any(Array) } } });
  });

  it.each(["", randomUUID()])("rejects an unknown or empty conversation id", async (conversationId) => {
    const pipeline = vi.fn(replay);
    const { response, json } = await chat({ conversationId, message: question }, pipeline);
    expect(response.status).toBe(400);
    expect(json.error.fields.conversationId).toEqual(expect.any(Array));
    expect(pipeline).not.toHaveBeenCalled();
  });
});

describe("handleChat persistence", () => {
  it("replays a grounded turn, stores both turns and its trace, and returns evidence", async () => {
    const { response, json } = await chat({ message: `  ${question}  ` });
    expect(response.status).toBe(200);
    expect(json).toMatchObject({ status: "ok", turnId: expect.any(String), answer: { evidence_level: "partial" } });
    const saved = await loadConversation(json.conversationId, db);
    expect(saved?.title).toBe(question.slice(0, 80));
    expect(saved?.turns).toHaveLength(2);
    expect(saved?.turns[0]).toMatchObject({ role: "user", content: { text: question } });
    expect(saved?.turns[1]).toMatchObject({ id: json.turnId, role: "assistant", content: {
      answer: json.answer, standaloneQuestion: json.standaloneQuestion, status: json.status,
      verifyReport: json.verifyReport, selectedIds: expect.any(Array), evidence: {
        cited: json.evidence.cited.map(({ event, reason }: { event: { event_id: string }; reason: string }) => ({ id: event.event_id, reason })),
        considered: expect.any(Array),
      },
    } });
    const [trace] = await db.select().from(traces).where(eq(traces.id, json.trace.id));
    expect(trace).toMatchObject({ turnId: json.turnId, status: "ok", stages: json.trace.stages });
    expect(json.trace.totals).toEqual({ costUsd: trace.totalCostUsd, latencyMs: trace.totalLatencyMs,
      inputTokens: trace.stages.reduce((sum, stage) => sum + stage.inputTokens, 0),
      outputTokens: trace.stages.reduce((sum, stage) => sum + stage.outputTokens, 0) });
    expect(json.evidence.cited.length).toBeGreaterThan(0);
    expect(json.evidence.cited[0]).toMatchObject({ event: { source_name: expect.any(String) }, reason: expect.any(String) });
  });

  it("accepts 2000 trimmed characters and limits a new title to 80", async () => {
    const message = "x".repeat(2000);
    const pipeline = vi.fn(async () => failure());
    const { response, json } = await chat({ message: `  ${message}  ` }, pipeline);
    expect(response.status).toBe(502);
    expect(pipeline).toHaveBeenCalledWith(message, []);
    expect((await loadConversation(json.conversationId, db))?.title).toBe(message.slice(0, 80));
  });

  it("passes only the last six earlier turns with assistant summaries and cited ids", async () => {
    const conversationId = await conversation();
    const result = await replay(question, []);
    for (let index = 0; index < 8; index++) {
      const role = index % 2 === 0 ? "user" : "assistant";
      const content = role === "user" ? { text: `question ${index}` } : { answer: result.answer };
      await appendTurn({ conversationId, role, content }, db);
    }
    const pipeline = vi.fn(async () => result);
    const { response } = await chat({ conversationId, message: "  Which of those?  " }, pipeline);
    expect(response.status).toBe(200);
    const call = vi.mocked(pipeline as typeof runTurn).mock.calls[0];
    expect(call[0]).toBe("Which of those?");
    expect(call[1]).toHaveLength(6);
    expect(call[1][0]).toEqual({ role: "user", text: "question 2" });
    expect(call[1][1]).toMatchObject({ role: "assistant", text: result.answer?.summary, citedIds: expect.any(Array) });
    expect(call[1][1].citedIds?.length).toBeGreaterThan(0);
  });

  it("keeps first citation order, deduplicates ids, and separates selected but uncited events", async () => {
    const result = await replay(question, []);
    result.status = "degraded";
    result.trace.status = "degraded";
    result.answer = { summary: "Energy and cloud.", facts: [
      { claim: "Energy", sources: [{ type: "event", id: "evt_004" }] },
    ], analysis: [{ claim: "Continuity", sources: [
      { type: "event", id: "evt_001" }, { type: "event", id: "evt_004" },
      { type: "company_profile", field: "critical_dependencies" },
    ] }], evidence_level: "partial", missing_info: "", follow_ups: [] };
    result.selectedIds = ["evt_001", "evt_006", "evt_004", "evt_099"];
    result.select!.selected = result.selectedIds.map((event_id) => ({ event_id, reason: `reason ${event_id}` }));
    const { response, json } = await chat({ message: question }, async () => result);
    expect(response.status).toBe(200);
    expect(json.status).toBe("degraded");
    expect(json.evidence.cited.map((item: { event: { event_id: string } }) => item.event.event_id)).toEqual(["evt_004", "evt_001"]);
    expect(json.evidence.considered.map((item: { event: { event_id: string } }) => item.event.event_id)).toEqual(["evt_006"]);
    expect(json.evidence.cited[0].reason).toBe("reason evt_004");
  });

  it("returns insufficient evidence without an assistant model call", async () => {
    const { response, json } = await chat({ message: "Will interest rates fall next quarter?" });
    expect(response.status).toBe(200);
    expect(json.answer.evidence_level).toBe("none");
    expect(json.trace.stages).toHaveLength(1);
    expect(json.evidence.cited).toEqual([]);
  });
});

describe("handleChat failures", () => {
  it("keeps the question and attaches a failed trace to it on provider failure", async () => {
    const { response, json } = await chat({ message: question }, async () => failure());
    expect(response.status).toBe(502);
    expect(json.error.kind).toBe("timeout");
    expect(json.trace).toMatchObject({ status: "failed", totals: { latencyMs: 1200 } });
    const saved = await loadConversation(json.conversationId, db);
    expect(saved?.turns).toHaveLength(1);
    const [trace] = await db.select().from(traces).where(eq(traces.id, json.trace.id));
    expect(trace).toMatchObject({ turnId: saved?.turns[0].id, status: "failed" });
    expect(json).not.toHaveProperty("answer");
  });

  it("returns a fixed internal error when an injected pipeline throws", async () => {
    const conversationId = await conversation();
    const { response, json } = await chat({ conversationId, message: question }, async () => {
      throw new Error("provider secret with stack details");
    });
    expect(response.status).toBe(500);
    expect(json).toEqual({ error: { kind: "internal_error", message: "Something went wrong. Please try again." } });
  });
});
