import { COMPANY_FIELDS, type CompanyProfile } from "@/domain/company";
import type { Event } from "@/domain/event";

/**
 * Upper bound on the size of the compact catalogue handed to the selection
 * stage. Characters are a cheap proxy for tokens at roughly four characters
 * per token, so 4000 characters is about 1000 tokens.
 */
export const SELECT_CONTEXT_CHAR_BUDGET = 4000;

/**
 * Renders events as a compact catalogue: one `id · date · title · domain`
 * line per event, in input order, without the summary.
 */
export function renderCompact(events: Event[]): string {
  return events
    .map((e) => `${e.event_id} · ${e.event_date} · ${e.title} · ${e.domain}`)
    .join("\n");
}

/** Renders a single event as a four-line block with all of its fields. */
export function renderFull(event: Event): string {
  return [
    `[${event.event_id}] ${event.event_date} · ${event.title}`,
    `Region: ${event.region} · Domain: ${event.domain}`,
    `Source: ${event.source_name} (${event.source_url})`,
    `Summary: ${event.summary}`,
  ].join("\n");
}

/** Renders several events in full, separated by a blank line. */
export function renderFullList(events: Event[]): string {
  return events.map(renderFull).join("\n\n");
}

/**
 * Renders the company profile as one `field_name: value` line per profile
 * field, in workbook order, so a stage can cite a field by the name it sees.
 */
export function renderCompanyProfile(profile: CompanyProfile): string {
  return COMPANY_FIELDS.map((field) => `${field}: ${profile[field]}`).join("\n");
}
