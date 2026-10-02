import { fixtureKey } from "@/llm/fixtures";
import { type StageResult, runStage } from "@/llm/gateway";

/** Memoizes calls within one run, preserving one recorded answer for each fixture key. */
export function recordingGateway(invoke: typeof runStage = runStage): { call: typeof runStage; costUsd: () => number; newCallCostUsd: () => number } {
  const calls = new Map<string, Promise<StageResult<unknown>>>();
  let costUsd = 0;
  let newCallCostUsd = 0;
  /** Shares concurrent identical calls and stops new requests before the recording budget is exhausted. */
  const call: typeof runStage = async (request, deps) => {
    const key = fixtureKey(request);
    const mode = deps?.mode ?? process.env.LLM_MODE ?? "replay";
    const spending = mode === "live" || mode === "record";
    let pending = calls.get(key);
    if (!pending) {
      if (spending && newCallCostUsd >= 5.5) throw new Error("Recording spend guard reached; retain fixtures and review costs.");
      pending = invoke(request, deps).then((result) => {
        const billed = result.billedCostUsd ?? result.costUsd;
        costUsd += billed;
        if (spending && result.source === "live") newCallCostUsd += billed;
        return result;
      });
      calls.set(key, pending);
    }
    const result = await pending;
    return { ...result, object: request.schema.parse(result.object) };
  };
  return { call,
    /** Historical cost of unique recordings used by this run. */ costUsd: () => costUsd,
    /** Cost reported by newly completed provider calls; replay is zero. */ newCallCostUsd: () => newCallCostUsd,
  };
}
