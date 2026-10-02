import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { feedbackToDraft, type FeedbackDraftInput } from "../src/evals/import";

/** Writes a new file atomically with respect to competing exports and preserves existing drafts. */
function writeNew(file: string, content: string): boolean {
  try {
    writeFileSync(file, content, { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

/** Validates reports and preserves the first draft per turn/day, including any reviewed edits. */
export function writeFeedbackDrafts(records: FeedbackDraftInput[], dir: string): { written: number; skipped: number } {
  const drafts = records.map(feedbackToDraft);
  mkdirSync(dir, { recursive: true });
  let written = 0;
  for (const draft of drafts) {
    const file = path.join(dir, `${draft.id}.json`);
    if (writeNew(file, `${JSON.stringify(draft, null, 2)}\n`)) written += 1;
  }
  return { written, skipped: drafts.length - written };
}
