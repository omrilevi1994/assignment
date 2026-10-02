import type { ReactNode } from "react";

interface ChatLayoutProps { sidebar: ReactNode; children: ReactNode; composer: ReactNode; evidence: ReactNode }

/** Arranges the approved three laptop columns with a scrolling transcript above the composer. */
export function ChatLayout({ sidebar, children, composer, evidence }: ChatLayoutProps) {
  return <div className="grid h-dvh min-w-[1200px] grid-cols-[260px_minmax(0,1fr)_360px] overflow-hidden bg-[#FBFBFA] text-[#1C1C1A]">
    {sidebar}<main className="flex min-h-0 min-w-0 flex-col bg-white">
      <div role="log" aria-label="Conversation" className="min-h-0 flex-1 overflow-y-auto px-12 pt-8 pb-2"><div className="flex min-h-full flex-col justify-end gap-[26px]">{children}</div></div>
      <div className="shrink-0 px-12 pt-3 pb-6">{composer}</div>
    </main>{evidence}
  </div>;
}
