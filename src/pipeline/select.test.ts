import { describe, expect, it } from "vitest";
import { loadEvents } from "@/data/load";
import type { Event } from "@/domain/event";
import { SELECT_CONTEXT_CHAR_BUDGET, renderCompact } from "@/domain/render";
import { SelectOutputSchema, type SelectOutput } from "@/domain/stages";
import type { StageRequest, StageResult, runStage } from "@/llm/gateway";
import { NO_HISTORY } from "./history";
import { SELECT_MODEL, SELECT_TIMEOUT_MS } from "./models";
import { loadPrompt, promptLabel } from "./prompts";
import { buildSelectInput, runSelect } from "./select";

const events = loadEvents();

const picked: SelectOutput = {
  standalone_question: "Which events matter most to Asteron?",
  answerable: true,
  selected: [{ event_id: "evt_001", reason: "cloud dependency" }],
  gap: "",
};

/** A runStage stand-in that records the request and answers with `object`. */
function fakeRunStage(object: unknown) {
  const requests: StageRequest<unknown>[] = [];
  const fake = (async <T>(req: StageRequest<T>): Promise<StageResult<T>> => {
    requests.push(req as StageRequest<unknown>);
    const usage = { inputTokens: 900, outputTokens: 60 };
    return { object: object as T, usage, costUsd: 0.0002, latencyMs: 40, raw: "", model: req.model, source: "live" };
  }) as typeof runStage;
  return { fake, requests };
}

describe("buildSelectInput", () => {
  it("puts the conversation, the catalogue and the question in tagged sections, in that order", () => {
    const input = buildSelectInput({ question: "What matters?", history: [], events });
    const order = ["<conversation>", "</conversation>", "<catalogue>", "</catalogue>", "<question>", "</question>"];
    const positions = order.map((tag) => input.indexOf(tag));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("carries the whole compact catalogue", () => {
    const input = buildSelectInput({ question: "What matters?", history: [], events });
    expect(input).toContain(`<catalogue>\n${renderCompact(events)}\n</catalogue>`);
  });

  it("ends with the question", () => {
    const input = buildSelectInput({ question: "  What matters most?  ", history: [], events });
    expect(input.endsWith("<question>\nWhat matters most?\n</question>")).toBe(true);
  });

  it("renders the recent turns, with the ids an assistant turn cited", () => {
    const input = buildSelectInput({
      question: "Which of those?",
      history: [
        { role: "user", text: "Top three?" },
        { role: "assistant", text: "Cloud, chips and power.", citedIds: ["evt_001", "evt_006", "evt_004"] },
      ],
      events,
    });
    expect(input).toContain(
      "<conversation>\nUser: Top three?\nAssistant: Cloud, chips and power. (cited: evt_001, evt_006, evt_004)\n</conversation>",
    );
  });

  it("says when there is no earlier turn", () => {
    const input = buildSelectInput({ question: "Which of those?", history: [], events });
    expect(input).toContain(`<conversation>\n${NO_HISTORY}\n</conversation>`);
  });

  it("refuses a catalogue larger than the selection budget", () => {
    const long: Event[] = Array.from({ length: 60 }, (_, i) => ({
      ...events[0],
      event_id: `evt_${String(i + 1).padStart(3, "0")}`,
      title: "A long title ".repeat(8),
    }));
    expect(renderCompact(long).length).toBeGreaterThan(SELECT_CONTEXT_CHAR_BUDGET);
    expect(() => buildSelectInput({ question: "What matters?", history: [], events: long })).toThrow(/budget/);
  });
});

describe("runSelect", () => {
  it("calls the select model with the select prompt and the built input", async () => {
    const { fake, requests } = fakeRunStage(picked);
    await runSelect({ question: "What matters?", history: [] }, { runStage: fake, gateway: {} });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      stage: "select",
      model: SELECT_MODEL,
      schema: SelectOutputSchema,
      system: loadPrompt("select").text,
      input: buildSelectInput({ question: "What matters?", history: [], events }),
      timeoutMs: SELECT_TIMEOUT_MS,
    });
  });

  it("returns the selection and a stage record labelled with the select prompt", async () => {
    const { fake } = fakeRunStage(picked);
    const outcome = await runSelect({ question: "What matters?", history: [] }, { runStage: fake, gateway: {} });
    expect(outcome.object).toEqual(picked);
    expect(outcome.record).toMatchObject({
      stage: "select",
      model: SELECT_MODEL,
      inputTokens: 900,
      outputTokens: 60,
      promptHash: promptLabel(loadPrompt("select")),
      source: "live",
    });
  });
});
