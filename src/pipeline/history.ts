import type { EventId } from "@/domain/event";

/** One earlier turn as the pipeline sees it; an assistant turn is its summary plus the events it cited. */
export type HistoryTurn = { role: "user" | "assistant"; text: string; citedIds?: EventId[] };

/** How many of the most recent turns the stages see. */
export const HISTORY_LIMIT = 6;

/** Shown instead of the conversation when the question opens it. */
export const NO_HISTORY = "(no earlier turns: this question opens the conversation)";

/** Collapses whitespace so that a turn always fits on one line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Renders one turn as a `User:` or `Assistant:` line; an assistant line ends with the ids it cited. */
function renderTurn(turn: HistoryTurn): string {
  if (turn.role === "user") return `User: ${oneLine(turn.text)}`;
  const cited = turn.citedIds?.length ? ` (cited: ${turn.citedIds.join(", ")})` : "";
  return `Assistant: ${oneLine(turn.text)}${cited}`;
}

/** Renders the last six turns, oldest first, one line each; says so when there are none. */
export function renderHistory(history: readonly HistoryTurn[]): string {
  if (history.length === 0) return NO_HISTORY;
  return history.slice(-HISTORY_LIMIT).map(renderTurn).join("\n");
}
