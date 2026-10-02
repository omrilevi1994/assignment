"use client";

import type { CompanyProfile } from "@/domain/company";
import { Button } from "@/components/ui/button";
import type { ConversationSummary } from "./types";

interface SidebarProps {
  company: CompanyProfile;
  conversations: readonly ConversationSummary[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

/** Keeps company context available without presenting it as event evidence. */
function CompanyContext({ company }: { company: CompanyProfile }) {
  return <section aria-label="Company context" className="mt-auto space-y-1.5 rounded-lg border border-[#E6E6E2] bg-white p-3 text-xs leading-[18px] text-[#6B6B66]">
    <h2 className="font-semibold text-[#1C1C1A]">Company context</h2><p>{company.manufacturing_footprint}</p><p>{company.revenue_mix}</p><p>{company.critical_dependencies}</p>
    <p className="mt-2 border-t border-[#E6E6E2] pt-2 text-[11px] leading-4">Context for analysis, not evidence.</p>
  </section>;
}

/** Provides conversation navigation and compact company context in the fixed left column. */
export function Sidebar({ company, conversations, selectedId, onSelect, onNew }: SidebarProps) {
  return <aside aria-label="Conversations" className="flex h-full flex-col gap-5 border-r border-[#E6E6E2] bg-[#FBFBFA] px-4 py-[22px] text-[#1C1C1A]">
    <header className="px-2.5"><h1 className="text-[15px] font-semibold">Event Intelligence</h1><p className="mt-0.5 text-xs text-[#6B6B66]">{company.company_name}</p></header>
    <Button type="button" variant="outline" onClick={onNew} className="justify-start border-[#E6E6E2] bg-white text-[13px] font-normal">+ New conversation</Button>
    <nav aria-label="Conversation history" className="min-h-0 flex-1 overflow-y-auto"><ul className="space-y-0.5">{conversations.map((conversation) => <li key={conversation.id}>
      <Button type="button" variant="ghost" aria-current={conversation.id === selectedId ? "page" : undefined} onClick={() => onSelect(conversation.id)} className="h-auto w-full justify-start rounded-md px-2.5 py-[7px] text-left text-[13px] leading-[18px] font-normal whitespace-normal aria-[current=page]:bg-[#F1F1EF]">{conversation.title}</Button>
    </li>)}</ul></nav>
    <CompanyContext company={company} />
  </aside>;
}
