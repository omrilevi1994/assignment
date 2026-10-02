import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const eslint = new ESLint({ cwd: root });

/**
 * Lints a snippet as if it lived at `relativePath` (default: a file under src/lib)
 * and returns the rule ids reported.
 */
async function ruleIdsFor(code: string, relativePath = "src/lib/__lint_fixture__.ts"): Promise<string[]> {
  const file = path.join(root, relativePath);
  const [result] = await eslint.lintText(code, { filePath: file });
  return result.messages.map((m) => m.ruleId ?? "fatal");
}

/**
 * Builds a function body with the given number of statements.
 */
function longFunction(lines: number): string {
  const body = Array.from({ length: lines }, (_, i) => `  const v${i} = ${i};`).join("\n");
  return `/** Long. */\nexport function long(): void {\n${body}\n}\n`;
}

const undocumented = "export function noDoc(): number {\n  return 1;\n}\n";

describe("lint rules that enforce the coding rules", () => {
  it("rejects a function without a JSDoc comment", async () => {
    const ids = await ruleIdsFor("export function noDoc(): number {\n  return 1;\n}\n");
    expect(ids).toContain("jsdoc/require-jsdoc");
  });

  it("rejects an arrow function assigned to a const without a JSDoc comment", async () => {
    const ids = await ruleIdsFor("export const noDoc = (): number => 1;\n");
    expect(ids).toContain("jsdoc/require-jsdoc");
  });

  it("rejects a function longer than 30 lines", async () => {
    const ids = await ruleIdsFor(longFunction(31));
    expect(ids).toContain("max-lines-per-function");
  });

  it("accepts a short documented function", async () => {
    const ids = await ruleIdsFor("/** Adds one. */\nexport function addOne(n: number): number {\n  return n + 1;\n}\n");
    expect(ids).toEqual([]);
  });

  it("does not require JSDoc in vendored shadcn components under src/components/ui", async () => {
    const ids = await ruleIdsFor(undocumented, "src/components/ui/x.tsx");
    expect(ids).not.toContain("jsdoc/require-jsdoc");
  });

  it("still requires JSDoc in our own components outside src/components/ui", async () => {
    const ids = await ruleIdsFor(undocumented, "src/components/x.tsx");
    expect(ids).toContain("jsdoc/require-jsdoc");
  });
});
