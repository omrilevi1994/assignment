import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROMPTS_DIR, loadPrompt, promptLabel } from "./prompts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "prompts-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadPrompt", () => {
  it("reads the committed select prompt with a 12-character hex hash", () => {
    const prompt = loadPrompt("select");
    expect(prompt).toMatchObject({ name: "select", version: 1 });
    expect(prompt.text).toBe(readFileSync(path.join(PROMPTS_DIR, "select.v1.txt"), "utf8"));
    expect(prompt.hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it("reads the committed answer prompt", () => {
    const prompt = loadPrompt("answer");
    expect(prompt).toMatchObject({ name: "answer", version: 1 });
    expect(prompt.text.length).toBeGreaterThan(0);
  });

  it("hashes the text as the first 12 hex characters of its sha256", () => {
    writeFileSync(path.join(dir, "select.v1.txt"), "Pick events.");
    const expected = createHash("sha256").update("Pick events.").digest("hex").slice(0, 12);
    expect(loadPrompt("select", dir).hash).toBe(expected);
  });

  it("changes the hash when the text changes", () => {
    const file = path.join(dir, "select.v1.txt");
    writeFileSync(file, "Pick events.");
    const before = loadPrompt("select", dir).hash;
    writeFileSync(file, "Pick events carefully.");
    expect(loadPrompt("select", dir).hash).not.toBe(before);
  });

  it("uses the highest version present, comparing numbers rather than text", () => {
    writeFileSync(path.join(dir, "answer.v2.txt"), "second");
    writeFileSync(path.join(dir, "answer.v10.txt"), "tenth");
    writeFileSync(path.join(dir, "select.v99.txt"), "another prompt");
    expect(loadPrompt("answer", dir)).toMatchObject({ version: 10, text: "tenth" });
  });

  it("ignores files that only resemble a prompt file", () => {
    writeFileSync(path.join(dir, "answer.v1.txt"), "real");
    writeFileSync(path.join(dir, "answer.v3.txt.bak"), "backup");
    writeFileSync(path.join(dir, "draft-answer.v4.txt"), "draft");
    expect(loadPrompt("answer", dir)).toMatchObject({ version: 1, text: "real" });
  });

  it("names the prompt and the directory when no version exists", () => {
    expect(() => loadPrompt("answer", dir)).toThrow(/answer/);
    expect(() => loadPrompt("answer", dir)).toThrow(dir);
  });
});

describe("promptLabel", () => {
  it("reads as name, version and hash", () => {
    writeFileSync(path.join(dir, "select.v3.txt"), "Pick events.");
    const prompt = loadPrompt("select", dir);
    expect(promptLabel(prompt)).toBe(`select v3 · ${prompt.hash}`);
  });
});
