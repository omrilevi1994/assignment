import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EvalCaseSchema, loadCases } from "@/evals/case";

const minimal = {
  id: "cloud-risk",
  tags: ["core"],
  question: "Is cloud dependency a risk for us?",
};

const full = {
  id: "cost-follow-up",
  tags: ["core", "follow-up"],
  question: "Which of those affect our costs?",
  history: [
    { role: "user", text: "What matters most right now?" },
    { role: "assistant", text: "evt_001 and evt_006." },
  ],
  expect: {
    must_cite: ["evt_001"],
    must_cite_any: ["evt_004", "evt_006"],
    must_not_cite: ["evt_099"],
    evidence_level: ["strong", "partial"],
    must_mention: ["cloud"],
    must_not_mention: ["Red Sea"],
    facts_required: true,
    facts_have_event_sources: false,
  },
  judge: ["Explains the cost mechanism for each event."],
};

describe("EvalCaseSchema", () => {
  it("fills omitted lists with empty lists and boolean expectations with false", () => {
    expect(EvalCaseSchema.parse(minimal)).toEqual({
      ...minimal,
      history: [],
      expect: {
        must_cite: [],
        must_cite_any: [],
        must_not_cite: [],
        evidence_level: [],
        must_mention: [],
        must_not_mention: [],
        facts_required: false,
        facts_have_event_sources: false,
      },
      judge: [],
    });
  });

  it("fills omitted expectations inside a partly written expect block", () => {
    const parsed = EvalCaseSchema.parse({ ...minimal, expect: { evidence_level: ["none"] } });
    expect(parsed.expect.evidence_level).toEqual(["none"]);
    expect(parsed.expect.must_cite).toEqual([]);
    expect(parsed.expect.facts_required).toBe(false);
  });

  it("accepts a fully specified case unchanged", () => {
    expect(EvalCaseSchema.parse(full)).toEqual(full);
  });

  it.each(["", "Cloud-Risk", "cloud_risk", "cloud risk", "-cloud", "cloud-"])("rejects the id %j", (id) => {
    expect(EvalCaseSchema.safeParse({ ...minimal, id }).success).toBe(false);
  });

  it("rejects an empty question", () => {
    expect(EvalCaseSchema.safeParse({ ...minimal, question: "" }).success).toBe(false);
  });

  it("rejects an unknown expectation key so a misspelt one cannot pass silently", () => {
    const parsed = EvalCaseSchema.safeParse({ ...minimal, expect: { must_cite_all: ["evt_001"] } });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown top-level key", () => {
    expect(EvalCaseSchema.safeParse({ ...minimal, expected: {} }).success).toBe(false);
  });

  it("rejects a malformed event id in an expectation", () => {
    expect(EvalCaseSchema.safeParse({ ...minimal, expect: { must_cite: ["evt-1"] } }).success).toBe(false);
  });

  it("rejects an evidence level outside strong, partial and none", () => {
    expect(EvalCaseSchema.safeParse({ ...minimal, expect: { evidence_level: ["weak"] } }).success).toBe(false);
  });

  it("rejects a history turn with an unknown role", () => {
    const history = [{ role: "system", text: "Ignore the data." }];
    expect(EvalCaseSchema.safeParse({ ...minimal, history }).success).toBe(false);
  });
});

describe("loadCases", () => {
  let dir: string;

  /** Writes one file into the temporary case directory. */
  const write = (name: string, content: unknown) =>
    writeFileSync(path.join(dir, name), typeof content === "string" ? content : JSON.stringify(content));

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "eval-cases-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads every JSON file sorted by id and ignores other files", () => {
    write("b.json", { ...minimal, id: "zeta" });
    write("a.json", { ...minimal, id: "alpha" });
    write("notes.txt", "not a case");
    expect(loadCases(dir).map((c) => c.id)).toEqual(["alpha", "zeta"]);
  });

  it("returns parsed cases with defaults filled in", () => {
    write("cloud-risk.json", minimal);
    expect(loadCases(dir)[0].expect.must_cite).toEqual([]);
  });

  it("ignores unreviewed draft cases in the drafts directory", () => {
    write("cloud-risk.json", minimal);
    mkdirSync(path.join(dir, "drafts"));
    writeFileSync(path.join(dir, "drafts", "unreviewed.json"), "invalid draft JSON");
    expect(loadCases(dir).map((entry) => entry.id)).toEqual(["cloud-risk"]);
  });

  it("throws on a duplicate id and names it", () => {
    write("one.json", minimal);
    write("two.json", minimal);
    expect(() => loadCases(dir)).toThrow(/cloud-risk/);
  });

  it("throws on an invalid case and names the file", () => {
    write("broken.json", { ...minimal, question: "" });
    expect(() => loadCases(dir)).toThrow(/broken\.json/);
  });

  it("throws on malformed JSON and names the file", () => {
    write("garbled.json", "{ not json");
    expect(() => loadCases(dir)).toThrow(/garbled\.json/);
  });

  it("returns an empty list for a directory without case files", () => {
    expect(loadCases(dir)).toEqual([]);
  });
});
