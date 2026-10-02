"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FollowUps } from "./follow-ups";

interface ComposerProps { onSend: (message: string) => void; disabled?: boolean; suggestions?: readonly string[] }

/** Sends complete, trimmed questions and keeps newline and input-method keyboard behavior intact. */
export function Composer({ onSend, disabled = false, suggestions = [] }: ComposerProps) {
  const [text, setText] = useState("");
  /** Sends only an enabled, nonempty question within the API's character limit. */
  function send(message: string) {
    const trimmed = message.trim();
    if (disabled || !trimmed || trimmed.length > 2000) return;
    onSend(trimmed);
    setText("");
  }
  /** Uses the same validation for pointer and keyboard form submissions. */
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); send(text); }
  /** Leaves Shift+Enter and composition events to the textarea. */
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault(); send(text);
  }
  return <div className="space-y-2.5"><FollowUps questions={suggestions} onPick={send} disabled={disabled} />
    <form onSubmit={submit} className="flex items-end gap-2.5 rounded-xl border border-[#E6E6E2] bg-white p-1.5 pl-3.5 focus-within:ring-2 focus-within:ring-[#D3DEF8]">
      <Textarea aria-label="Your question" placeholder="Ask about the events and what they mean for Asteron" rows={1} maxLength={2000} disabled={disabled} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={keyDown} className="max-h-32 min-h-8 resize-none border-0 px-0 py-1.5 text-sm text-[#1C1C1A] shadow-none focus-visible:ring-0" />
      <Button type="submit" disabled={disabled || !text.trim()} className="bg-[#1C1C1A] px-3.5 text-white">Send</Button>
    </form></div>;
}
