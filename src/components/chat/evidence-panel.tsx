"use client";

import { EventChip } from "./citations";
import type { AnswerView, EvidenceEntry } from "./types";

interface EvidencePanelProps { evidence?: AnswerView["evidence"]; selectedEventId?: string; onEventPick?: (id: string) => void }

/** Lists one cited source with the actual selection reason and source name. */
function CitedRow({ entry, selected, onPick }: { entry: EvidenceEntry; selected: boolean; onPick?: (id: string) => void }) {
  const event = entry.event;
  return <li data-event-id={event.event_id} data-selected={selected} className="space-y-1 border-t border-[#E6E6E2] py-3 data-[selected=true]:bg-[#EEF3FF]">
    <div className="flex items-center gap-2"><EventChip id={event.event_id} events={[event]} onPick={onPick} /><time dateTime={event.event_date} className="font-mono text-[11px] text-[#6B6B66]">{event.event_date}</time></div>
    <h3 className="text-[13px] leading-[19px]">{event.title}</h3>
    <p className="text-xs leading-[17px] text-[#6B6B66]">Selected: {entry.reason}</p>
    <p className="text-[11px] text-[#6B6B66]">{event.source_name}</p>
  </li>;
}

/** Explains why the evidence area is empty without confusing an absent answer with a gap. */
function EvidenceEmpty({ evidence }: { evidence?: AnswerView["evidence"] }) {
  if (evidence && evidence.cited.length > 0) return null;
  const message = evidence ? "No event supports an answer. The closest matches were read and set aside." : "The evidence panel fills in once an answer is produced.";
  return <p className="border-t border-[#E6E6E2] pt-3 text-[13px] leading-5 text-[#6B6B66]">{message}</p>;
}

/** Lists selected events that were read but never cited by the answer. */
function ConsideredEvents({ entries }: { entries: readonly EvidenceEntry[] }) {
  if (!entries.length) return null;
  return <section className="mt-5 space-y-2"><h3 className="text-[11px] font-semibold tracking-[0.06em] text-[#6B6B66] uppercase">Considered, not cited</h3>
    <ul className="space-y-2">{entries.map(({ event }) => <li key={event.event_id} className="flex items-baseline gap-2 text-xs leading-[17px] text-[#6B6B66]"><span className="shrink-0 font-mono text-[11px]">{event.event_id}</span><span>{event.title}</span></li>)}</ul>
  </section>;
}

/** Separates events used in the answer from the events read and set aside. */
export function EvidencePanel({ evidence, selectedEventId, onEventPick }: EvidencePanelProps) {
  const subtitle = !evidence ? "Nothing cited yet" : evidence.cited.length ? "Cited by the selected answer" : "Nothing cited by the selected answer";
  const cited = evidence?.cited ?? [];
  return <aside aria-label="Evidence" className="h-full overflow-y-auto border-l border-[#E6E6E2] bg-[#FBFBFA] px-6 py-6 text-[#1C1C1A]">
    <header className="mb-3"><h2 className="text-sm font-semibold">Evidence</h2><p className="mt-0.5 text-xs text-[#6B6B66]">{subtitle}</p></header>
    <EvidenceEmpty evidence={evidence} />
    <ul aria-label="Cited events">{cited.map((entry) => <CitedRow key={entry.event.event_id} entry={entry} selected={selectedEventId === entry.event.event_id} onPick={onEventPick} />)}</ul>
    <ConsideredEvents entries={evidence?.considered ?? []} />
  </aside>;
}
