import { describe, expect, it } from "vitest";
import type { CompanyField } from "@/domain/company";
import type { AnswerOutput, Claim, Source } from "@/domain/stages";
import { emptyReport, isCleanReport, verify, VerifyReportSchema } from "@/domain/verify";

const knownIds = ["evt_001", "evt_002", "evt_003"];
const selectedIds = ["evt_001", "evt_002"];

/** Builds an event citation. */
const ev = (id: string): Source => ({ type: "event", id });

/** Builds a company profile citation. */
const profile = (field: CompanyField): Source => ({ type: "company_profile", field });

/** Builds a claim with the given sources. */
const claim = (text: string, ...sources: Source[]): Claim => ({ claim: text, sources });

const outageFact = claim("A regional cloud outage lasted six hours.", ev("evt_001"));
const chipFact = claim("Chip lead times grew to 40 weeks.", ev("evt_002"), profile("critical_dependencies"));
const revenueAnalysis = claim("Recurring software revenue is exposed.", ev("evt_001"), profile("revenue_mix"));

const valid: AnswerOutput = {
  summary: "The outage and the chip shortage both touch our plans.",
  facts: [outageFact, chipFact],
  analysis: [revenueAnalysis],
  evidence_level: "strong",
  missing_info: "",
  follow_ups: ["Which regions host our services?"],
};

/** Runs verify with the shared selected and known ids. */
const run = (answer: AnswerOutput) => verify(answer, selectedIds, knownIds);

const messy: AnswerOutput = {
  ...valid,
  facts: [
    claim("Rates rose by half a point.", ev("evt_999")),
    claim("We rely on two chip suppliers.", profile("critical_dependencies")),
    claim("A port strike closed Rotterdam.", ev("evt_003"), profile("key_exposures")),
  ],
  analysis: [claim("Margins may tighten.", ev("evt_998"), ev("evt_001"))],
};

