import { describe, expect, it } from "vitest";
import type { AnswerOutput } from "@/domain/stages";
import { renderHistory } from "@/pipeline/history";
import { EvalCaseSchema } from "./case";
import { feedbackToDraft } from "./import";

const answer: AnswerOutput = {
  summary: "Cloud outages threaten continuity.",
  facts: [{ claim: "An outage occurred.", sources: [{ type: "event", id: "evt_006" }] }],
  analysis: [{ claim: "A risk for us.", sources: [
    { type: "company_profile", field: "company_name" },
    { type: "event", id: "evt_006" },
    { type: "event", id: "evt_004" },
  ] }],
  evidence_level: "partial",
  missing_info: "",
  follow_ups: [],
};

const record = {
  turnId: "abcdef12-0000-4000-8000-000000000001",
  note: 'Check "outage".\nKeep the \\ quote intact.',
  createdAt: new Date("2026-10-02T20:00:00Z"),
  turn: { role: "assistant" as const, content: { answer } },
  question: { content: { text: "Which of those affect costs?" } },
  history: [
    { role: "user" as const, content: { text: "What matters?" } },
    { role: "assistant" as const, content: { answer } },
  ],
};

describe("feedbackToDraft", () => {
  it("makes a valid draft with the original question, earlier history and distinct event citations", () => {
    const draft = feedbackToDraft(record);
    expect(EvalCaseSchema.parse(draft)).toEqual(draft);
    expect(draft).toMatchObject({
      id: "2026-10-02-abcdef12", tags: ["draft", "feedback"],
      question: "Which of those affect costs?",
      history: [
        { role: "user", text: "What matters?" },
        { role: "assistant", text: `${answer.summary} (cited: evt_006, evt_004)` },
      ],
      expect: { must_cite: ["evt_006", "evt_004"] },
      judge: [`Reviewer note: ${record.note}`],
    });
  });

  it("preserves prior-answer citations that a follow-up needs even when the summary names no event ids", () => {
    expect(answer.summary).not.toMatch(/evt_\d{3}/);
    const draft = feedbackToDraft(record);
    expect(renderHistory(draft.history)).toBe(renderHistory([
      { role: "user", text: "What matters?" },
      { role: "assistant", text: answer.summary, citedIds: ["evt_006", "evt_004"] },
    ]));
  });

  it("keeps an uncited prior answer unchanged without an empty citation suffix", () => {
    const uncited = { ...answer, facts: [], analysis: [], evidence_level: "none" };
    const history = [{ role: "assistant" as const, content: { answer: uncited } }];
    expect(feedbackToDraft({ ...record, history }).history).toEqual([{ role: "assistant", text: answer.summary }]);
  });

  it("preserves quotes, newlines, slashes and long notes through JSON serialization", () => {
    const note = `${record.note}${"x".repeat(1900)}`;
    const draft = feedbackToDraft({ ...record, note });
    expect(JSON.parse(JSON.stringify(draft)).judge).toEqual([`Reviewer note: ${note}`]);
  });

  it("rejects malformed stored answers instead of silently losing citation expectations", () => {
    expect(() => feedbackToDraft({ ...record, turn: { role: "assistant", content: { answer: {} } } })).toThrow();
  });

  it("rejects missing or empty questions", () => {
    expect(() => feedbackToDraft({ ...record, question: null })).toThrow();
    expect(() => feedbackToDraft({ ...record, question: { content: { text: " " } } })).toThrow();
  });

  it("rejects unsafe turn identifiers rather than using them in a filename", () => {
    expect(() => feedbackToDraft({ ...record, turnId: "../../secret" })).toThrow();
  });

  it("creates a draft without answer citations for feedback on a failed user turn", () => {
    const draft = feedbackToDraft({ ...record, turn: { role: "user", content: { text: "Question" } } });
    expect(draft.expect.must_cite).toEqual([]);
  });
});
