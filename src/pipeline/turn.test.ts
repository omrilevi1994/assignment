import { describe, expect, it } from "vitest";
import { loadEvents } from "@/data/load";
import type { EventId } from "@/domain/event";
import type { AnswerOutput, SelectOutput } from "@/domain/stages";
import { TraceSchema } from "@/domain/trace";
import { GatewayError } from "@/llm/errors";
import { type StageRequest, type StageResult, runStage } from "@/llm/gateway";
import type { HistoryTurn } from "./history";
import { insufficientEvidenceAnswer } from "./insufficient";
import { loadPrompt, promptLabel } from "./prompts";
import { runTurn } from "./index";

/** Event ids cited anywhere in an answer. */
function citedIds(answer: AnswerOutput): EventId[] {
  return [...answer.facts, ...answer.analysis].flatMap((claim) =>
    claim.sources.flatMap((source) => (source.type === "event" ? [source.id] : [])),
  );
}

type Script = { select?: SelectOutput | Error; answer?: AnswerOutput | Error };

/** A runStage stand-in that answers each stage from the script, or throws the scripted error. */
function scripted(script: Script) {
  const requests: StageRequest<unknown>[] = [];
  const fake = (async <T>(req: StageRequest<T>): Promise<StageResult<T>> => {
    requests.push(req as StageRequest<unknown>);
    const step = script[req.stage as keyof Script];
    if (step === undefined) throw new Error(`unexpected stage ${req.stage}`);
    if (step instanceof Error) throw step;
    const usage = req.stage === "select" ? { inputTokens: 1000, outputTokens: 100 } : { inputTokens: 3000, outputTokens: 800 };
    const costUsd = req.stage === "select" ? 0.0002 : 0.012;
    const latencyMs = req.stage === "select" ? 700 : 9000;
    return { object: step as T, usage, costUsd, latencyMs, raw: "", model: req.model, source: "live" };
  }) as typeof runStage;
  return { fake, requests };
}

const picked: SelectOutput = {
  standalone_question: "Which developments matter most to Asteron?",
  answerable: true,
  selected: [
    { event_id: "evt_001", reason: "cloud outage" },
    { event_id: "evt_006", reason: "chip chemicals" },
  ],
  gap: "",
};

const grounded: AnswerOutput = {
  summary: "Cloud concentration and chip-chemical licensing matter most.",
  facts: [
    { claim: "A cloud region was down for six hours.", sources: [{ type: "event", id: "evt_001" }] },
    { claim: "Two chip chemicals now need export licences.", sources: [{ type: "event", id: "evt_006" }] },
  ],
  analysis: [
    {
      claim: "Asteron's services could be interrupted by a similar outage.",
      sources: [
        { type: "event", id: "evt_001" },
        { type: "company_profile", field: "critical_dependencies" },
      ],
    },
  ],
  evidence_level: "strong",
  missing_info: "",
  follow_ups: ["Which events affect energy costs?"],
};

const unanswerable: SelectOutput = {
  standalone_question: "Will interest rates fall next quarter?",
  answerable: false,
  selected: [],
  gap: "No event reports interest-rate guidance.",
};

