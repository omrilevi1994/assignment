import { describe, expect, it } from "vitest";
import { AnswerOutputSchema, type SelectOutput } from "@/domain/stages";
import { verify } from "@/domain/verify";
import { insufficientEvidenceAnswer } from "./insufficient";

const unanswerable: SelectOutput = {
  standalone_question: "Will interest rates fall next quarter?",
  answerable: false,
  selected: [],
  gap: "No event reports central bank guidance or market expectations for interest rates.",
};

describe("insufficientEvidenceAnswer", () => {
  it("is a valid answer with no facts, no analysis and no evidence", () => {
    const answer = insufficientEvidenceAnswer(unanswerable);
    expect(AnswerOutputSchema.parse(answer)).toEqual(answer);
    expect(answer).toMatchObject({ facts: [], analysis: [], evidence_level: "none" });
  });

  it("says plainly in the summary that the events hold no evidence", () => {
    expect(insufficientEvidenceAnswer(unanswerable).summary).toMatch(/events contain no evidence/i);
  });

  it("passes the selection gap through as the missing information", () => {
    expect(insufficientEvidenceAnswer(unanswerable).missing_info).toBe(unanswerable.gap);
  });

  it("still names what is missing when the selection left the gap blank", () => {
    const answer = insufficientEvidenceAnswer({ ...unanswerable, gap: "  " });
    expect(answer.missing_info.trim().length).toBeGreaterThan(0);
  });

  it("offers two follow-ups that the events can answer", () => {
    const followUps = insufficientEvidenceAnswer(unanswerable).follow_ups;
    expect(followUps).toHaveLength(2);
    for (const followUp of followUps) expect(followUp).toMatch(/Asteron/);
  });

  it("does not depend on what the selection stage picked", () => {
    const withPicks = { ...unanswerable, selected: [{ event_id: "evt_005", reason: "mentions central banks" }] };
    expect(insufficientEvidenceAnswer(withPicks)).toEqual(insufficientEvidenceAnswer(unanswerable));
  });

  it("passes verify unchanged", () => {
    const answer = insufficientEvidenceAnswer(unanswerable);
    expect(verify(answer, [], ["evt_001"]).answer).toEqual(answer);
  });
});
