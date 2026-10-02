"use client";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatMeta } from "./derive";
import { TraceTable } from "./trace-table";
import type { AnswerView } from "./types";

/** Keeps provenance quiet until requested and identifies the answer being reported. */
export function AnswerFooter({ view, onReport }: { view: AnswerView; onReport?: (turnId: string) => void }) {
  return <Collapsible className="space-y-4">
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#6B6B66]">
      <span>{formatMeta(view.trace)}</span>
      <CollapsibleTrigger className="cursor-pointer rounded-sm text-left hover:text-[#1C1C1A] focus-visible:outline-2 focus-visible:outline-offset-4">How this answer was produced <span aria-hidden="true">›</span></CollapsibleTrigger>
      {onReport && <Button type="button" variant="link" onClick={() => onReport(view.turnId)} className="ml-auto h-auto p-0 text-xs font-normal text-[#6B6B66]">Report a problem</Button>}
    </footer>
    <CollapsibleContent><TraceTable view={view} /></CollapsibleContent>
  </Collapsible>;
}
