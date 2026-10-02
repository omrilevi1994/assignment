import { describe, expect, it } from "vitest";
import { loadCompany, loadEvents } from "@/data/load";
import { renderCompanyProfile, renderFullList } from "@/domain/render";
import { AnswerOutputSchema, type AnswerOutput } from "@/domain/stages";
import type { StageRequest, StageResult, runStage } from "@/llm/gateway";
import { buildAnswerInput, runAnswer } from "./answer";
import { NO_HISTORY } from "./history";
import { ANSWER_MODEL, ANSWER_TIMEOUT_MS } from "./models";
import { loadPrompt, promptLabel } from "./prompts";

const events = loadEvents();
const profile = loadCompany();
const chosen = events.filter((event) => ["evt_001", "evt_006"].includes(event.event_id));

const written: AnswerOutput = {
  summary: "Cloud concentration and chip export licensing matter most.",
  facts: [{ claim: "A cloud region was down for six hours.", sources: [{ type: "event", id: "evt_001" }] }],
  analysis: [],
  evidence_level: "partial",
  missing_info: "Asteron's own cloud failover plans.",
  follow_ups: [],
};

/** A runStage stand-in that records the request and answers with `object`. */
function fakeRunStage(object: unknown) {
  const requests: StageRequest<unknown>[] = [];
  const fake = (async <T>(req: StageRequest<T>): Promise<StageResult<T>> => {
    requests.push(req as StageRequest<unknown>);
    const usage = { inputTokens: 3000, outputTokens: 700 };
    return { object: object as T, usage, costUsd: 0.01, latencyMs: 900, raw: "", model: req.model, source: "live" };
  }) as typeof runStage;
  return { fake, requests };
}

describe("buildAnswerInput", () => {
  const input = buildAnswerInput({ question: "What matters?", history: [], events: chosen, profile });

  it("puts the profile, the events, the conversation and the question in tagged sections, in that order", () => {
    const order = ["<company_profile>", "<selected_events>", "<conversation>", "<question>"];
    const positions = order.map((tag) => input.indexOf(tag));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("renders the company profile field by field", () => {
    expect(input).toContain(`<company_profile>\n${renderCompanyProfile(profile)}\n</company_profile>`);
  });

  it("renders only the selected events, in full", () => {
    expect(input).toContain(`<selected_events>\n${renderFullList(chosen)}\n</selected_events>`);
    expect(input).not.toContain("[evt_002]");
  });

  it("ends with the standalone question", () => {
    expect(input.endsWith("<question>\nWhat matters?\n</question>")).toBe(true);
  });

  it("includes the recent turns, or says there are none", () => {
    expect(input).toContain(`<conversation>\n${NO_HISTORY}\n</conversation>`);
    const followUp = buildAnswerInput({
      question: "Which of evt_001 and evt_006 could raise costs?",
      history: [{ role: "assistant", text: "Cloud and chips.", citedIds: ["evt_001", "evt_006"] }],
      events: chosen,
      profile,
    });
    expect(followUp).toContain("<conversation>\nAssistant: Cloud and chips. (cited: evt_001, evt_006)\n</conversation>");
  });
});

describe("runAnswer", () => {
  it("calls the answer model with the answer prompt, the built input and the committed profile", async () => {
    const { fake, requests } = fakeRunStage(written);
    await runAnswer({ question: "What matters?", history: [], events: chosen }, { runStage: fake, gateway: {} });
    expect(requests).toEqual([
      {
        stage: "answer",
        model: ANSWER_MODEL,
        schema: AnswerOutputSchema,
        system: loadPrompt("answer").text,
        input: buildAnswerInput({ question: "What matters?", history: [], events: chosen, profile }),
        timeoutMs: ANSWER_TIMEOUT_MS,
      },
    ]);
  });

  it("returns the answer and a stage record labelled with the answer prompt", async () => {
    const { fake } = fakeRunStage(written);
    const outcome = await runAnswer({ question: "What matters?", history: [], events: chosen }, { runStage: fake, gateway: {} });
    expect(outcome.object).toEqual(written);
    expect(outcome.record).toMatchObject({
      stage: "answer",
      model: ANSWER_MODEL,
      outputTokens: 700,
      latencyMs: 900,
      promptHash: promptLabel(loadPrompt("answer")),
    });
  });
});
