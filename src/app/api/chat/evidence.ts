import { loadEvents } from "@/data/load";
import type { Event, EventId } from "@/domain/event";
import type { AnswerOutput } from "@/domain/stages";
import type { TurnResult } from "@/pipeline";

export type EvidenceItem = { event: Event; reason: string };
export type Evidence = { cited: EvidenceItem[]; considered: EvidenceItem[] };

/** Returns distinct event sources in their first-citation order. */
export function answerEventIds(answer: AnswerOutput): EventId[] {
  const ids = [...answer.facts, ...answer.analysis].flatMap((claim) =>
    claim.sources.flatMap((source) => source.type === "event" ? [source.id] : []),
  );
  return [...new Set(ids)];
}

/** Resolves known event rows and the first selection reason for each id. */
function resolveEvidence(ids: readonly EventId[], result: TurnResult): EvidenceItem[] {
  const events = new Map(loadEvents().map((event) => [event.event_id, event]));
  return ids.flatMap((id) => {
    const event = events.get(id);
    const reason = result.select?.selected.find((pick) => pick.event_id === id)?.reason ?? "";
    return event ? [{ event, reason }] : [];
  });
}

/** Separates cited evidence from selected events that the verified answer did not use. */
export function buildEvidence(result: TurnResult, answer: AnswerOutput): Evidence {
  const cited = answerEventIds(answer);
  const considered = [...new Set(result.selectedIds)].filter((id) => !cited.includes(id));
  return { cited: resolveEvidence(cited, result), considered: resolveEvidence(considered, result) };
}

/** Stores ids and reasons while the response carries full event rows. */
export function storedEvidence(evidence: Evidence) {
  /** Reduces full event rows to their persisted references. */
  const compact = (items: EvidenceItem[]) => items.map(({ event, reason }) => ({ id: event.event_id, reason }));
  return { cited: compact(evidence.cited), considered: compact(evidence.considered) };
}
