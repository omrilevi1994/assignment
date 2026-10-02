import { z } from "zod";
import snapshot from "./models.snapshot.json";

/** A model as the gateway needs it: identity, prices and context size. */
export type ModelInfo = {
  id: string;
  name: string;
  promptUsdPerToken: number;
  completionUsdPerToken: number;
  contextLength: number;
};

/** Token counts reported for one model call. */
export type TokenUsage = { inputTokens: number; outputTokens: number };

/** OpenRouter's public model list; it needs no API key. */
export const MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";

/** The fields the gateway reads from one entry of the models endpoint. Prices are USD per token, as strings. */
const EndpointModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  context_length: z.number(),
  pricing: z.object({ prompt: z.string(), completion: z.string() }),
});

const ModelsResponseSchema = z.object({ data: z.array(EndpointModelSchema) });

/** A usable price is a finite, non-negative number; routers report "-1" because their price varies. */
function isFixedPrice(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/** Converts one endpoint entry, or returns undefined when its price is not fixed per token. */
function toModelInfo(entry: z.infer<typeof EndpointModelSchema>): ModelInfo | undefined {
  const promptUsdPerToken = Number(entry.pricing.prompt);
  const completionUsdPerToken = Number(entry.pricing.completion);
  if (!isFixedPrice(promptUsdPerToken) || !isFixedPrice(completionUsdPerToken)) return undefined;
  return { id: entry.id, name: entry.name, promptUsdPerToken, completionUsdPerToken, contextLength: entry.context_length };
}

/** Parses the JSON body of the models endpoint into priced models. Throws on an unexpected shape. */
export function parseModelsResponse(json: unknown): ModelInfo[] {
  return ModelsResponseSchema.parse(json)
    .data.map(toModelInfo)
    .filter((model): model is ModelInfo => model !== undefined);
}

/** Cost of one call in USD. */
export function costFromUsage(model: ModelInfo, usage: TokenUsage): number {
  return usage.inputTokens * model.promptUsdPerToken + usage.outputTokens * model.completionUsdPerToken;
}

/** Looks a model up by id; an unknown id is a configuration mistake, so it throws. */
export function findModel(registry: ModelInfo[], id: string): ModelInfo {
  const model = registry.find((candidate) => candidate.id === id);
  if (!model) {
    throw new Error(`Unknown model "${id}": it is not in the OpenRouter registry. Run \`pnpm models:sync\` or pick a listed id.`);
  }
  return model;
}

/** Downloads the current model list and prices from OpenRouter. */
export async function fetchRegistry(fetchImpl: typeof fetch = fetch): Promise<ModelInfo[]> {
  const response = await fetchImpl(MODELS_ENDPOINT);
  if (!response.ok) throw new Error(`GET ${MODELS_ENDPOINT} failed with HTTP ${response.status}`);
  return parseModelsResponse(await response.json());
}

const ModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  promptUsdPerToken: z.number().nonnegative(),
  completionUsdPerToken: z.number().nonnegative(),
  contextLength: z.number(),
});

let cachedRegistry: ModelInfo[] | undefined;

/** The committed snapshot (`src/llm/models.snapshot.json`, refreshed by `pnpm models:sync`), validated once. */
export function loadRegistry(): ModelInfo[] {
  cachedRegistry ??= z.array(ModelInfoSchema).parse(snapshot);
  return cachedRegistry;
}

/** Orders models by id, comparing code points so the order does not depend on locale. */
function byId(a: ModelInfo, b: ModelInfo): number {
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Renders the snapshot file: only ModelInfo fields, sorted by id, 2-space indent, trailing newline. */
export function serializeRegistry(models: ModelInfo[]): string {
  const trimmed = [...models].sort(byId).map(({ id, name, promptUsdPerToken, completionUsdPerToken, contextLength }) => ({
    id,
    name,
    promptUsdPerToken,
    completionUsdPerToken,
    contextLength,
  }));
  return `${JSON.stringify(trimmed, null, 2)}\n`;
}
