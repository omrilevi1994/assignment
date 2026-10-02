import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FixtureRecord, fixtureDir, fixtureKey, readFixture, writeFixture } from "./fixtures";

const call = { stage: "answer", model: "openai/gpt-4o-mini", system: "Be brief.", input: "Hello" };

const record: FixtureRecord = {
  ...call,
  object: { answer: "Hi" },
  usage: { inputTokens: 12, outputTokens: 3 },
  raw: '{"answer":"Hi"}',
  recordedAt: "2026-10-02T12:00:00.000Z",
};

describe("fixtureKey", () => {
  it("is a stable sha256 hex digest", () => {
    expect(fixtureKey(call)).toMatch(/^[0-9a-f]{64}$/);
    expect(fixtureKey({ ...call })).toBe(fixtureKey(call));
  });

  it("changes when any of stage, model, system or input changes", () => {
    const base = fixtureKey(call);
    expect(fixtureKey({ ...call, stage: "select" })).not.toBe(base);
    expect(fixtureKey({ ...call, model: "google/gemma-3-4b-it" })).not.toBe(base);
    expect(fixtureKey({ ...call, system: "Be thorough." })).not.toBe(base);
    expect(fixtureKey({ ...call, input: "Hello!" })).not.toBe(base);
  });

  it("does not let text move between fields and collide", () => {
    expect(fixtureKey({ ...call, system: "ab", input: "c" })).not.toBe(fixtureKey({ ...call, system: "a", input: "bc" }));
  });
});

describe("readFixture / writeFixture", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "llm-fixtures-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a record through <dir>/<key>.json as readable JSON", () => {
    const key = fixtureKey(call);
    writeFixture(path.join(dir, "nested"), key, record);
    expect(readFixture(path.join(dir, "nested"), key)).toEqual(record);
    const text = readFileSync(path.join(dir, "nested", `${key}.json`), "utf8");
    expect(text).toContain('\n  "stage": "answer",\n');
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("returns undefined when there is no fixture for the key", () => {
    expect(readFixture(dir, fixtureKey(call))).toBeUndefined();
  });
});

describe("fixtureDir", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to fixtures/llm under the working directory", () => {
    vi.stubEnv("LLM_FIXTURE_DIR", undefined);
    expect(fixtureDir()).toBe(path.resolve(process.cwd(), "fixtures/llm"));
  });

  it("uses LLM_FIXTURE_DIR when set", () => {
    vi.stubEnv("LLM_FIXTURE_DIR", "/tmp/elsewhere");
    expect(fixtureDir()).toBe(path.resolve("/tmp/elsewhere"));
  });

  it("prefers an explicit directory over the environment", () => {
    vi.stubEnv("LLM_FIXTURE_DIR", "/tmp/elsewhere");
    expect(fixtureDir("/tmp/explicit")).toBe(path.resolve("/tmp/explicit"));
  });
});
