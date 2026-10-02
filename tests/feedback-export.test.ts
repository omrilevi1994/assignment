import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFeedbackDrafts } from "../scripts/eval-import-files";
import { createDb } from "@/db/client";
import { listFeedbackWithTurns, saveFeedback } from "@/db/feedback";
import { appendTurn, createConversation } from "@/db/repository";
import { conversations } from "@/db/schema";
import { databaseUrl } from "@/db/url";
import { EvalCaseSchema, loadCases } from "@/evals/case";

const db = createDb(databaseUrl());
let dir: string;
let conversationId: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "feedback-export-"));
  conversationId = (await createConversation({}, db)).id;
});

afterEach(async () => {
  rmSync(dir, { recursive: true, force: true });
  await db.delete(conversations).where(eq(conversations.id, conversationId));
});

afterAll(async () => {
  await db.$client.end();
});

/** Stores an answer and review note, then reads its export context from Postgres. */
async function reportedTurn() {
  const question = 'Does "electricity" affect us?';
  await appendTurn({ conversationId, role: "user", content: { text: question } }, db);
  const answer = {
    summary: "Electricity costs may rise.", facts: [],
    analysis: [{ claim: "Potential cost pressure.", sources: [{ type: "event", id: "evt_004" }] }],
    evidence_level: "partial", missing_info: "", follow_ups: [],
  };
  const turn = await appendTurn({ conversationId, role: "assistant", content: { answer } }, db);
  const saved = await saveFeedback({ turnId: turn.id, note: 'Check "cost".\nMore detail \\ please.' }, db);
  return (await listFeedbackWithTurns(db)).filter((row) => row.id === saved?.id);
}

describe("feedback draft export", () => {
  it("exports a stored report as valid JSON with escaped strings and a stable date-and-turn filename", async () => {
    const records = await reportedTurn();
    const drafts = path.join(dir, "drafts");
    expect(writeFeedbackDrafts(records, drafts)).toEqual({ written: 1, skipped: 0 });
    const [filename] = readdirSync(drafts);
    expect(filename).toBe(`${records[0].createdAt.toISOString().slice(0, 10)}-${records[0].turnId.slice(0, 8)}.json`);
    const draft = EvalCaseSchema.parse(JSON.parse(readFileSync(path.join(drafts, filename), "utf8")));
    expect(draft.question).toBe('Does "electricity" affect us?');
    expect(draft.expect.must_cite).toEqual(["evt_004"]);
    expect(draft.judge).toEqual([`Reviewer note: ${records[0].note}`]);
    expect(loadCases(dir)).toEqual([]);
  });

  it("skips existing drafts without changing reviewed edits", async () => {
    const records = await reportedTurn();
    writeFeedbackDrafts(records, dir);
    const file = path.join(dir, readdirSync(dir)[0]);
    writeFileSync(file, "reviewer edits");
    expect(writeFeedbackDrafts(records, dir)).toEqual({ written: 0, skipped: 1 });
    expect(readFileSync(file, "utf8")).toBe("reviewer edits");
  });

  it("keeps the first report when multiple notes for the same turn and day share a draft filename", async () => {
    const [first] = await reportedTurn();
    const second = await saveFeedback({ turnId: first.turnId, note: "A second reviewer note." }, db);
    const records = (await listFeedbackWithTurns(db)).filter((row) => [first.id, second?.id].includes(row.id));
    const sameDay = records.map((row) => ({ ...row, createdAt: first.createdAt }));
    expect(writeFeedbackDrafts(sameDay, dir)).toEqual({ written: 1, skipped: 1 });
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    const draft = JSON.parse(readFileSync(path.join(dir, files[0]), "utf8"));
    expect(draft.judge).toEqual([`Reviewer note: ${first.note}`]);
  });
});
