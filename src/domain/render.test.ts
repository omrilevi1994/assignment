import { describe, expect, it } from "vitest";
import { COMPANY_FIELDS, type CompanyProfile } from "@/domain/company";
import type { Event } from "@/domain/event";
import {
  SELECT_CONTEXT_CHAR_BUDGET,
  renderCompact,
  renderCompanyProfile,
  renderFull,
  renderFullList,
} from "@/domain/render";

const outage: Event = {
  event_id: "evt_001",
  event_date: "2026-09-29",
  title: "Major cloud provider suffers six-hour regional outage",
  summary: "A software configuration failure disrupted services across one region.",
  region: "Global",
  domain: "Technology",
  source_name: "Example Wire",
  source_url: "https://example.invalid/evt_001",
};

const strike: Event = {
  event_id: "evt_002",
  event_date: "2026-09-30",
  title: "Port workers announce a three-day strike",
  summary: "Dockworkers walked out over a wage dispute, delaying container traffic.",
  region: "Europe",
  domain: "Logistics",
  source_name: "Harbour Daily",
  source_url: "https://example.invalid/evt_002",
};

const ruling: Event = {
  event_id: "evt_003",
  event_date: "2026-10-01",
  title: "Regulator issues new data-retention ruling",
  summary: "Companies must now keep audit logs for at least two years.",
  region: "North America",
  domain: "Regulation",
  source_name: "Policy Brief",
  source_url: "https://example.invalid/evt_003",
};

describe("SELECT_CONTEXT_CHAR_BUDGET", () => {
  it("is 4000 characters", () => {
    expect(SELECT_CONTEXT_CHAR_BUDGET).toBe(4000);
  });
});

describe("renderCompact", () => {
  it("renders one line per event in input order", () => {
    const lines = renderCompact([strike, outage, ruling]).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("evt_002");
    expect(lines[1]).toContain("evt_001");
    expect(lines[2]).toContain("evt_003");
  });

  it("uses the exact id, date, title and domain line format", () => {
    expect(renderCompact([outage])).toBe(
      "evt_001 · 2026-09-29 · Major cloud provider suffers six-hour regional outage · Technology",
    );
  });

  it("joins lines with a single newline and no trailing newline", () => {
    expect(renderCompact([outage, strike])).toBe(
      [
        "evt_001 · 2026-09-29 · Major cloud provider suffers six-hour regional outage · Technology",
        "evt_002 · 2026-09-30 · Port workers announce a three-day strike · Logistics",
      ].join("\n"),
    );
  });

  it("leaves the summary out", () => {
    const rendered = renderCompact([outage, strike, ruling]);
    expect(rendered).not.toContain(outage.summary);
    expect(rendered).not.toContain(strike.summary);
    expect(rendered).not.toContain(ruling.summary);
  });

  it("returns an empty string for an empty array", () => {
    expect(renderCompact([])).toBe("");
  });
});

describe("renderFull", () => {
  it("renders the exact four-line block", () => {
    expect(renderFull(outage)).toBe(
      [
        "[evt_001] 2026-09-29 · Major cloud provider suffers six-hour regional outage",
        "Region: Global · Domain: Technology",
        "Source: Example Wire (https://example.invalid/evt_001)",
        "Summary: A software configuration failure disrupted services across one region.",
      ].join("\n"),
    );
  });

  it("contains every field value", () => {
    const rendered = renderFull(strike);
    for (const value of Object.values(strike)) {
      expect(rendered).toContain(value);
    }
  });

  it("has exactly four lines", () => {
    expect(renderFull(ruling).split("\n")).toHaveLength(4);
  });
});

describe("renderFullList", () => {
  it("separates two events with exactly one blank line", () => {
    expect(renderFullList([outage, strike])).toBe(`${renderFull(outage)}\n\n${renderFull(strike)}`);
  });

  it("keeps input order and adds no trailing separator", () => {
    const rendered = renderFullList([strike, outage, ruling]);
    expect(rendered.indexOf("[evt_002]")).toBeLessThan(rendered.indexOf("[evt_001]"));
    expect(rendered.indexOf("[evt_001]")).toBeLessThan(rendered.indexOf("[evt_003]"));
    expect(rendered.endsWith("\n")).toBe(false);
  });

  it("returns an empty string for an empty array", () => {
    expect(renderFullList([])).toBe("");
  });
});

describe("renderCompanyProfile", () => {
  const profile = Object.fromEntries(COMPANY_FIELDS.map((field) => [field, `value of ${field}`])) as CompanyProfile;

  it("renders one `field_name: value` line per profile field, in workbook order", () => {
    expect(renderCompanyProfile(profile).split("\n")).toEqual(
      COMPANY_FIELDS.map((field) => `${field}: value of ${field}`),
    );
  });

  it("starts with the company name and ends with the chat user, without a trailing newline", () => {
    const rendered = renderCompanyProfile({ ...profile, company_name: "Asteron Systems" });
    expect(rendered.startsWith("company_name: Asteron Systems\n")).toBe(true);
    expect(rendered.endsWith("chat_user: value of chat_user")).toBe(true);
  });

  it("ignores keys that are not profile fields", () => {
    const extra = { ...profile, note: "not a field" } as CompanyProfile;
    expect(renderCompanyProfile(extra)).not.toContain("not a field");
  });
});
