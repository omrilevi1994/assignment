import { describe, expect, it } from "vitest";
import { COMPANY_FIELDS } from "@/domain/company";
import { EventSchema, type Event } from "@/domain/event";
import { SELECT_CONTEXT_CHAR_BUDGET, renderCompact } from "@/domain/render";
import { assertUniqueIds, loadCompany, loadEvents } from "@/data/load";

/** Builds a minimal valid event with the given id. */
function eventWithId(id: string): Event {
  return {
    event_id: id,
    event_date: "2026-09-29",
    title: `Title for ${id}`,
    summary: `Summary for ${id}`,
    region: "Global",
    domain: "Technology",
    source_name: "Example Wire",
    source_url: `https://example.invalid/${id}`,
  };
}

describe("loadEvents", () => {
  it("returns exactly 30 events", () => {
    expect(loadEvents()).toHaveLength(30);
  });

  it("has unique ids that run from evt_001 to evt_030", () => {
    const ids = loadEvents().map((event) => event.event_id);
    const expected = Array.from({ length: 30 }, (_, i) => `evt_${String(i + 1).padStart(3, "0")}`);
    expect(new Set(ids).size).toBe(30);
    expect([...ids].sort()).toEqual(expected);
  });

  it("returns events that all pass the event schema", () => {
    expect(EventSchema.array().safeParse(loadEvents()).success).toBe(true);
  });
});

describe("assertUniqueIds", () => {
  it("throws on a duplicate id and names it in the message", () => {
    const events = [eventWithId("evt_001"), eventWithId("evt_002"), eventWithId("evt_001")];
    expect(() => assertUniqueIds(events)).toThrow(/evt_001/);
  });

  it("does not throw when every id is distinct", () => {
    const events = [eventWithId("evt_001"), eventWithId("evt_002"), eventWithId("evt_003")];
    expect(() => assertUniqueIds(events)).not.toThrow();
  });
});

describe("loadCompany", () => {
  it("returns the Asteron Systems profile", () => {
    expect(loadCompany().company_name).toBe("Asteron Systems");
  });

  it("has exactly the company profile fields", () => {
    expect(Object.keys(loadCompany()).sort()).toEqual([...COMPANY_FIELDS].sort());
  });
});

describe("compact catalogue budget", () => {
  it("fits every event within the selection context budget", () => {
    expect(renderCompact(loadEvents()).length).toBeLessThan(SELECT_CONTEXT_CHAR_BUDGET);
  });
});
