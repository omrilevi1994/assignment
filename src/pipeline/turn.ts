import { loadEvents } from "@/data/load";
import type { Event, EventId } from "@/domain/event";
import type { AnswerOutput, SelectOutput } from "@/domain/stages";
import type { StageRecord, Trace, TraceStatus } from "@/domain/trace";
import { type VerifyReport, isCleanReport, verify } from "@/domain/verify";
import { GatewayError, type GatewayErrorKind } from "@/llm/errors";
import { type GatewayDeps, runStage } from "@/llm/gateway";
import { runAnswer } from "./answer";
import type { HistoryTurn } from "./history";
import { insufficientEvidenceAnswer } from "./insufficient";
import { runSelect } from "./select";
import type { StageContext, StageOutcome } from "./stage";

/** Injection points for tests. Production code passes nothing. */
export type TurnDeps = { runStage?: typeof runStage; gateway?: GatewayDeps; now?: () => number };

/** A failure as the user may see it: a kind to branch on and a message that leaks nothing. */
export type TurnError = { kind: string; message: string };

/** Everything one turn produced. `answer` is null only when a stage failed. */
export type TurnResult = {
  status: TraceStatus;
  answer: AnswerOutput | null;
  select: SelectOutput | null;
  standaloneQuestion: string;
  selectedIds: EventId[];
  verifyReport: VerifyReport | null;
  trace: Trace;
  error: TurnError | null;
};

/** A turn in progress: what completed so far, so that a failure can still report it. */
type TurnState = {
  ctx: StageContext;
  now: () => number;
  stages: StageRecord[];
  select: SelectOutput | null;
  selectedIds: EventId[];
  failure: { stage: string; elapsedMs: number } | null;
};

/** What verify returned for the turn's answer. */
type Verified = { answer: AnswerOutput; report: VerifyReport };

const SAFE_MESSAGES: Record<GatewayErrorKind, string> = {
  timeout: "The model took too long to respond. Please try again.",
  provider_error: "The model provider could not complete the request. Please try again shortly.",
  invalid_output: "The model returned an answer in an unexpected shape. Please try again.",
  empty_output: "The model returned an empty answer. Please try again.",
};

const INTERNAL_ERROR: TurnError = {
  kind: "internal_error",
  message: "Something went wrong while answering. Please try again.",
};

/** Sum of a list of numbers. */
function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** A fresh turn state with the real gateway and clock unless the caller injected others. */
function newState(deps: TurnDeps): TurnState {
  return {
    ctx: { runStage: deps.runStage ?? runStage, gateway: deps.gateway ?? {} },
    now: deps.now ?? (() => performance.now()),
    stages: [],
    select: null,
    selectedIds: [],
    failure: null,
  };
}

/**
 * Runs one stage and records it in the trace. When it throws, remembers which
 * stage failed and how long it ran, then rethrows.
 */
async function track<T>(state: TurnState, stage: string, call: () => Promise<StageOutcome<T>>): Promise<T> {
  const startedAt = state.now();
  try {
    const outcome = await call();
    state.stages.push(outcome.record);
    return outcome.object;
  } catch (error) {
    state.failure = { stage, elapsedMs: Math.max(0, Math.round(state.now() - startedAt)) };
    throw error;
  }
}

/** The ids the selection stage returned, each once, in the order it gave them. */
function selectedIdsOf(select: SelectOutput): EventId[] {
  return [...new Set(select.selected.map((pick) => pick.event_id))];
}

/** The events behind the given ids, in the same order; ids that name no event are skipped. */
function eventsFor(ids: readonly EventId[], events: readonly Event[]): Event[] {
  const byId = new Map(events.map((event) => [event.event_id, event]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** `ok` when verify left the answer as written, `degraded` when it stripped, demoted or lowered anything. */
export function settleStatus(report: VerifyReport): TraceStatus {
  return isCleanReport(report) ? "ok" : "degraded";
}

/** Reduces any error to a kind and a fixed, user-safe message: no stack, provider text, key or prompt. */
export function safeError(error: unknown): TurnError {
  if (error instanceof GatewayError) return { kind: error.kind, message: SAFE_MESSAGES[error.kind] };
  return INTERNAL_ERROR;
}

/** The trace of the turn: its stages, the verify report and totals summed over the stages. */
function buildTrace(state: TurnState, status: TraceStatus, report: VerifyReport | null, error: string | null): Trace {
  return {
    status,
    stages: [...state.stages],
    verifyReport: report,
    totalCostUsd: sum(state.stages.map((stage) => stage.costUsd)),
    // A failed stage leaves no record, but the user still waited for it.
    totalLatencyMs: sum(state.stages.map((stage) => stage.latencyMs)) + (state.failure?.elapsedMs ?? 0),
    error,
  };
}

/** Answers from the selected events, or short-circuits when there is nothing to answer from. */
async function answerFor(
  state: TurnState,
  select: SelectOutput,
  history: readonly HistoryTurn[],
  events: Event[],
): Promise<AnswerOutput> {
  if (!select.answerable || events.length === 0) return insufficientEvidenceAnswer(select);
  const input = { question: select.standalone_question, history, events };
  return track(state, "answer", () => runAnswer(input, state.ctx));
}

/** The result of a turn whose stages all completed. */
function settled(state: TurnState, select: SelectOutput, selectedIds: EventId[], verified: Verified): TurnResult {
  const status = settleStatus(verified.report);
  return {
    status,
    answer: verified.answer,
    select,
    standaloneQuestion: select.standalone_question,
    selectedIds,
    verifyReport: verified.report,
    trace: buildTrace(state, status, verified.report, null),
    error: null,
  };
}

/** The result of a turn that stopped at an error: no answer, but every stage that completed. Reads state only, so it cannot throw. */
function failed(state: TurnState, question: string, error: unknown): TurnResult {
  const safe = safeError(error);
  const where = state.failure ? `${state.failure.stage} stage` : "turn";
  return {
    status: "failed",
    answer: null,
    select: state.select,
    standaloneQuestion: state.select?.standalone_question ?? question,
    selectedIds: state.selectedIds,
    verifyReport: null,
    trace: buildTrace(state, "failed", null, `${where} failed (${safe.kind}): ${safe.message}`),
    error: safe,
  };
}

/** Select, then answer or short-circuit, then verify against the selection and every known event. */
async function completeTurn(state: TurnState, question: string, history: readonly HistoryTurn[]): Promise<TurnResult> {
  const select = await track(state, "select", () => runSelect({ question, history }, state.ctx));
  state.select = select;
  const selectedIds = selectedIdsOf(select);
  state.selectedIds = selectedIds;
  const events = loadEvents();
  const answer = await answerFor(state, select, history, eventsFor(selectedIds, events));
  const knownIds = events.map((event) => event.event_id);
  return settled(state, select, selectedIds, verify(answer, selectedIds, knownIds));
}

/**
 * Runs one chat turn: Select picks the events, Answer writes from them (or the
 * turn short-circuits when there is no evidence), and Verify strips anything
 * the selection does not support. Never rejects: a failing stage becomes a
 * `failed` result with a user-safe error and a trace of what completed.
 */
export async function runTurn(question: string, history: readonly HistoryTurn[], deps: TurnDeps = {}): Promise<TurnResult> {
  const state = newState(deps);
  try {
    return await completeTurn(state, question, history);
  } catch (error) {
    return failed(state, question, error);
  }
}
