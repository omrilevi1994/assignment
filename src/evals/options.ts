import { parseArgs } from "node:util";
import { z } from "zod";

const OptionsSchema = z.object({ live: z.boolean(), runs: z.enum(["default", "comparison", "all"]), cases: z.array(z.string().min(1)), judge: z.boolean() });
export type EvalOptions = z.infer<typeof OptionsSchema>;

/** Parses explicit flags; environment variables never opt the command into spending. */
export function parseOptions(args: string[]): EvalOptions {
  const { values } = parseArgs({ args, options: {
    live: { type: "boolean", default: false }, runs: { type: "string", default: "default" },
    cases: { type: "string" }, judge: { type: "string" },
  } });
  if (values.judge !== undefined && values.judge !== "off") throw new Error("--judge accepts only off.");
  return OptionsSchema.parse({ live: values.live, runs: values.runs, cases: values.cases?.split(",") ?? [], judge: values.judge !== "off" });
}
