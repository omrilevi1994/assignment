import { describe, expect, it, vi } from "vitest";
import {
  type ModelInfo,
  MODELS_ENDPOINT,
  costFromUsage,
  fetchRegistry,
  findModel,
  loadRegistry,
  parseModelsResponse,
  serializeRegistry,
} from "./registry";

/** Trimmed copy of three entries from GET https://openrouter.ai/api/v1/models (October 2026). */
const sample = {
  data: [
    {
      id: "openai/gpt-4o-mini",
      canonical_slug: "openai/gpt-4o-mini",
      name: "OpenAI: GPT-4o-mini",
      created: 1721260800,
      context_length: 128000,
      pricing: { prompt: "0.00000015", completion: "0.0000006", input_cache_read: "0.000000075" },
      top_provider: { context_length: 128000, max_completion_tokens: 16384, is_moderated: true },
      supported_parameters: ["max_tokens", "response_format", "structured_outputs", "temperature"],
    },
    {
      id: "google/gemma-3-4b-it",
      canonical_slug: "google/gemma-3-4b-it",
      name: "Google: Gemma 3 4B",
      created: 1741905510,
      context_length: 131072,
      pricing: { prompt: "0.00000005", completion: "0.0000001" },
      top_provider: { context_length: 131072, max_completion_tokens: 16384, is_moderated: false },
      supported_parameters: ["max_tokens", "response_format", "structured_outputs"],
    },
    {
      id: "openrouter/auto",
      canonical_slug: "openrouter/auto",
      name: "Auto Router",
      created: 1699401600,
      context_length: 2000000,
      pricing: { prompt: "-1", completion: "-1" },
      top_provider: { context_length: null, max_completion_tokens: null, is_moderated: false },
      supported_parameters: ["response_format", "structured_outputs"],
    },
  ],
  total_count: 3,
  links: { next: null },
};

const handWritten: ModelInfo = {
  id: "acme/test-model",
  name: "Acme: Test Model",
  promptUsdPerToken: 0.000002,
  completionUsdPerToken: 0.000008,
  contextLength: 32000,
};

describe("parseModelsResponse", () => {
  it("turns the endpoint's string prices into numbers per token", () => {
    expect(parseModelsResponse(sample).slice(0, 2)).toEqual([
      {
        id: "openai/gpt-4o-mini",
        name: "OpenAI: GPT-4o-mini",
        promptUsdPerToken: 0.00000015,
        completionUsdPerToken: 0.0000006,
        contextLength: 128000,
      },
      {
        id: "google/gemma-3-4b-it",
        name: "Google: Gemma 3 4B",
        promptUsdPerToken: 0.00000005,
        completionUsdPerToken: 0.0000001,
        contextLength: 131072,
      },
    ]);
  });

  it("drops routers whose price is variable (-1), since their cost cannot be computed", () => {
    expect(parseModelsResponse(sample).map((m) => m.id)).not.toContain("openrouter/auto");
  });

  it("rejects a response that does not have the endpoint's shape", () => {
    expect(() => parseModelsResponse({ models: [] })).toThrow();
    expect(() => parseModelsResponse({ data: [{ id: "x", pricing: { prompt: 1 } }] })).toThrow();
  });
});

describe("costFromUsage", () => {
  it("prices input and output tokens separately, in USD", () => {
    // 1 200 x $2/M + 350 x $8/M = $0.0024 + $0.0028
    expect(costFromUsage(handWritten, { inputTokens: 1200, outputTokens: 350 })).toBeCloseTo(0.0052, 12);
  });

  it("is zero for no tokens", () => {
    expect(costFromUsage(handWritten, { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

describe("findModel", () => {
  it("returns the model with the given id", () => {
    expect(findModel([handWritten], "acme/test-model")).toBe(handWritten);
  });

  it("throws an error naming an unknown id", () => {
    expect(() => findModel([handWritten], "acme/missing")).toThrow(/acme\/missing/);
  });
});

describe("fetchRegistry", () => {
  it("reads the public models endpoint and parses it", async () => {
    const fetchImpl = vi.fn(async () => Response.json(sample));
    const models = await fetchRegistry(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(MODELS_ENDPOINT);
    expect(MODELS_ENDPOINT).toBe("https://openrouter.ai/api/v1/models");
    expect(models).toHaveLength(2);
  });

  it("throws when the endpoint answers with an error status", async () => {
    const fetchImpl = vi.fn(async () => new Response("down", { status: 503 }));
    await expect(fetchRegistry(fetchImpl as unknown as typeof fetch)).rejects.toThrow(/503/);
  });
});

describe("serializeRegistry", () => {
  it("writes models sorted by id with 2-space indentation and a trailing newline", () => {
    const text = serializeRegistry(parseModelsResponse(sample));
    const parsed = JSON.parse(text) as ModelInfo[];
    expect(parsed.map((m) => m.id)).toEqual(["google/gemma-3-4b-it", "openai/gpt-4o-mini"]);
    expect(text.startsWith('[\n  {\n    "id": "google/gemma-3-4b-it",')).toBe(true);
    expect(text.endsWith("]\n")).toBe(true);
  });
});

describe("loadRegistry", () => {
  it("reads the committed snapshot as priced models sorted by id", () => {
    const registry = loadRegistry();
    expect(registry.length).toBeGreaterThan(100);
    expect(registry.map((m) => m.id)).toEqual(registry.map((m) => m.id).sort());
    for (const model of registry) {
      expect(model.promptUsdPerToken).toBeGreaterThanOrEqual(0);
      expect(model.completionUsdPerToken).toBeGreaterThanOrEqual(0);
    }
  });

  it("contains the snapshot's price for a well-known model", () => {
    expect(findModel(loadRegistry(), "openai/gpt-4o-mini")).toMatchObject({ promptUsdPerToken: 1.5e-7, completionUsdPerToken: 6e-7 });
  });
});
