import type { CompanyField } from "@/domain/company";
import type { AnswerOutput, Claim } from "@/domain/stages";
import type { StageRecord } from "@/domain/trace";
import type { AnswerView, EvidenceEntry, InferenceGroup } from "./types";

/** Returns distinct event identifiers in first-citation order. */
export function eventIds(claims: readonly Claim[]): string[] {
  return [...new Set(claims.flatMap((claim) => claim.sources.flatMap((source) => source.type === "event" ? [source.id] : [])))];
}

/** Returns each company-context field cited by the supplied claims once. */
export function profileFields(claims: readonly Claim[]): CompanyField[] {
  return [...new Set(claims.flatMap((claim) => claim.sources.flatMap((source) => source.type === "company_profile" ? [source.field] : [])))];
}

/** Places known events and their factual claims beneath each analytical claim. */
export function groupInferences(answer: AnswerOutput, cited: readonly EvidenceEntry[]): InferenceGroup[] {
  return answer.analysis.map((claim) => ({
    claim: claim.claim,
    events: eventIds([claim]).flatMap((id) => {
      const entry = cited.find((item) => item.event.event_id === id);
      return entry ? [{ event: entry.event, facts: answer.facts.filter((fact) => eventIds([fact]).includes(id)) }] : [];
    }),
    profileFields: profileFields([claim]),
  }));
}

/** Keeps facts that are not already displayed under any inference. */
export function unusedFacts(answer: AnswerOutput): Claim[] {
  const used = new Set(eventIds(answer.analysis));
  return answer.facts.filter((fact) => !eventIds([fact]).some((id) => used.has(id)));
}

/** Counts event citations across facts and inference without counting profile context. */
export function citedCount(answer: AnswerOutput): number {
  return eventIds([...answer.facts, ...answer.analysis]).length;
}

/** Formats dollar usage consistently across the footer and trace. */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/** Formats recorded elapsed time in seconds. */
export function formatTime(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

/** Summarizes model calls and the measured trace totals. */
export function formatMeta(trace: AnswerView["trace"]): string {
  const calls = trace.stages.filter((stage) => stage.model !== "code").length;
  return `${calls} model ${calls === 1 ? "call" : "calls"} · ${formatTime(trace.totals.latencyMs)} · ${formatCost(trace.totals.costUsd)}`;
}

/** Uses a fixed locale so token counts do not depend on the user's machine. */
export function formatTokens(stage: StageRecord): string {
  return `${stage.inputTokens.toLocaleString("en-US")} → ${stage.outputTokens.toLocaleString("en-US")}`;
}

/** Formats a workbook date without applying the user's timezone. */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
