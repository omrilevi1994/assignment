import fs from "node:fs";
import path from "node:path";
import { cruise } from "dependency-cruiser";
import extractTSConfig from "dependency-cruiser/config-utl/extract-ts-config";
import type { ICruiseResult, IFlattenedRuleSet } from "dependency-cruiser";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import config from "../.dependency-cruiser.cjs";

// The only-gateway-talks-to-models rule is not covered here: the `ai` package is not installed on this branch yet.

const root = path.resolve(__dirname, "..");
const writtenFiles = new Set<string>();
const createdDirs = new Set<string>();

/**
 * Writes a throwaway fixture inside the real src/ tree, remembering what it created.
 */
function writeFixture(relPath: string, code: string): void {
  const file = path.join(root, relPath);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    createdDirs.add(dir);
  }
  fs.writeFileSync(file, code);
  writtenFiles.add(file);
}

/**
 * Removes every fixture file written so far, and any directory the tests created once it is empty.
 */
function removeFixtures(): void {
  for (const file of writtenFiles) fs.rmSync(file, { force: true });
  writtenFiles.clear();
  for (const dir of createdDirs) {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
  createdDirs.clear();
}

/**
 * Cruises a single file with the repository's rule set, resolving modules the way `pnpm lint` does.
 */
async function cruiseFile(relPath: string): Promise<ICruiseResult> {
  const ruleSet = { forbidden: config.forbidden } as IFlattenedRuleSet;
  const tsConfig = extractTSConfig(config.options.tsConfig.fileName);
  const { output } = await cruise([relPath], { ...config.options, ruleSet, validate: true }, {}, { tsConfig });
  return output as ICruiseResult;
}

/**
 * Writes a fixture, cruises it, and always removes it again.
 */
async function cruiseFixture(relPath: string, code: string): Promise<ICruiseResult> {
  try {
    writeFixture(relPath, code);
    return await cruiseFile(relPath);
  } finally {
    removeFixtures();
  }
}

afterEach(removeFixtures);
afterAll(removeFixtures);

describe("module boundary rules", () => {
  it("flags a package import from the domain layer", async () => {
    const result = await cruiseFixture("src/domain/__boundary_fixture__.ts", 'import "react";\n');
    const names = result.summary.violations.map((v) => v.rule.name);
    expect(names).toContain("domain-is-pure");
  });

  it("flags a framework import from the pipeline layer", async () => {
    const result = await cruiseFixture("src/pipeline/__boundary_fixture__.ts", 'import "next/server";\n');
    const names = result.summary.violations.map((v) => v.rule.name);
    expect(names).toContain("pipeline-has-no-ui-or-db");
  });

  it("accepts a data layer import of the domain", async () => {
    const result = await cruiseFixture("src/data/__boundary_fixture__.ts", 'import "@/domain/event";\n');
    expect(result.summary.violations).toEqual([]);
  });
});
