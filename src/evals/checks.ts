import type { EventId } from "@/domain/event";
import type { AnswerOutput, EvidenceLevel } from "@/domain/stages";
import type { Expectations } from "@/evals/case";

/** Name of a check; each one is named after the expectation that switches it on. */
export type CheckName = keyof Expectations;

/** Outcome of one deterministic check, with a short sentence saying what was missing or found. */
export interface CheckResult {
  name: CheckName;
  pass: boolean;
  detail: string;
}

/** Event ids cited by the facts and then the analysis, each listed once in first-seen order. */
export function citedEventIds(answer: AnswerOutput): EventId[] {
  const ids = [...answer.facts, ...answer.analysis].flatMap((claim) =>
    claim.sources.flatMap((source) => (source.type === "event" ? [source.id] : [])),
  );
  return [...new Set(ids)];
}

/** Joins ids for a detail sentence. */
function listIds(ids: readonly string[]): string {
  return ids.join(", ");
}

/** Joins phrases for a detail sentence, quoting each one. */
function listPhrases(phrases: readonly string[]): string {
  return phrases.map((phrase) => `"${phrase}"`).join(", ");
}

/**
 * The text the mention checks search, lower-cased: the summary, every fact and
 * every analysis claim. Parts are kept on separate lines so that a phrase
 * cannot match across two claims.
 */
function answerText(answer: AnswerOutput): string {
  const claims = [...answer.facts, ...answer.analysis].map((claim) => claim.claim);
  return [answer.summary, ...claims].join("\n").toLowerCase();
}

/** The phrases that occur in the answer text, ignoring case. */
function phrasesFound(phrases: readonly string[], answer: AnswerOutput): string[] {
  const text = answerText(answer);
  return phrases.filter((phrase) => text.includes(phrase.toLowerCase()));
}

/** Passes when every id in `required` is cited by a fact or an analysis claim. */
export function checkMustCite(required: readonly EventId[], answer: AnswerOutput): CheckResult {
  const cited = new Set(citedEventIds(answer));
  const missing = required.filter((id) => !cited.has(id));
  if (missing.length === 0) return { name: "must_cite", pass: true, detail: "Cited every required event." };
  return { name: "must_cite", pass: false, detail: `Missing required citations: ${listIds(missing)}.` };
}

/** Passes when at least one id in `accepted` is cited, or when `accepted` is empty. */
export function checkMustCiteAny(accepted: readonly EventId[], answer: AnswerOutput): CheckResult {
  if (accepted.length === 0) return { name: "must_cite_any", pass: true, detail: "No accepted events were given." };
  const cited = new Set(citedEventIds(answer));
  const hits = accepted.filter((id) => cited.has(id));
  if (hits.length > 0) return { name: "must_cite_any", pass: true, detail: `Cited ${listIds(hits)} from the accepted set.` };
  return { name: "must_cite_any", pass: false, detail: `Cited none of: ${listIds(accepted)}.` };
}

/** Passes when no id in `forbidden` is cited anywhere in the answer. */
export function checkMustNotCite(forbidden: readonly EventId[], answer: AnswerOutput): CheckResult {
  const cited = new Set(citedEventIds(answer));
  const found = forbidden.filter((id) => cited.has(id));
  if (found.length === 0) return { name: "must_not_cite", pass: true, detail: "Cited none of the forbidden events." };
  return { name: "must_not_cite", pass: false, detail: `Cited forbidden events: ${listIds(found)}.` };
}

/** Passes when the reported evidence level is one of `allowed`, or when `allowed` is empty. */
export function checkEvidenceLevel(allowed: readonly EvidenceLevel[], answer: AnswerOutput): CheckResult {
  const level = answer.evidence_level;
  if (allowed.length === 0 || allowed.includes(level)) {
    return { name: "evidence_level", pass: true, detail: `Evidence level "${level}" is allowed.` };
  }
  return { name: "evidence_level", pass: false, detail: `Evidence level "${level}" is not one of: ${listIds(allowed)}.` };
}

/** Passes when every phrase occurs in the summary, facts or analysis, ignoring case. */
export function checkMustMention(phrases: readonly string[], answer: AnswerOutput): CheckResult {
  const found = new Set(phrasesFound(phrases, answer));
  const missing = phrases.filter((phrase) => !found.has(phrase));
  if (missing.length === 0) return { name: "must_mention", pass: true, detail: "Mentioned every required phrase." };
  return { name: "must_mention", pass: false, detail: `Missing phrases: ${listPhrases(missing)}.` };
}

/** Passes when none of the phrases occurs in the summary, facts or analysis, ignoring case. */
export function checkMustNotMention(phrases: readonly string[], answer: AnswerOutput): CheckResult {
  const found = phrasesFound(phrases, answer);
  if (found.length === 0) return { name: "must_not_mention", pass: true, detail: "Mentioned none of the forbidden phrases." };
  return { name: "must_not_mention", pass: false, detail: `Found forbidden phrases: ${listPhrases(found)}.` };
}

/** Passes when the answer states at least one fact. */
export function checkFactsRequired(answer: AnswerOutput): CheckResult {
  const count = answer.facts.length;
  if (count > 0) return { name: "facts_required", pass: true, detail: `Stated ${count} fact(s).` };
  return { name: "facts_required", pass: false, detail: "Stated no facts, but facts are required." };
}

/** Checks factual citation coverage without requiring a refusal to invent factual claims. */
export function checkFactsHaveEventSources(answer: AnswerOutput): CheckResult {
  const missing = answer.facts.filter((fact) => !fact.sources.some((source) => source.type === "event"));
  const detail = missing.length > 0
    ? `Facts without event citations: ${missing.map((fact) => fact.claim).join("; ")}`
    : "Every stated fact carries an event citation.";
  return { name: "facts_have_event_sources", pass: missing.length === 0, detail };
}

type Runner = (expect: Expectations, answer: AnswerOutput) => CheckResult;

/** Every check in report order, next to the expectation that switches it on. */
const CHECKS: ReadonlyArray<readonly [CheckName, Runner]> = [
  ["must_cite", (expect, answer) => checkMustCite(expect.must_cite, answer)],
  ["must_cite_any", (expect, answer) => checkMustCiteAny(expect.must_cite_any, answer)],
  ["must_not_cite", (expect, answer) => checkMustNotCite(expect.must_not_cite, answer)],
  ["evidence_level", (expect, answer) => checkEvidenceLevel(expect.evidence_level, answer)],
  ["must_mention", (expect, answer) => checkMustMention(expect.must_mention, answer)],
  ["must_not_mention", (expect, answer) => checkMustNotMention(expect.must_not_mention, answer)],
  ["facts_required", (_expect, answer) => checkFactsRequired(answer)],
  ["facts_have_event_sources", (_expect, answer) => checkFactsHaveEventSources(answer)],
];

/** Tells whether an expectation is set: a non-empty list, or `true`. */
function isSet(value: Expectations[CheckName]): boolean {
  return Array.isArray(value) ? value.length > 0 : value;
}

/**
 * Runs the checks whose expectation is set and returns their results, always
 * in the order must_cite, must_cite_any, must_not_cite, evidence_level,
 * must_mention, must_not_mention, facts_required, facts_have_event_sources.
 */
export function runChecks(expect: Expectations, answer: AnswerOutput): CheckResult[] {
  return CHECKS.filter(([name]) => isSet(expect[name])).map(([, run]) => run(expect, answer));
}
