import type { z } from "zod";
import { COMPANY_FIELDS, CompanyProfileSchema, type CompanyField, type CompanyProfile } from "@/domain/company";
import { EventSchema, type Event } from "@/domain/event";

/** One spreadsheet cell as the workbook reader returns it; empty cells are null or undefined. */
export type Cell = string | number | boolean | Date | null | undefined;

/** A validation problem in the shape Zod reports it. */
type Issue = { path: PropertyKey[]; message: string };

/** Pads a date part to two digits. */
function twoDigits(part: number): string {
  return String(part).padStart(2, "0");
}

/**
 * Turns a cell into a trimmed string. Dates arrive at UTC midnight, so the
 * UTC parts give the calendar date the sheet shows, whatever the local zone.
 */
function cellToString(cell: Cell): string {
  if (cell instanceof Date) {
    const month = twoDigits(cell.getUTCMonth() + 1);
    return `${cell.getUTCFullYear()}-${month}-${twoDigits(cell.getUTCDate())}`;
  }
  return cell === null || cell === undefined ? "" : String(cell).trim();
}

/** Pairs each cell of a row with the column name at the same position. */
function rowToRecord(columns: string[], row: Cell[]): Record<string, string | undefined> {
  const record: Record<string, string | undefined> = {};
  for (const [index, column] of columns.entries()) {
    record[column] = cellToString(row[index]);
  }
  return record;
}

/** Splits a sheet into its header names and its data rows. */
function splitHeader(rows: Cell[][]): { columns: string[]; body: Cell[][] } {
  const [header = [], ...body] = rows;
  return { columns: header.map(cellToString), body };
}

/** Renders one validation issue as `path: message`. */
function formatIssue(issue: Issue): string {
  return `${issue.path.map(String).join(".")}: ${issue.message}`;
}

/** Parses a value with a schema, prefixing any failure with where the value came from. */
function parseWith<T>(schema: z.ZodType<T>, value: unknown, where: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${where}: ${result.error.issues.map(formatIssue).join("; ")}`);
  }
  return result.data;
}

/** Converts the Events sheet (header row first) into validated events. */
export function rowsToEvents(rows: Cell[][]): Event[] {
  const { columns, body } = splitHeader(rows);
  const events: Event[] = [];
  for (const [index, row] of body.entries()) {
    // Sheet rows are 1-based and row 1 is the header.
    events.push(parseWith(EventSchema, rowToRecord(columns, row), `Events row ${index + 2}`));
  }
  return events;
}

/** Maps a workbook label such as "Revenue mix" to its field key, "revenue_mix". */
export function labelToField(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Tells whether a key is one of the company profile fields. */
function isCompanyField(key: string): key is CompanyField {
  return (COMPANY_FIELDS as readonly string[]).includes(key);
}

/** Resolves a label to a profile field, or throws naming the sheet row. */
function fieldFor(label: string, where: string): CompanyField {
  const key = labelToField(label);
  if (!isCompanyField(key)) {
    throw new Error(`${where}: unknown field label "${label}"`);
  }
  return key;
}

/** Converts the Company Context sheet (`Field | Value` header first) into a validated profile. */
export function rowsToCompany(rows: Cell[][]): CompanyProfile {
  const { columns, body } = splitHeader(rows);
  const profile: Partial<Record<CompanyField, string>> = {};
  for (const [index, row] of body.entries()) {
    const record = rowToRecord(columns, row);
    profile[fieldFor(record.Field ?? "", `Company Context row ${index + 2}`)] = record.Value;
  }
  return parseWith(CompanyProfileSchema, profile, "Company Context");
}
