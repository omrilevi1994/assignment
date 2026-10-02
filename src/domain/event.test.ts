import { describe, expect, it } from "vitest";
import { EventSchema } from "@/domain/event";

const valid = {
  event_id: "evt_001",
  event_date: "2026-09-29",
  title: "Major cloud provider suffers six-hour regional outage",
  summary: "A software configuration failure disrupted services.",
  region: "Global",
  domain: "Technology",
  source_name: "Example Wire",
  source_url: "https://example.invalid/evt_001",
};

/** Returns a copy of `obj` without `key`, typed loosely on purpose for negative tests. */
function without<T extends object>(obj: T, key: keyof T): Partial<T> {
  const copy: Partial<T> = { ...obj };
  delete copy[key];
  return copy;
}

describe("EventSchema", () => {
  it("accepts a well-formed event row", () => {
    expect(EventSchema.parse(valid)).toEqual(valid);
  });

  it("rejects a row with a missing event_id", () => {
    expect(EventSchema.safeParse(without(valid, "event_id")).success).toBe(false);
  });

  it("rejects an id that does not match evt_NNN", () => {
    expect(EventSchema.safeParse({ ...valid, event_id: "evt_1" }).success).toBe(false);
  });

  it("rejects a non-ISO date", () => {
    expect(EventSchema.safeParse({ ...valid, event_date: "29/09/2026" }).success).toBe(false);
  });

  it("rejects an impossible calendar date", () => {
    expect(EventSchema.safeParse({ ...valid, event_date: "2026-13-40" }).success).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(EventSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
  });
});