describe("runTurn with scripted stages", () => {
  it("selects, answers and verifies, and reports ok when verify changes nothing", async () => {
    const { fake, requests } = scripted({ select: picked, answer: grounded });
    const result = await runTurn("What matters most?", [], { runStage: fake });
    expect(requests.map((r) => r.stage)).toEqual(["select", "answer"]);
    expect(result).toMatchObject({
      status: "ok",
      answer: grounded,
      select: picked,
      standaloneQuestion: picked.standalone_question,
      selectedIds: ["evt_001", "evt_006"],
      verifyReport: { removed_citations: [], demoted_claims: [], evidence_level_changed: null },
      error: null,
    });
  });

  it("hands the answer stage the standalone question and only the selected events", async () => {
    const { fake, requests } = scripted({ select: picked, answer: grounded });
    await runTurn("What matters most?", [], { runStage: fake });
    const input = requests[1].input;
    expect(input).toContain(`<question>\n${picked.standalone_question}\n</question>`);
    expect(input).toContain("[evt_001]");
    expect(input).toContain("[evt_006]");
    expect(input.match(/^\[evt_\d{3}\]/gm)).toHaveLength(2);
  });

  it("hands both stages the recent history", async () => {
    const { fake, requests } = scripted({ select: picked, answer: grounded });
    const history: HistoryTurn[] = [
      { role: "user", text: "Top two?" },
      { role: "assistant", text: "Cloud and chips.", citedIds: ["evt_001", "evt_006"] },
    ];
    await runTurn("Which of those is worse?", history, { runStage: fake });
    for (const request of requests) {
      expect(request.input).toContain("User: Top two?\nAssistant: Cloud and chips. (cited: evt_001, evt_006)");
    }
  });

  it("records one stage per model call with prompt labels, and totals that are sums", async () => {
    const { fake } = scripted({ select: picked, answer: grounded });
    const { trace } = await runTurn("What matters most?", [], { runStage: fake });
    expect(TraceSchema.parse(trace)).toEqual(trace);
    expect(trace.stages.map((s) => [s.stage, s.promptHash])).toEqual([
      ["select", promptLabel(loadPrompt("select"))],
      ["answer", promptLabel(loadPrompt("answer"))],
    ]);
    expect(trace).toMatchObject({ status: "ok", totalLatencyMs: 9700, error: null });
    expect(trace.totalCostUsd).toBeCloseTo(0.0122, 12);
    expect(trace.verifyReport).toEqual({ removed_citations: [], demoted_claims: [], evidence_level_changed: null });
  });

  it("reports degraded when verify strips a citation to an event that was not selected", async () => {
    const stray = { ...grounded, analysis: [{ claim: "Freight may cost more.", sources: [{ type: "event" as const, id: "evt_002" }] }] };
    const { fake } = scripted({ select: picked, answer: stray });
    const result = await runTurn("What matters most?", [], { runStage: fake });
    expect(result.status).toBe("degraded");
    expect(result.trace.status).toBe("degraded");
    expect(result.verifyReport?.removed_citations).toEqual([
      { id: "evt_002", reason: "not_selected", claim: "Freight may cost more." },
    ]);
    expect(citedIds(result.answer as AnswerOutput)).not.toContain("evt_002");
  });

  it("reports degraded when verify demotes every fact and lowers the evidence level", async () => {
    const unsupported: AnswerOutput = {
      ...grounded,
      facts: [{ claim: "Asteron's Poland plant was hit.", sources: [{ type: "event", id: "evt_099" }] }],
      analysis: [],
    };
    const { fake } = scripted({ select: picked, answer: unsupported });
    const result = await runTurn("What happened in Poland?", [], { runStage: fake });
    expect(result.status).toBe("degraded");
    expect(result.answer).toMatchObject({ facts: [], evidence_level: "none" });
    expect(result.verifyReport?.evidence_level_changed).toEqual({ from: "strong", to: "none" });
  });

  it("short-circuits without an answer call when selection finds the question unanswerable", async () => {
    const { fake, requests } = scripted({ select: unanswerable });
    const result = await runTurn("Will interest rates fall next quarter?", [], { runStage: fake });
    expect(requests.map((r) => r.stage)).toEqual(["select"]);
    expect(result).toMatchObject({ status: "ok", answer: insufficientEvidenceAnswer(unanswerable), selectedIds: [] });
    expect(result.trace.stages).toHaveLength(1);
    expect(result.verifyReport).toEqual({ removed_citations: [], demoted_claims: [], evidence_level_changed: null });
  });

  it("short-circuits when selection calls the question answerable but picks no event", async () => {
    const { fake, requests } = scripted({ select: { ...picked, selected: [] } });
    const result = await runTurn("What matters most?", [], { runStage: fake });
    expect(requests).toHaveLength(1);
    expect(result.answer?.evidence_level).toBe("none");
  });

  it("short-circuits when every selected id is unknown, and still reports those ids", async () => {
    const invented = { ...picked, selected: [{ event_id: "evt_099", reason: "made up" }] };
    const { fake, requests } = scripted({ select: invented });
    const result = await runTurn("What matters most?", [], { runStage: fake });
    expect(requests).toHaveLength(1);
    expect(result).toMatchObject({ status: "ok", selectedIds: ["evt_099"] });
  });

  it("lists a selected id once even when selection repeats it", async () => {
    const repeated = { ...picked, selected: [...picked.selected, { event_id: "evt_001", reason: "again" }] };
    const { fake, requests } = scripted({ select: repeated, answer: grounded });
    const result = await runTurn("What matters most?", [], { runStage: fake });
    expect(result.selectedIds).toEqual(["evt_001", "evt_006"]);
    expect(requests[1].input.match(/^\[evt_001\]/gm)).toHaveLength(1);
  });

  it("verifies against every known event, so an invented id is stripped even when selection returned it", async () => {
    const withInvented = { ...picked, selected: [...picked.selected, { event_id: "evt_099", reason: "made up" }] };
    const citesInvented: AnswerOutput = {
      ...grounded,
      analysis: [{ claim: "A plant may close.", sources: [{ type: "event", id: "evt_099" }] }],
    };
    const { fake } = scripted({ select: withInvented, answer: citesInvented });
    const result = await runTurn("What matters most?", [], { runStage: fake });
    expect(loadEvents().map((event) => event.event_id)).not.toContain("evt_099");
    expect(result.selectedIds).toContain("evt_099");
    expect(result.verifyReport?.removed_citations).toEqual([{ id: "evt_099", reason: "unknown", claim: "A plant may close." }]);
    expect(result.status).toBe("degraded");
  });
});

