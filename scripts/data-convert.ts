import { writeFile } from "node:fs/promises";
import path from "node:path";
import { readSheet } from "read-excel-file/node";
import { rowsToCompany, rowsToEvents, type Cell } from "@/data/convert";

const DATA_DIR = path.resolve(__dirname, "..", "data");
const EVENTS_WORKBOOK = path.join(DATA_DIR, "raw", "event_intelligence_exercise_events.xlsx");
const COMPANY_WORKBOOK = path.join(DATA_DIR, "raw", "event_intelligence_exercise_company_context.xlsx");

/** Reads one sheet, selected by name, as rows of cells. */
async function readRows(workbook: string, sheet: string): Promise<Cell[][]> {
  const rows = await readSheet(workbook, sheet);
  // The package declares date cells as `typeof Date`; at runtime they are Date instances.
  return rows as unknown as Cell[][];
}

/** Writes a value to data/<name> as 2-space JSON with a trailing newline and reports it. */
async function writeJson(name: string, value: unknown, summary: string): Promise<void> {
  await writeFile(path.join(DATA_DIR, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`data/${name}: ${summary}`);
}

/** Converts both source workbooks into the JSON files the app reads. */
async function main(): Promise<void> {
  const events = rowsToEvents(await readRows(EVENTS_WORKBOOK, "Events"));
  const company = rowsToCompany(await readRows(COMPANY_WORKBOOK, "Company Context"));
  await writeJson("events.json", events, `${events.length} events`);
  await writeJson("company.json", company, `${Object.keys(company).length} fields`);
}

/** Prints why the conversion failed and marks the process as failed. */
function fail(error: unknown): void {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

main().catch(fail);