describe("verify", () => {
  it("passes a fully valid answer through unchanged with an empty report", () => {
    expect(run(valid)).toEqual({ answer: valid, report: emptyReport() });
  });

  it("strips a citation to an unknown event and records it", () => {
    const text = "A regional cloud outage lasted six hours.";
    const { answer, report } = run({ ...valid, facts: [claim(text, ev("evt_001"), ev("evt_999")), chipFact] });
    expect(answer.facts).toEqual([claim(text, ev("evt_001")), chipFact]);
    expect(report.removed_citations).toEqual([{ id: "evt_999", reason: "unknown", claim: text }]);
    expect(report.demoted_claims).toEqual([]);
  });

  it("strips a citation to a known event that was not selected and records it", () => {
    const text = "Chip lead times grew to 40 weeks.";
    const { answer, report } = run({ ...valid, facts: [outageFact, claim(text, ev("evt_003"), ev("evt_002"))] });
    expect(answer.facts).toEqual([outageFact, claim(text, ev("evt_002"))]);
    expect(report.removed_citations).toEqual([{ id: "evt_003", reason: "not_selected", claim: text }]);
  });

  it("strips an unknown citation inside an analysis claim and keeps the claim", () => {
    const text = "Recurring software revenue is exposed.";
    const { answer, report } = run({ ...valid, analysis: [claim(text, ev("evt_999"), profile("revenue_mix"))] });
    expect(answer.analysis).toEqual([claim(text, profile("revenue_mix"))]);
    expect(report.removed_citations).toEqual([{ id: "evt_999", reason: "unknown", claim: text }]);
    expect(report.demoted_claims).toEqual([]);
  });

  it("moves a fact left with no sources to the end of analysis as no_event_source", () => {
    const text = "A port strike closed Rotterdam for a week.";
    const { answer, report } = run({ ...valid, facts: [outageFact, claim(text, ev("evt_999"))] });
    expect(answer.facts).toEqual([outageFact]);
    expect(answer.analysis).toEqual([revenueAnalysis, claim(text)]);
    expect(report.demoted_claims).toEqual([{ claim: text, reason: "no_event_source" }]);
    expect(report.removed_citations).toEqual([{ id: "evt_999", reason: "unknown", claim: text }]);
    expect(report.evidence_level_changed).toBeNull();
  });

  it("moves a fact backed only by the company profile to analysis as profile_only", () => {
    const profileFact = claim("We rely on two chip suppliers.", profile("critical_dependencies"));
    const { answer, report } = run({ ...valid, facts: [profileFact, outageFact] });
    expect(answer.facts).toEqual([outageFact]);
    expect(answer.analysis).toEqual([revenueAnalysis, profileFact]);
    expect(report.demoted_claims).toEqual([{ claim: profileFact.claim, reason: "profile_only" }]);
    expect(report.removed_citations).toEqual([]);
  });

  it("sets evidence_level to none and records it when no facts are left", () => {
    const { answer, report } = run({ ...valid, facts: [claim("A port strike closed Rotterdam.", ev("evt_003"))] });
    expect(answer.facts).toEqual([]);
    expect(answer.evidence_level).toBe("none");
    expect(report.evidence_level_changed).toEqual({ from: "strong", to: "none" });
  });

  it("keeps surviving facts, analysis claims and sources in their original order", () => {
    const profileFact = claim("We rely on two chip suppliers.", profile("critical_dependencies"));
    const mixed = claim(
      "Lead times and outages compound.",
      profile("key_exposures"),
      ev("evt_003"),
      ev("evt_001"),
      ev("evt_999"),
      ev("evt_002"),
    );
    const marginAnalysis = claim("Margins may tighten.", profile("revenue_mix"));
    const { answer, report } = run({
      ...valid,
      facts: [outageFact, profileFact, mixed, claim("Rates rose.", ev("evt_999")), chipFact],
      analysis: [revenueAnalysis, marginAnalysis],
    });
    const mixedKept = claim(mixed.claim, profile("key_exposures"), ev("evt_001"), ev("evt_002"));
    expect(answer.facts).toEqual([outageFact, mixedKept, chipFact]);
    expect(answer.analysis).toEqual([revenueAnalysis, marginAnalysis, profileFact, claim("Rates rose.")]);
    expect(report.demoted_claims.map((d) => d.reason)).toEqual(["profile_only", "no_event_source"]);
    expect(report.removed_citations.map((r) => r.id)).toEqual(["evt_003", "evt_999", "evt_999"]);
  });

  it("records no evidence change when the level was already none", () => {
    const { answer, report } = run({ ...valid, facts: [], evidence_level: "none" });
    expect(answer.evidence_level).toBe("none");
    expect(report.evidence_level_changed).toBeNull();
  });

  it("does not mutate the answer or the id lists it is given", () => {
    const before = structuredClone({ messy, selectedIds, knownIds });
    verify(messy, selectedIds, knownIds);
    expect({ messy, selectedIds, knownIds }).toEqual(before);
  });

  it("returns a report that satisfies VerifyReportSchema", () => {
    const { report } = run(messy);
    expect(VerifyReportSchema.parse(report)).toEqual(report);
    expect(isCleanReport(report)).toBe(false);
  });
});

describe("isCleanReport", () => {
  it("is true for an empty report", () => {
    expect(isCleanReport(emptyReport())).toBe(true);
  });

  it("is false once a citation was removed", () => {
    const report = { ...emptyReport(), removed_citations: [{ id: "evt_009", reason: "unknown" as const, claim: "x" }] };
    expect(isCleanReport(report)).toBe(false);
  });

  it("is false once a claim was demoted", () => {
    const report = { ...emptyReport(), demoted_claims: [{ claim: "x", reason: "profile_only" as const }] };
    expect(isCleanReport(report)).toBe(false);
  });

  it("is false once the evidence level changed", () => {
    const report = { ...emptyReport(), evidence_level_changed: { from: "strong" as const, to: "none" as const } };
    expect(isCleanReport(report)).toBe(false);
  });
});
