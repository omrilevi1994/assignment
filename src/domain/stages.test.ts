import { describe, expect, it } from "vitest";
import { AnswerOutputSchema, SelectOutputSchema, SourceSchema } from "@/domain/stages";

const selectOutput = {
  standalone_question: "How exposed are we to the cloud outage?",
  answerable: true,
  selected: [{ event_id: "evt_001", reason: "Describes the outage directly." }],
  gap: "",
};

const answerOutput = {
  summary: "The outage touches our software revenue.",
  facts: [{ claim: "A regional cloud outage lasted six hours.", sources: [{ type: "event", id: "evt_001" }] }],
  analysis: [
    {
      claim: "Recurring software revenue depends on hyperscale cloud.",
      sources: [
        { type: "event", id: "evt_001" },
        { type: "company_profile", field: "critical_dependencies" },
      ],
    },
  ],
  evidence_level: "strong",
  missing_info: "",
  follow_ups: ["Which regions host our services?"],
};

describe("SelectOutputSchema", () => {
  it("accepts a valid select output", () => {
    expect(SelectOutputSchema.parse(selectOutput)).toEqual(selectOutput);
  });

  it("requires answerable to be a boolean", () => {
    expect(SelectOutputSchema.safeParse({ ...selectOutput, answerable: "yes" }).success).toBe(false);
  });

  it("rejects a selected entry with a malformed event id", () => {
    const selected = [{ event_id: "event-1", reason: "Looks relevant." }];
    expect(SelectOutputSchema.safeParse({ ...selectOutput, selected }).success).toBe(false);
  });
});

describe("AnswerOutputSchema", () => {
  it("accepts a valid answer output", () => {
    expect(AnswerOutputSchema.parse(answerOutput)).toEqual(answerOutput);
  });

  it("rejects an unknown evidence level", () => {
    expect(AnswerOutputSchema.safeParse({ ...answerOutput, evidence_level: "certain" }).success).toBe(false);
  });
});

describe("SourceSchema", () => {
  it("rejects a source with an unknown type", () => {
    expect(SourceSchema.safeParse({ type: "news", id: "evt_001" }).success).toBe(false);
  });

  it("rejects a company_profile source with a field outside the profile", () => {
    expect(SourceSchema.safeParse({ type: "company_profile", field: "ceo_name" }).success).toBe(false);
  });

  it("rejects an event source with a malformed id", () => {
    expect(SourceSchema.safeParse({ type: "event", id: "evt_1" }).success).toBe(false);
  });
});
