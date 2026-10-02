import { CompanyProfileSchema, type CompanyProfile } from "@/domain/company";
import { EventSchema, type Event } from "@/domain/event";
import companyJson from "../../data/company.json";
import eventsJson from "../../data/events.json";

/** Throws an error naming the first event id that appears more than once. */
export function assertUniqueIds(events: Event[]): void {
  const seen = new Set<string>();
  for (const { event_id } of events) {
    if (seen.has(event_id)) {
      throw new Error(`Duplicate event id: ${event_id}`);
    }
    seen.add(event_id);
  }
}

/** Loads the committed events, validating every row and rejecting duplicate ids. */
export function loadEvents(): Event[] {
  const events = EventSchema.array().parse(eventsJson);
  assertUniqueIds(events);
  return events;
}

/** Loads the committed company profile, validating it against the profile schema. */
export function loadCompany(): CompanyProfile {
  return CompanyProfileSchema.parse(companyJson);
}
