import { describe, expect, it } from "vitest";
import type { AnswerOutput, Claim, Source } from "@/domain/stages";
import { ExpectationsSchema } from "@/evals/case";
import {
  checkEvidenceLevel,
  checkFactsRequired,
  checkFactsHaveEventSources,
  checkMustCite,
  checkMustCiteAny,
  checkMustMention,
  checkMustNotCite,
  checkMustNotMention,
  citedEventIds,
  runChecks,
} from "@/evals/checks";

/** Builds an event citation. */
const ev = (id: string): Source => ({ type: "event", id });

/** Builds a claim with the given sources. */
const claim = (text: string, ...sources: Source[]): Claim => ({ claim: text, sources });

const answer: AnswerOutput = {
  summary: "A Cloud outage and new chip licensing both matter.",
  facts: [
    claim("A regional outage lasted six hours.", ev("evt_001")),
    claim("Two chip chemicals now need export licences.", ev("evt_006"), ev("evt_001")),
  ],
  analysis: [
    claim("Recurring software revenue is exposed.", ev("evt_027"), { type: "company_profile", field: "revenue_mix" }),
    claim("Supplier reviews may raise costs.", ev("evt_006")),
  ],
  evidence_level: "strong",
  missing_info: "Nothing in the data mentions interest rates.",
  follow_ups: ["Ask about the Red Sea route."],
};

const empty: AnswerOutput = {
  summary: "The data has nothing on this.",
  facts: [],
  analysis: [],
  evidence_level: "none",
  missing_info: "No event covers interest rates.",
  follow_ups: [],
};

describe("citedEventIds", () => {
  it("lists event ids from facts then analysis, each once, in first-seen order", () => {
    expect(citedEventIds(answer)).toEqual(["evt_001", "evt_006", "evt_027"]);
  });

  it("ignores company profile sources", () => {
    const profileOnly = { ...empty, analysis: [claim("We rely on cloud.", { type: "company_profile", field: "critical_dependencies" })] };
    expect(citedEventIds(profileOnly)).toEqual([]);
  });

  it("counts an id cited only in analysis", () => {
    expect(citedEventIds({ ...empty, analysis: [claim("Concentration is rising.", ev("evt_027"))] })).toEqual(["evt_027"]);
  });
});

describe("checkMustCite", () => {
  it("passes when every required id is cited in facts or analysis", () => {
    expect(checkMustCite(["evt_001", "evt_027"], answer)).toMatchObject({ name: "must_cite", pass: true });
  });

  it("fails and names each missing id", () => {
    const result = checkMustCite(["evt_001", "evt_004", "evt_021"], answer);
    expect(result).toMatchObject({ name: "must_cite", pass: false });
    expect(result.detail).toContain("evt_004");
    expect(result.detail).toContain("evt_021");
    expect(result.detail).not.toContain("evt_001");
  });
});

describe("checkMustCiteAny", () => {
  it("passes when one accepted id is cited and names it", () => {
    const result = checkMustCiteAny(["evt_004", "evt_027"], answer);
    expect(result).toMatchObject({ name: "must_cite_any", pass: true });
    expect(result.detail).toContain("evt_027");
  });

  it("fails when none of the accepted ids is cited and lists them", () => {
    const result = checkMustCiteAny(["evt_004", "evt_021"], answer);
    expect(result).toMatchObject({ name: "must_cite_any", pass: false });
    expect(result.detail).toContain("evt_004");
    expect(result.detail).toContain("evt_021");
  });

  it("passes when the accepted set is empty", () => {
    expect(checkMustCiteAny([], empty).pass).toBe(true);
  });
});

describe("checkMustNotCite", () => {
  it("passes when no forbidden id is cited", () => {
    expect(checkMustNotCite(["evt_012", "evt_099"], answer)).toMatchObject({ name: "must_not_cite", pass: true });
  });

  it("fails and names the forbidden ids that were cited", () => {
    const result = checkMustNotCite(["evt_012", "evt_027"], answer);
    expect(result).toMatchObject({ name: "must_not_cite", pass: false });
    expect(result.detail).toContain("evt_027");
    expect(result.detail).not.toContain("evt_012");
  });
});

describe("checkEvidenceLevel", () => {
  it("passes when the level is one of the allowed levels", () => {
    expect(checkEvidenceLevel(["strong", "partial"], answer)).toMatchObject({ name: "evidence_level", pass: true });
  });

  it("fails and names the reported level when it is not allowed", () => {
    const result = checkEvidenceLevel(["none"], answer);
    expect(result).toMatchObject({ name: "evidence_level", pass: false });
    expect(result.detail).toContain("strong");
  });

  it("passes any level when no levels are given", () => {
    expect(checkEvidenceLevel([], empty).pass).toBe(true);
  });
});

