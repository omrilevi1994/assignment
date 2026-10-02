import { readFileSync } from "node:fs";
import { z } from "zod";
import { DEFAULT_ANSWER_MODEL, DEFAULT_SELECT_MODEL } from "@/pipeline/models";
import { loadCases } from "./case";
import type { EvalRun, RunGroup, Strategy } from "./types";

const modelId = z.string().regex(/^[a-z0-9-]+\/[a-z0-9.:_-]+$/);

/** Provider namespace identifies a model family conservatively across model versions. */
export function modelFamily(model: string): string {
  return model.split("/")[0];
}

/** No judge may score its own family, including the selector's contribution. */
function independentJudge(matrix: z.infer<typeof BaseMatrixSchema>): boolean {
  const models = [matrix.default.selectModel, matrix.default.answerModel, matrix.comparison.selectModel, ...matrix.comparison.answerModels];
  return models.every((model) => modelFamily(model) !== modelFamily(matrix.judgeModel));
}

const BaseMatrixSchema = z.strictObject({
  judgeModel: modelId,
  default: z.strictObject({ selectModel: modelId, answerModel: modelId }),
  comparison: z.strictObject({ selectModel: modelId, answerModels: z.array(modelId).min(3), cases: z.array(z.string().min(1)).length(6) }),
});

export const MatrixSchema = BaseMatrixSchema
  .refine(independentJudge, "Judge must belong to a different model family.")
  .refine((matrix) => new Set(matrix.comparison.answerModels).size === matrix.comparison.answerModels.length, "Duplicate comparison models.")
  .refine((matrix) => new Set(matrix.comparison.cases).size === matrix.comparison.cases.length, "Duplicate comparison cases.")
  .refine((matrix) => matrix.default.selectModel === DEFAULT_SELECT_MODEL && matrix.default.answerModel === DEFAULT_ANSWER_MODEL, "Default run must mirror the pipeline defaults.");
export type EvalMatrix = z.infer<typeof MatrixSchema>;

/** Reads and validates the versioned comparison configuration. */
export function loadMatrix(): EvalMatrix {
  return MatrixSchema.parse(JSON.parse(readFileSync(new URL("../../evals/matrix.json", import.meta.url), "utf8")));
}

/** Builds both strategies for each comparison model in a stable order. */
function comparisonRuns(matrix: EvalMatrix): EvalRun[] {
  const strategies: Strategy[] = ["pipeline", "single-call"];
  return matrix.comparison.answerModels.flatMap((answerModel) => strategies.map((strategy) => ({
    id: `comparison-${answerModel.replace("/", "-")}-${strategy}`, strategy, answerModel,
    selectModel: matrix.comparison.selectModel, judgeModel: matrix.judgeModel, cases: matrix.comparison.cases,
  })));
}

/** Expands the matrix, rejecting unknown cases before any model is called. */
export function expandRuns(matrix: EvalMatrix, group: RunGroup): EvalRun[] {
  const known = loadCases().map((item) => item.id);
  for (const id of matrix.comparison.cases) if (!known.includes(id)) throw new Error(`Unknown matrix case: ${id}`);
  const baseline: EvalRun = { id: "default", strategy: "pipeline", ...matrix.default, judgeModel: matrix.judgeModel, cases: known };
  if (group === "default") return [baseline];
  const comparison = comparisonRuns(matrix);
  return group === "all" ? [baseline, ...comparison] : comparison;
}
