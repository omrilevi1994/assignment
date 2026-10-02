"use client";

import type { Event } from "@/domain/event";
import type { AnswerOutput } from "@/domain/stages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { citedCount } from "./derive";

interface EventChipProps { id: string; events: readonly Event[]; onPick?: (id: string) => void }
const citationClass = "inline-flex h-auto shrink-0 rounded border border-[#D3DEF8] bg-[#EEF3FF] px-1.5 py-0 font-mono text-[11px] leading-4 font-normal text-[#2F5FD8]";

/** Renders a citation only when it resolves to a supplied event row. */
export function EventChip({ id, events, onPick }: EventChipProps) {
  const event = events.find((candidate) => candidate.event_id === id);
  if (!event || !/^evt_\d{3}$/.test(id)) return null;
  if (!onPick) return <span className={citationClass} title={event.title}>{id}</span>;
  return <Button type="button" variant="outline" className={citationClass} title={event.title} onClick={() => onPick(id)}>{id}</Button>;
}

/** Distinguishes company context from evidence that an event occurred. */
export function ProfileChip() {
  return <span className="inline-flex shrink-0 rounded border border-[#E6E6E2] bg-[#F1F1EF] px-1.5 font-mono text-[11px] leading-4 text-[#6B6B66]">company profile</span>;
}

/** Shows the answer's evidence state and its distinct citation count. */
export function EvidenceBadge({ answer }: { answer: AnswerOutput }) {
  const none = answer.evidence_level === "none";
  const count = citedCount(answer);
  const label = none ? "Insufficient evidence" : `Grounded · ${count} ${count === 1 ? "event" : "events"}`;
  const color = none ? "bg-[#FFF3D6] text-[#8A5A00]" : "bg-[#E6F4EC] text-[#1F7A4D]";
  return <Badge data-evidence={answer.evidence_level} className={`${color} gap-1.5 px-2.5 py-1`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{label}</Badge>;
}
