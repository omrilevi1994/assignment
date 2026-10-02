"use client";

import { Button } from "@/components/ui/button";
import type { ErrorView, LoadingStage } from "./types";

/** Preserves the user's question and makes a failed attempt retryable. */
export function ErrorCard({ error, onRetry, onReport }: { error: ErrorView; onRetry: () => void; onReport?: () => void }) {
  return <div role="alert" className="space-y-2.5 rounded-xl border border-[#F5C8C5] bg-[#FCECEA] p-4">
    <p className="text-sm text-[#B3261E]">{error.message}</p>
    <p className="text-[13px] leading-5 text-[#1C1C1A]">Nothing from this attempt was saved as evidence. Your question is kept.</p>
    <div className="flex items-center gap-3"><Button type="button" onClick={onRetry} className="bg-[#1C1C1A] text-white">Retry</Button>
      {onReport && <Button type="button" variant="link" onClick={onReport} className="px-0 text-[13px] font-normal text-[#6B6B66]">Report a problem</Button>}</div>
  </div>;
}

/** Labels completed selection without inventing a count before one is available. */
function selectionLabel(active: LoadingStage, selectedCount?: number): string {
  if (active === "select") return "Selecting relevant events…";
  return selectedCount === undefined ? "Selected relevant events" : `Selected ${selectedCount} relevant events`;
}

/** Shows one stage with accessible active state and a restrained status marker. */
function LoadingRow({ label, state }: { label: string; state: "done" | "active" | "pending" }) {
  const marker = state === "done" ? "✓" : "○";
  const color = state === "done" ? "text-[#1F7A4D]" : "text-[#6B6B66]";
  return <li data-state={state} aria-current={state === "active" ? "step" : undefined} className="flex items-center gap-2 text-[13px] leading-5">
    <span aria-hidden="true" className={state === "active" ? "size-2.5 rounded-full bg-[#2F5FD8]" : `w-2.5 ${color}`}>{state === "active" ? "" : marker}</span>
    <span className={state === "active" ? "text-[#1C1C1A]" : "text-[#6B6B66]"}>{label}</span>
  </li>;
}

/** Presents actual stage state while the whole answer is being prepared. */
export function LoadingCard({ stage, selectedCount }: { stage: LoadingStage; selectedCount?: number }) {
  const stages: LoadingStage[] = ["select", "answer", "verify"];
  const active = stages.indexOf(stage);
  const labels = [selectionLabel(stage, selectedCount), "Writing the answer…", "Verifying citations"];
  return <div role="status" aria-live="polite" className="w-fit min-w-72 space-y-2 rounded-xl border border-[#E6E6E2] bg-white p-4">
    <h2 className="text-[11px] font-semibold tracking-[0.06em] text-[#6B6B66] uppercase">While a turn runs</h2>
    <ol className="space-y-1">{stages.map((item, index) => <LoadingRow key={item} label={labels[index]} state={index < active ? "done" : index === active ? "active" : "pending"} />)}</ol>
  </div>;
}
