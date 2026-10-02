import { describe, expect, it } from "vitest";
import { citedCount, formatMeta, formatTokens, groupInferences, unusedFacts } from "./derive";
import { view } from "./test-fixtures";

describe("answer derivations", () => {
  it("pairs each inference with its known events, fact claims and profile fields", () => {
    const groups = groupInferences(view.answer, view.evidence.cited);
    expect(groups[0]).toEqual({ claim: view.answer.analysis[0].claim, events: [{ event: view.evidence.cited[0].event, facts: [view.answer.facts[0]] }], profileFields: ["revenue_mix"] });
    expect(groups[1].profileFields).toEqual([]);
  });
  it("deduplicates event references and omits unknown events", () => {
    const analysis = [{ claim: "Unsupported", sources: [{ type: "event" as const, id: "evt_099" }, ...view.answer.analysis[0].sources, ...view.answer.analysis[0].sources] }];
    const [group] = groupInferences({ ...view.answer, analysis }, view.evidence.cited);
    expect(group.events).toHaveLength(1);
    expect(group.profileFields).toEqual(["revenue_mix"]);
  });
  it("retains the facts whose events are not used by an inference", () => {
    expect(unusedFacts(view.answer)).toEqual([view.answer.facts[2]]);
  });
  it("counts distinct event citations without counting profile fields", () => {
    expect(citedCount(view.answer)).toBe(3);
  });
  it("formats totals and stage tokens deterministically", () => {
    expect(formatMeta(view.trace)).toBe("2 model calls · 6.8 s · $0.0041");
    expect(formatTokens(view.trace.stages[0])).toBe("1,842 → 96");
    expect(formatMeta({ ...view.trace, stages: view.trace.stages.slice(0, 1) })).toMatch(/^1 model call ·/);
  });
});