describe("checkMustMention", () => {
  it("passes when every phrase occurs in summary, facts or analysis, ignoring case", () => {
    const result = checkMustMention(["cloud", "SIX HOURS", "software revenue"], answer);
    expect(result).toMatchObject({ name: "must_mention", pass: true });
  });

  it("fails and names each missing phrase", () => {
    const result = checkMustMention(["cloud", "freight", "grid"], answer);
    expect(result).toMatchObject({ name: "must_mention", pass: false });
    expect(result.detail).toContain("freight");
    expect(result.detail).toContain("grid");
    expect(result.detail).not.toContain("cloud");
  });

  it("does not search missing_info or follow_ups", () => {
    expect(checkMustMention(["interest rates"], answer).pass).toBe(false);
    expect(checkMustMention(["red sea"], answer).pass).toBe(false);
  });

  it("does not match a phrase split across two claims", () => {
    expect(checkMustMention(["hours. two"], answer).pass).toBe(false);
  });
});

describe("checkMustNotMention", () => {
  it("passes when no forbidden phrase occurs", () => {
    const result = checkMustNotMention(["Red Sea", "interest rates"], answer);
    expect(result).toMatchObject({ name: "must_not_mention", pass: true });
  });

  it("fails and names each phrase found, ignoring case", () => {
    const result = checkMustNotMention(["OUTAGE", "Red Sea"], answer);
    expect(result).toMatchObject({ name: "must_not_mention", pass: false });
    expect(result.detail).toContain("OUTAGE");
    expect(result.detail).not.toContain("Red Sea");
  });
});

describe("checkFactsRequired", () => {
  it("passes when the answer states at least one fact", () => {
    expect(checkFactsRequired(answer)).toMatchObject({ name: "facts_required", pass: true });
  });

  it("fails when the answer has no facts", () => {
    const result = checkFactsRequired({ ...empty, analysis: [claim("Costs may rise.", ev("evt_004"))] });
    expect(result).toMatchObject({ name: "facts_required", pass: false });
    expect(result.detail).not.toBe("");
  });
});

describe("checkFactsHaveEventSources", () => {
  it("passes when every fact cites an event", () => {
    expect(checkFactsHaveEventSources(answer)).toMatchObject({ name: "facts_have_event_sources", pass: true });
  });

  it("allows a safe refusal with no factual claims", () => {
    expect(checkFactsHaveEventSources(empty).pass).toBe(true);
  });

  it.each([
    ["uncited", []],
    ["profile-only", [{ type: "company_profile", field: "critical_dependencies" }]],
  ] as const)("rejects a deliberately %s factual claim", (_label, sources) => {
    const ungrounded = { ...answer, facts: [...answer.facts, claim("Asteron's Poland plant lost power.", ...sources)] };
    const result = checkFactsHaveEventSources(ungrounded);
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("Asteron's Poland plant lost power.");
  });

  it("runs when the case enables fact citation coverage", () => {
    const expectation = ExpectationsSchema.parse({ facts_have_event_sources: true });
    expect(runChecks(expectation, { ...empty, facts: [claim("The plant closed.")] })).toEqual([
      { name: "facts_have_event_sources", pass: false, detail: "Facts without event citations: The plant closed." },
    ]);
  });
});

describe("runChecks", () => {
  it("runs nothing when no expectation is set", () => {
    expect(runChecks(ExpectationsSchema.parse({}), answer)).toEqual([]);
  });

  it("runs only the configured checks", () => {
    const expectations = ExpectationsSchema.parse({ must_not_cite: ["evt_099"], facts_required: true });
    expect(runChecks(expectations, answer).map((r) => r.name)).toEqual(["must_not_cite", "facts_required"]);
  });

  it("skips facts_required when it is false", () => {
    const expectations = ExpectationsSchema.parse({ evidence_level: ["none"], facts_required: false });
    expect(runChecks(expectations, empty).map((r) => r.name)).toEqual(["evidence_level"]);
  });

  it("returns every check in a fixed order regardless of key order", () => {
    const expectations = ExpectationsSchema.parse({
      facts_required: true,
      must_not_mention: ["Red Sea"],
      must_mention: ["cloud"],
      evidence_level: ["strong"],
      must_not_cite: ["evt_012"],
      must_cite_any: ["evt_006"],
      must_cite: ["evt_001"],
    });
    expect(runChecks(expectations, answer).map((r) => r.name)).toEqual([
      "must_cite",
      "must_cite_any",
      "must_not_cite",
      "evidence_level",
      "must_mention",
      "must_not_mention",
      "facts_required",
    ]);
  });

  it("passes the expectation values to each check and reports failures", () => {
    const expectations = ExpectationsSchema.parse({ must_cite: ["evt_021"], evidence_level: ["strong"] });
    const results = runChecks(expectations, answer);
    expect(results.map((r) => [r.name, r.pass])).toEqual([
      ["must_cite", false],
      ["evidence_level", true],
    ]);
    expect(results[0].detail).toContain("evt_021");
  });
});
