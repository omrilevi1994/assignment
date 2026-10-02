"use client";

import { Button } from "@/components/ui/button";

interface FollowUpsProps { questions: readonly string[]; onPick?: (question: string) => void; disabled?: boolean }

/** Offers short follow-up questions without introducing a new interaction pattern. */
export function FollowUps({ questions, onPick, disabled = false }: FollowUpsProps) {
  if (!questions.length) return null;
  return <div aria-label="Suggested questions" className="flex flex-wrap gap-2">
    {questions.map((question, index) => <Button key={index} type="button" variant="outline" disabled={disabled || !onPick} onClick={() => onPick?.(question)} className="h-auto min-h-7 rounded-full border-[#E6E6E2] bg-white px-3 py-1 text-left text-[13px] leading-[18px] font-normal whitespace-normal text-[#1C1C1A] motion-reduce:transition-none">{question}</Button>)}
  </div>;
}
