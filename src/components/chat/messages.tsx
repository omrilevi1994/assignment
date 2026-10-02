"use client";

import type { CompanyProfile } from "@/domain/company";
import { AnswerFooter } from "./answer-footer";
import { EvidenceBadge } from "./citations";
import { FactList } from "./fact-list";
import { FollowUps } from "./follow-ups";
import { InferenceList } from "./inference-list";
import type { AnswerView } from "./types";

interface AnswerMessageProps {
  view: AnswerView;
  company: CompanyProfile;
  onFollowUp?: (question: string) => void;
  onEventPick?: (id: string) => void;
  onReport?: (turnId: string) => void;
  onSelect?: (turnId: string) => void;
  disabled?: boolean;
}

/** Displays a complete answer with analysis above the factual evidence supporting it. */
export function AnswerMessage({ view, company, onFollowUp, onEventPick, onReport, onSelect, disabled }: AnswerMessageProps) {
  return <article aria-label="Assistant answer" className="space-y-3.5 text-[#1C1C1A]" onClick={() => onSelect?.(view.turnId)} onFocus={() => onSelect?.(view.turnId)}>
    <EvidenceBadge answer={view.answer} />
    <p className="text-[15px] leading-6">{view.answer.summary}</p>
    <InferenceList answer={view.answer} cited={view.evidence.cited} company={company} onEventPick={onEventPick} />
    <FactList answer={view.answer} company={company} events={view.evidence.cited.map((entry) => entry.event)} onEventPick={onEventPick} />
    {view.answer.missing_info && <p className="text-[13px] leading-5 text-[#6B6B66]">What would be needed: {view.answer.missing_info}</p>}
    <FollowUps questions={view.answer.follow_ups} onPick={onFollowUp} disabled={disabled} />
    <AnswerFooter view={view} onReport={onReport} />
  </article>;
}

/** Keeps user text visually separate from an evidence-bearing answer. */
export function UserMessage({ text }: { text: string }) {
  return <article aria-label="Your question" className="flex justify-end"><p className="max-w-[560px] rounded-[14px_14px_4px_14px] bg-[#F1F1EF] px-3.5 py-2.5 text-sm leading-[22px] whitespace-pre-wrap text-[#1C1C1A]">{text}</p></article>;
}
