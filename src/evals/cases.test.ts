import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadEvents } from "@/data/load";
import { CASES_DIR, type EvalCase, loadCases } from "@/evals/case";

const cases = loadCases();
const knownIds = new Set(loadEvents().map((event) => event.event_id));

const TAGS = ["core", "adversarial", "follow-up", "insufficient-evidence"];

/** Every event id written anywhere in a piece of text. */
const idsIn = (text: string): string[] => text.match(/evt_\d{3}/g) ?? [];

/** Ids a case treats as real events: the ones it expects to be cited. */
const citedByExpectation = (c: EvalCase): string[] => [...c.expect.must_cite, ...c.expect.must_cite_any];

/** Ids named in a case's question, history and judge criteria. */
const idsInCaseText = (c: EvalCase): string[] =>
  [c.question, ...c.history.map((turn) => turn.text), ...c.judge].flatMap(idsIn);

/** Tells whether a case sets at least one deterministic expectation. */
const hasExpectation = (c: EvalCase): boolean =>
  Object.values(c.expect).some((value) => (Array.isArray(value) ? value.length > 0 : value));

/** The follow-up cases, split by whether they carry earlier turns. */
const followUps = cases.filter((c) => c.tags.includes("follow-up"));
const withHistory = followUps.filter((c) => c.history.length > 0);
const fresh = followUps.filter((c) => c.history.length === 0);

describe("committed eval cases", () => {
  it("has at least the thirteen cases from the brief", () => {
    expect(cases.length).toBeGreaterThanOrEqual(13);
  });

  it("has unique ids", () => {
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names every file after the id of the case it holds", () => {
    const files = readdirSync(CASES_DIR).filter((name) => name.endsWith(".json"));
    expect([...files].sort()).toEqual(cases.map((c) => `${c.id}.json`).sort());
  });

  it("tags every case from a fixed vocabulary, as exactly one of core or adversarial", () => {
    for (const c of cases) {
      expect(c.tags.filter((tag) => !TAGS.includes(tag)), c.id).toEqual([]);
      expect(c.tags.filter((tag) => tag === "core" || tag === "adversarial"), c.id).toHaveLength(1);
    }
  });

  it("expects citations only to events that exist", () => {
    for (const c of cases) {
      expect(citedByExpectation(c).filter((id) => !knownIds.has(id)), c.id).toEqual([]);
    }
  });

  it("forbids only real events, or ids the case names on purpose as missing", () => {
    for (const c of cases) {
      const named = new Set(idsIn(c.question));
      const bogus = c.expect.must_not_cite.filter((id) => !knownIds.has(id) && !named.has(id));
      expect(bogus, c.id).toEqual([]);
    }
  });

  it("names only real events in question, history and judge text, except ids it forbids citing", () => {
    for (const c of cases) {
      const allowed = new Set(c.expect.must_not_cite);
      expect(idsInCaseText(c).filter((id) => !knownIds.has(id) && !allowed.has(id)), c.id).toEqual([]);
    }
  });

  it("never expects and forbids the same event", () => {
    for (const c of cases) {
      const forbidden = new Set(c.expect.must_not_cite);
      expect(citedByExpectation(c).filter((id) => forbidden.has(id)), c.id).toEqual([]);
    }
  });

  it("never requires and forbids the same phrase", () => {
    for (const c of cases) {
      const forbidden = new Set(c.expect.must_not_mention.map((phrase) => phrase.toLowerCase()));
      expect(c.expect.must_mention.filter((phrase) => forbidden.has(phrase.toLowerCase())), c.id).toEqual([]);
    }
  });

  it("gives every case at least one deterministic expectation or judge criterion", () => {
    for (const c of cases) {
      expect(hasExpectation(c) || c.judge.length > 0, c.id).toBe(true);
    }
  });

  it("gives every case two to four judge criteria", () => {
    for (const c of cases) {
      expect(c.judge.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.judge.length, c.id).toBeLessThanOrEqual(4);
    }
  });

  it("starts every history with the user, alternates turns and ends with the assistant", () => {
    for (const c of cases.filter((item) => item.history.length > 0)) {
      const roles = c.history.map((turn) => turn.role);
      const alternating = roles.map((_, i) => (i % 2 === 0 ? "user" : "assistant"));
      expect(roles, c.id).toEqual(alternating);
      expect(roles.at(-1), c.id).toBe("assistant");
    }
  });

  it("allows only none as the evidence level for the interest-rate case", () => {
    const rates = cases.find((c) => c.id === "interest-rates-no-evidence");
    expect(rates?.expect.evidence_level).toEqual(["none"]);
  });
});

describe("follow-up and history behaviour", () => {
  it("includes a follow-up whose history names real events and whose expected citations come from it", () => {
    expect(withHistory.length).toBeGreaterThan(0);
    for (const c of withHistory) {
      const named = new Set(c.history.filter((turn) => turn.role === "assistant").flatMap((turn) => idsIn(turn.text)));
      expect(named.size, c.id).toBeGreaterThan(0);
      expect([...named].filter((id) => !knownIds.has(id)), c.id).toEqual([]);
      expect(citedByExpectation(c).filter((id) => !named.has(id)), c.id).toEqual([]);
    }
  });

  it("includes a fresh follow-up with empty history that expects no citation and allows evidence none", () => {
    expect(fresh.length).toBeGreaterThan(0);
    for (const c of fresh) {
      expect(citedByExpectation(c), c.id).toEqual([]);
      expect(c.expect.evidence_level, c.id).toContain("none");
      expect(c.expect.facts_required, c.id).toBe(false);
    }
  });

  it("asks the fresh follow-up about an earlier list it does not have", () => {
    for (const c of fresh) {
      expect(c.question.toLowerCase(), c.id).toMatch(/\b(those|these|them|that)\b/);
    }
  });
});
