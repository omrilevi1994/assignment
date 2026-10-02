import { describe, expect, it } from "vitest";
import { labelToField, rowsToCompany, rowsToEvents, type Cell } from "@/data/convert";
import { COMPANY_FIELDS } from "@/domain/company";

const EVENT_HEADER: Cell[] = [
  "event_id",
  "event_date",
  "title",
  "summary",
  "region",
  "domain",
  "source_name",
  "source_url",
];

/** Builds one valid event row in EVENT_HEADER order. */
function eventRow(id: string, date: Cell = new Date(Date.UTC(2026, 8, 29))): Cell[] {
  return [
    id,
    date,
    "Cloud outage",
    "A regional outage disrupted services.",
    "Global",
    "Technology",
    "Example Wire",
    "https://example.invalid/evt",
  ];
}

const EXPECTED_EVENT = {
  event_id: "evt_001",
  event_date: "2026-09-29",
  title: "Cloud outage",
  summary: "A regional outage disrupted services.",
  region: "Global",
  domain: "Technology",
  source_name: "Example Wire",
  source_url: "https://example.invalid/evt",
};

/** Reorders the cells of every row by a list of column indexes. */
function reorder(rows: Cell[][], order: number[]): Cell[][] {
  return rows.map((row) => order.map((index) => row[index]));
}

/** Removes the named column from a header-first table. */
function dropColumn(rows: Cell[][], name: string): Cell[][] {
  const column = rows[0].indexOf(name);
  return rows.map((row) => row.filter((_, index) => index !== column));
}

const COMPANY_LABELS = [
  "Company name",
  "Company type",
  "Business",
  "Primary markets",
  "Manufacturing footprint",
  "Revenue mix",
  "Strategic priorities",
  "Critical dependencies",
  "Key exposures",
  "Risk posture",
  "Decision horizon",
  "Chat user",
];

/** Builds a company sheet with one padded value per label. */
function companyRows(labels: string[]): Cell[][] {
  return [["Field", "Value"], ...labels.map((label) => [label, `  value of ${label}  `])];
}

describe("rowsToEvents", () => {
  it("maps cells by header name, so column order does not matter", () => {
    const rows = [EVENT_HEADER, eventRow("evt_001")];
    const shuffled = reorder(rows, [7, 3, 0, 5, 1, 6, 2, 4]);
    expect(rowsToEvents(shuffled)).toEqual([EXPECTED_EVENT]);
  });

  it("converts a Date cell to an ISO date using its UTC date parts", () => {
    const lateEvening = new Date(Date.UTC(2026, 0, 31, 23, 30));
    const [event] = rowsToEvents([EVENT_HEADER, eventRow("evt_001", lateEvening)]);
    expect(event.event_date).toBe("2026-01-31");
  });

  it("trims string cells", () => {
    const row = eventRow("  evt_001 ");
    row[2] = "  Cloud outage\t";
    expect(rowsToEvents([EVENT_HEADER, row])).toEqual([EXPECTED_EVENT]);
  });

  it("throws when a required column is missing", () => {
    const rows = dropColumn([EVENT_HEADER, eventRow("evt_001")], "summary");
    expect(() => rowsToEvents(rows)).toThrow(/summary/);
  });

  it("throws on a row with a bad id and names its 1-based sheet row", () => {
    const rows = [EVENT_HEADER, eventRow("evt_001"), eventRow("evt_2")];
    expect(() => rowsToEvents(rows)).toThrow(/row 3\b.*event_id/);
  });
});

describe("labelToField", () => {
  it("lower-cases a label and joins its words with underscores", () => {
    expect(labelToField("Manufacturing footprint")).toBe("manufacturing_footprint");
    expect(labelToField("Risk - posture")).toBe("risk_posture");
  });
});

describe("rowsToCompany", () => {
  it("maps the 12 workbook labels to the profile fields and trims values", () => {
    const profile = rowsToCompany(companyRows(COMPANY_LABELS));
    expect(Object.keys(profile)).toEqual([...COMPANY_FIELDS]);
    expect(profile.company_name).toBe("value of Company name");
    expect(profile.chat_user).toBe("value of Chat user");
  });

  it("throws on a label that maps to no known field", () => {
    const rows = companyRows([...COMPANY_LABELS, "Favourite colour"]);
    expect(() => rowsToCompany(rows)).toThrow(/row 14\b.*Favourite colour/);
  });

  it("throws when a field is missing", () => {
    const rows = companyRows(COMPANY_LABELS.filter((label) => label !== "Decision horizon"));
    expect(() => rowsToCompany(rows)).toThrow(/decision_horizon/);
  });
});