describe("runTurn when a stage fails", () => {
  it("returns failed with the select stage and the error when the answer stage times out", async () => {
    const timeout = new GatewayError("timeout", "aborted after 90000 ms calling google/gemini-2.5-pro", { retried: true });
    const { fake } = scripted({ select: picked, answer: timeout });
    const run = runTurn("What matters most?", [], { runStage: fake });
    await expect(run).resolves.toBeDefined();
    const result = await run;
    expect(result).toMatchObject({ status: "failed", answer: null, select: picked, verifyReport: null });
    expect(result.error?.kind).toBe("timeout");
    expect(result.trace.stages.map((s) => s.stage)).toEqual(["select"]);
    expect(result.trace).toMatchObject({ status: "failed", verifyReport: null });
    expect(result.trace.error).toMatch(/answer/);
    expect(result.trace.error).toMatch(/timeout/);
    expect(TraceSchema.safeParse(result.trace).success).toBe(true);
  });

  it("gives a user-safe message without the provider's text", async () => {
    const leak = new GatewayError("provider_error", "401 for key sk-or-v1-abc123 with system prompt You are the answer stage");
    const { fake } = scripted({ select: picked, answer: leak });
    const result = await runTurn("What matters most?", [], { runStage: fake });
    const shown = `${result.error?.message} ${result.trace.error}`;
    expect(result.error?.kind).toBe("provider_error");
    expect(shown).not.toMatch(/sk-or|401|system prompt|You are/);
    expect(result.error?.message.length).toBeGreaterThan(0);
  });

  it("returns failed with no stages when the select stage fails", async () => {
    const { fake } = scripted({ select: new GatewayError("invalid_output", "bad json") });
    const result = await runTurn("What matters most?", [], { runStage: fake });
    expect(result).toMatchObject({
      status: "failed",
      answer: null,
      select: null,
      standaloneQuestion: "What matters most?",
      selectedIds: [],
      error: { kind: "invalid_output" },
    });
    expect(result.trace).toMatchObject({ stages: [], totalCostUsd: 0, error: expect.stringMatching(/select/) });
  });

  it("turns any other error into a failed turn instead of rejecting", async () => {
    const { fake } = scripted({ select: new TypeError("Cannot read properties of undefined (reading 'x')") });
    const result = await runTurn("What matters most?", [], { runStage: fake });
    expect(result.status).toBe("failed");
    expect(result.error?.kind).toBe("internal_error");
    expect(result.error?.message).not.toMatch(/undefined|reading/);
    expect(result.trace.error).toBe(`select stage failed (internal_error): ${result.error?.message}`);
  });

  it("names the turn rather than a stage when the failure happens outside a stage", async () => {
    const { fake } = scripted({ select: { ...picked, selected: null as unknown as SelectOutput["selected"] } });
    const result = await runTurn("What matters most?", [], { runStage: fake });
    expect(result).toMatchObject({ status: "failed", error: { kind: "internal_error" } });
    expect(result.trace.stages.map((stage) => stage.stage)).toEqual(["select"]);
    expect(result.trace.error).toBe(`turn failed (internal_error): ${result.error?.message}`);
  });

  it("counts the time spent in the failed stage in the total latency", async () => {
    const ticks = [0, 1_000, 61_000];
    const now = () => ticks.shift() ?? 61_000;
    const { fake } = scripted({ select: picked, answer: new GatewayError("timeout", "slow") });
    const result = await runTurn("What matters most?", [], { runStage: fake, now });
    expect(result.trace.totalLatencyMs).toBe(700 + 60_000);
  });
});
