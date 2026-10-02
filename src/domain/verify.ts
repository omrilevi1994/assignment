import { z } from "zod";
import { type EventId, EventIdSchema } from "@/domain/event";
import { type AnswerOutput, type Claim, type EvidenceLevel, EvidenceLevelSchema, type Source } from "@/domain/stages";

/** What the verify step changed in an answer, so the UI and logs can show it. */
export const VerifyReportSchema = z.object({
  removed_citations: z.array(
    z.object({ id: EventIdSchema, reason: z.enum(["unknown", "not_selected"]), claim: z.string() }),
  ),
  demoted_claims: z.array(z.object({ claim: z.string(), reason: z.enum(["no_event_source", "profile_only"]) })),
  evidence_level_changed: z.object({ from: EvidenceLevelSchema, to: EvidenceLevelSchema }).nullable(),
});

export type VerifyReport = z.infer<typeof VerifyReportSchema>;

/** Returns a report that records no changes. */
export function emptyReport(): VerifyReport {
  return { removed_citations: [], demoted_claims: [], evidence_level_changed: null };
}

/** Tells whether the verify step left the answer exactly as the model wrote it. */
export function isCleanReport(report: VerifyReport): boolean {
  return (
    report.removed_citations.length === 0 &&
    report.demoted_claims.length === 0 &&
    report.evidence_level_changed === null
  );
}

type RemovedCitation = VerifyReport["removed_citations"][number];
type DemotedClaim = VerifyReport["demoted_claims"][number];

/** The ids a citation is checked against. */
interface CitationIds {
  selected: ReadonlySet<EventId>;
  known: ReadonlySet<EventId>;
}

/**
 * Decides whether one source of `claim` survives. Returns the record of its
 * removal, or null when the source is kept.
 */
function classifyCitation(source: Source, claim: string, ids: CitationIds): RemovedCitation | null {
  if (source.type !== "event") return null;
  if (!ids.known.has(source.id)) return { id: source.id, reason: "unknown", claim };
  if (!ids.selected.has(source.id)) return { id: source.id, reason: "not_selected", claim };
  return null;
}

/** Returns a copy of `claim` without the citations that fail the check, plus what was removed. */
function stripSources(claim: Claim, ids: CitationIds): { claim: Claim; removed: RemovedCitation[] } {
  const sources: Source[] = [];
  const removed: RemovedCitation[] = [];
  for (const source of claim.sources) {
    const removal = classifyCitation(source, claim.claim, ids);
    if (removal) removed.push(removal);
    else sources.push(source);
  }
  return { claim: { ...claim, sources }, removed };
}

/** Strips every claim in order and collects the removals in the same order. */
function stripClaims(claims: readonly Claim[], ids: CitationIds): { claims: Claim[]; removed: RemovedCitation[] } {
  const stripped = claims.map((claim) => stripSources(claim, ids));
  return { claims: stripped.map((s) => s.claim), removed: stripped.flatMap((s) => s.removed) };
}

/** Returns why a stripped fact can no longer stand as a fact, or null when it still can. */
function demotionReason(fact: Claim): DemotedClaim["reason"] | null {
  if (fact.sources.some((source) => source.type === "event")) return null;
  // The profile is context about the company, not evidence that something happened.
  return fact.sources.length === 0 ? "no_event_source" : "profile_only";
}

/** Separates facts that still rest on an event from those that must move to analysis. */
function splitFacts(facts: readonly Claim[]): { kept: Claim[]; demoted: Claim[]; records: DemotedClaim[] } {
  const kept: Claim[] = [];
  const demoted: Claim[] = [];
  const records: DemotedClaim[] = [];
  for (const fact of facts) {
    const reason = demotionReason(fact);
    if (reason === null) {
      kept.push(fact);
      continue;
    }
    demoted.push(fact);
    records.push({ claim: fact.claim, reason });
  }
  return { kept, demoted, records };
}

/**
 * Drops the evidence level to `none` when no fact survived, and reports the
 * change; any other level is left to the model.
 */
function settleEvidenceLevel(
  level: EvidenceLevel,
  factCount: number,
): { level: EvidenceLevel; changed: VerifyReport["evidence_level_changed"] } {
  if (factCount > 0 || level === "none") return { level, changed: null };
  return { level: "none", changed: { from: level, to: "none" } };
}

/**
 * Checks a model answer against the events that were actually selected and
 * returns a corrected copy together with a report of every change. The input
 * is never mutated.
 */
export function verify(
  answer: AnswerOutput,
  selectedIds: readonly EventId[],
  knownIds: readonly EventId[],
): { answer: AnswerOutput; report: VerifyReport } {
  const ids: CitationIds = { selected: new Set(selectedIds), known: new Set(knownIds) };
  const facts = stripClaims(answer.facts, ids);
  const analysis = stripClaims(answer.analysis, ids);
  const split = splitFacts(facts.claims);
  const evidence = settleEvidenceLevel(answer.evidence_level, split.kept.length);
  return {
    answer: {
      ...answer,
      facts: split.kept,
      analysis: [...analysis.claims, ...split.demoted],
      evidence_level: evidence.level,
    },
    report: {
      removed_citations: [...facts.removed, ...analysis.removed],
      demoted_claims: split.records,
      evidence_level_changed: evidence.changed,
    },
  };
}
