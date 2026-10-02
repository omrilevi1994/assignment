"use client";

import { useId } from "react";
import type { CompanyProfile } from "@/domain/company";
import type { Event } from "@/domain/event";
import type { AnswerOutput } from "@/domain/stages";
import { FactContent } from "./fact-content";
import { unusedFacts } from "./derive";

interface FactListProps { answer: AnswerOutput; company: CompanyProfile; events: readonly Event[]; onEventPick?: (id: string) => void }

/** Preserves factual claims that have not already appeared below an inference. */
export function FactList({ answer, company, events, onEventPick }: FactListProps) {
  const headingId = useId();
  const facts = unusedFacts(answer);
  if (!facts.length) return null;
  return <section aria-labelledby={headingId} className="space-y-2">
    <h2 id={headingId} className="text-xs font-medium text-[#6B6B66]">Also stated in the data</h2>
    <ul className="list-disc space-y-2 pl-4 text-[13px] leading-5">{facts.map((fact, index) => <li key={index}>
      <FactContent fact={fact} events={events} company={company} onEventPick={onEventPick} />
    </li>)}</ul>
  </section>;
}
