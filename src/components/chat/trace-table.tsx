import type { StageRecord } from "@/domain/trace";
import type { VerifyReport } from "@/domain/verify";
import { citedCount, formatCost, formatTime, formatTokens } from "./derive";
import type { AnswerView } from "./types";

/** Describes verification adjustments in text, never as clickable citations. */
function verifySummary(report: VerifyReport, count: number): string {
  const removed = report.removed_citations.map((item) => `${item.id} ${item.reason.replaceAll("_", " ")}`);
  const changes = [`${count} cited`];
  if (removed.length) changes.push(`${removed.length} stripped (${removed.join(", ")})`);
  if (report.demoted_claims.length) changes.push(`${report.demoted_claims.length} moved to inference`);
  if (report.evidence_level_changed) changes.push(`evidence ${report.evidence_level_changed.from} → ${report.evidence_level_changed.to}`);
  return changes.length === 1 ? "clean" : changes.join(" · ");
}

/** Shows the stored prompt label and a short hash without inventing a prompt version. */
function promptLabel(label: string): string {
  const match = /^(.*?) · ([a-f0-9]{8,})$/.exec(label);
  return match ? `${match[1]} · ${match[2].slice(0, 4)}` : label;
}

/** Renders one recorded pipeline stage with fixed numeric formatting. */
function StageRow({ stage, verification }: { stage: StageRecord; verification: string }) {
  return <tr className="align-top [&>td]:px-1.5 [&>td]:py-2">
    <td className="pl-0! capitalize">{stage.stage}</td><td className="max-w-36 break-words font-mono text-[11px]">{stage.model}</td>
    <td className="font-mono text-[11px]">{formatTokens(stage)}</td><td className="whitespace-nowrap">{formatCost(stage.costUsd)}</td>
    <td className="whitespace-nowrap">{formatTime(stage.latencyMs)}</td><td>{verification}</td><td className="break-words font-mono text-[11px]">{promptLabel(stage.promptHash)}</td>
  </tr>;
}

/** Makes the rewritten question, measured stage costs, and verification result inspectable. */
export function TraceTable({ view }: { view: AnswerView }) {
  const verification = verifySummary(view.verifyReport, citedCount(view.answer));
  return <section aria-label="Answer trace" className="space-y-3 rounded-xl border border-[#E6E6E2] bg-[#FBFBFA] p-4 text-xs text-[#1C1C1A]">
    <p><span className="text-[#6B6B66]">Rewritten question </span><span>{view.standaloneQuestion}</span></p>
    <div className="overflow-x-auto"><table aria-label="How this answer was produced" className="w-full table-fixed border-collapse text-left text-[11px] leading-4">
      <colgroup><col className="w-[8%]" /><col className="w-[21%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[9%]" /><col className="w-[23%]" /><col className="w-[17%]" /></colgroup>
      <thead className="border-b border-[#E6E6E2] text-[#6B6B66]"><tr>{["Stage", "Model", "Tokens", "Cost", "Time", "Verify", "Prompt"].map((label) => <th key={label} className="px-1.5 pb-1 font-medium first:pl-0">{label}</th>)}</tr></thead>
      <tbody>{view.trace.stages.map((stage, index) => <StageRow key={`${stage.stage}-${index}`} stage={stage} verification={index === view.trace.stages.length - 1 ? verification : "—"} />)}</tbody>
    </table></div>
  </section>;
}
