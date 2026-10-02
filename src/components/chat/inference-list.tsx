"use client";

import { useId } from "react";
import type { CompanyProfile } from "@/domain/company";
import type { Event } from "@/domain/event";
import type { AnswerOutput } from "@/domain/stages";
import { EventChip } from "./citations";
import { FactContent, ProfileFields } from "./fact-content";
import { groupInferences, shortDate } from "./derive";
import type { EvidenceEntry, InferenceGroup } from "./types";

interface InferenceListProps {
  answer: AnswerOutput;
  cited: readonly EvidenceEntry[];
  company: CompanyProfile;
  onEventPick?: (id: string) => void;
}
interface GroupProps { group: InferenceGroup; company: CompanyProfile; events: readonly Event[]; onEventPick?: (id: string) => void }

/** Keeps the event id, date, and exact factual claims together as the support for an inference. */
function EventRow({ row, events, company, onPick }: { row: InferenceGroup["events"][number]; events: readonly Event[]; company: CompanyProfile; onPick?: (id: string) => void }) {
  return <div className="flex items-start gap-2.5 text-[12.5px] leading-[18px]">
    <div className="flex shrink-0 items-center gap-1.5"><EventChip id={row.event.event_id} events={[row.event]} onPick={onPick} /><time dateTime={row.event.event_date} className="font-mono text-[10.5px] text-[#6B6B66]">{shortDate(row.event.event_date)}</time></div>
    <div className="space-y-1">{row.facts.map((fact, index) => <FactContent key={index} fact={fact} events={events} company={company} leadingEventId={row.event.event_id} onEventPick={onPick} />)}{row.facts.length === 0 && <p>{row.event.summary}</p>}</div>
  </div>;
}

/** Shows event evidence and separately labelled profile context below the analytical claim. */
function EventsBlock({ group, company, events, onEventPick }: GroupProps) {
  return <section aria-label="Events" className="space-y-1.5 rounded-lg border border-[#D3DEF8] bg-[#EEF3FF] px-3 py-2.5">
    <h3 className="text-[10.5px] font-semibold tracking-[0.06em] text-[#2F5FD8] uppercase">Events</h3>
    {group.events.map((row) => <EventRow key={row.event.event_id} row={row} events={events} company={company} onPick={onEventPick} />)}
    {group.events.length === 0 && <p className="text-xs text-[#6B6B66]">No event cited for this inference.</p>}
    <ProfileFields fields={group.profileFields} company={company} />
  </section>;
}

/** Leads with interpretation and nests the stated evidence beneath each numbered inference. */
export function InferenceList({ answer, cited, company, onEventPick }: InferenceListProps) {
  const headingId = useId();
  const groups = groupInferences(answer, cited);
  const events = cited.map((entry) => entry.event);
  if (!groups.length) return null;
  return <section aria-labelledby={headingId} className="space-y-3">
    <h2 id={headingId} className="text-[11px] font-semibold tracking-[0.06em] text-[#6E4FD1] uppercase">Analytical inference</h2>
    <ol className="space-y-4">{groups.map((group, index) => <li key={index} className="flex items-start gap-3.5">
      <span aria-hidden="true" className="w-[22px] shrink-0 pt-1 font-mono text-xs text-[#6E4FD1]">{index + 1}</span>
      <div className="min-w-0 flex-1 space-y-2"><p className="font-serif text-[17px] leading-[25px]">{group.claim}</p><EventsBlock group={group} events={events} company={company} onEventPick={onEventPick} /></div>
    </li>)}</ol>
  </section>;
}
