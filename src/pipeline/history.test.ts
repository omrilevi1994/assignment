import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, NO_HISTORY, type HistoryTurn, renderHistory } from "./history";

describe("renderHistory", () => {
  it("renders a user turn as a `User:` line", () => {
    expect(renderHistory([{ role: "user", text: "What matters most?" }])).toBe("User: What matters most?");
  });

  it("renders an assistant turn as its summary followed by the ids it cited", () => {
    const turn: HistoryTurn = { role: "assistant", text: "Cloud and chips.", citedIds: ["evt_001", "evt_006"] };
    expect(renderHistory([turn])).toBe("Assistant: Cloud and chips. (cited: evt_001, evt_006)");
  });

  it("leaves the cited list out when an assistant turn cited nothing", () => {
    expect(renderHistory([{ role: "assistant", text: "No evidence.", citedIds: [] }])).toBe("Assistant: No evidence.");
    expect(renderHistory([{ role: "assistant", text: "No evidence." }])).toBe("Assistant: No evidence.");
  });

  it("keeps each turn on one line", () => {
    expect(renderHistory([{ role: "user", text: "First line.\n\n  Second   line." }])).toBe("User: First line. Second line.");
  });

  it("keeps only the last six turns, oldest first", () => {
    const turns: HistoryTurn[] = Array.from({ length: 8 }, (_, i) => ({ role: "user", text: `turn ${i + 1}` }));
    const lines = renderHistory(turns).split("\n");
    expect(HISTORY_LIMIT).toBe(6);
    expect(lines).toEqual(["turn 3", "turn 4", "turn 5", "turn 6", "turn 7", "turn 8"].map((t) => `User: ${t}`));
  });

  it("says so when there are no earlier turns", () => {
    expect(renderHistory([])).toBe(NO_HISTORY);
    expect(NO_HISTORY).toMatch(/no earlier turns/i);
  });
});
