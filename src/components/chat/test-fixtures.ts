import type { CompanyProfile } from "@/domain/company";
import type { Event } from "@/domain/event";
import type { AnswerView } from "./types";

export const events: Event[] = [
  { event_id: "evt_006", event_date: "2026-09-26", title: "Export licensing for semiconductor chemicals", summary: "Licensing introduced for two advanced semiconductor chemicals.", region: "Global", domain: "Trade", source_name: "Trade monitor", source_url: "https://example.com/licensing" },
  { event_id: "evt_004", event_date: "2026-09-27", title: "Industrial power rationing during heatwave", summary: "Three countries imposed temporary power rationing.", region: "Global", domain: "Energy", source_name: "Energy monitor", source_url: "https://example.com/power" },
  { event_id: "evt_001", event_date: "2026-09-29", title: "Regional cloud outage", summary: "A cloud provider experienced a six-hour outage.", region: "Global", domain: "Technology", source_name: "Cloud monitor", source_url: "https://example.com/cloud" },
];

export const company: CompanyProfile = {
  company_name: "Asteron Systems", company_type: "Multinational", business: "Industrial technology",
  primary_markets: "Global", manufacturing_footprint: "Plants in Poland and Malaysia; contract manufacturing in Vietnam.",
  revenue_mix: "65% hardware · 25% software · 10% aftermarket", strategic_priorities: "Operational resilience",
  critical_dependencies: "Advanced semiconductors, cloud, ocean freight, industrial power, skilled workforce.",
  key_exposures: "Supply and energy costs", risk_posture: "Low tolerance for operational interruption",
  decision_horizon: "6–24 months", chat_user: "Strategy manager",
};

export const view: AnswerView = {
  turnId: "turn-1", status: "ok", standaloneQuestion: "Which developments could affect Asteron's cost base?",
  answer: {
    summary: "Licensing and power rationing could affect our cost base.", evidence_level: "strong", missing_info: "",
    facts: [
      { claim: "Licensing covers two semiconductor chemicals.", sources: [{ type: "event", id: "evt_006" }] },
      { claim: "Three countries imposed temporary industrial power rationing.", sources: [{ type: "event", id: "evt_004" }] },
      { claim: "The cloud outage lasted six hours.", sources: [{ type: "event", id: "evt_001" }] },
    ],
    analysis: [
      { claim: "Licensing could raise input costs for our hardware business.", sources: [{ type: "event", id: "evt_006" }, { type: "company_profile", field: "revenue_mix" }] },
      { claim: "Rationing could increase plant energy costs if it spreads to our locations.", sources: [{ type: "event", id: "evt_004" }] },
    ],
    follow_ups: ["Which suppliers are most exposed?", "How would energy costs change our margins?"],
  },
  evidence: { cited: [{ event: events[0], reason: "Semiconductors are a critical dependency." }, { event: events[1], reason: "Energy affects plant uptime." }, { event: events[2], reason: "Cloud supports operations." }], considered: [] },
  verifyReport: { removed_citations: [], demoted_claims: [], evidence_level_changed: null },
  trace: { id: "trace-1", status: "ok", stages: [
    { stage: "select", model: "google/gemini-2.5-flash", inputTokens: 1842, outputTokens: 96, costUsd: 0.0006, latencyMs: 1900, promptHash: "select v1 · 3f9c1234", source: "replay" },
    { stage: "answer", model: "google/gemini-2.5-pro", inputTokens: 2310, outputTokens: 412, costUsd: 0.0035, latencyMs: 4900, promptHash: "answer v1 · b71e1234", source: "replay" },
  ], totals: { costUsd: 0.0041, latencyMs: 6800, inputTokens: 4152, outputTokens: 508 } },
};
