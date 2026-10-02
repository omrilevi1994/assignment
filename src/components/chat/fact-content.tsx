"use client";

import type { CompanyField, CompanyProfile } from "@/domain/company";
import type { Event } from "@/domain/event";
import type { Claim } from "@/domain/stages";
import { EventChip, ProfileChip } from "./citations";
import { eventIds, profileFields } from "./derive";

interface FactContentProps {
  fact: Claim;
  events: readonly Event[];
  company: CompanyProfile;
  leadingEventId?: string;
  onEventPick?: (id: string) => void;
}

/** Keeps every cited profile field visible as company context rather than event evidence. */
export function ProfileFields({ fields, company }: { fields: readonly CompanyField[]; company: CompanyProfile }) {
  return fields.map((field) => <div key={field} className="flex items-start gap-2.5 text-[12.5px] leading-[18px] text-[#6B6B66]">
    <ProfileChip /><p><span className="capitalize">{field.replaceAll("_", " ")}: </span><span>{company[field]}</span></p>
  </div>);
}

/** Preserves all of a fact's sources while avoiding a duplicate of its leading event chip. */
export function FactContent({ fact, events, company, leadingEventId, onEventPick }: FactContentProps) {
  const ids = eventIds([fact]).filter((id) => id !== leadingEventId);
  return <div className="space-y-1.5">
    <p><span>{fact.claim}</span>{ids.length > 0 && <span className="ml-2 inline-flex flex-wrap gap-1">{ids.map((id) => <EventChip key={id} id={id} events={events} onPick={onEventPick} />)}</span>}</p>
    <ProfileFields fields={profileFields([fact])} company={company} />
  </div>;
}
