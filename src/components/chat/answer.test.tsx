// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AnswerFooter, AnswerMessage, EventChip, EvidenceBadge, FactList, InferenceList, ProfileChip, TraceTable, UserMessage } from "./index";
import { company, events, view } from "./test-fixtures";

afterEach(cleanup);

describe("citations and answer sections", () => {
  it("never renders an unknown or malformed event id as a chip", () => {
    const { container } = render(<><EventChip id="evt_099" events={events} /><EventChip id="not-an-id" events={events} /></>);
    expect(container).toBeEmptyDOMElement();
  });
  it("exposes a known citation and routes its selection", () => {
    const onPick = vi.fn();
    render(<EventChip id="evt_006" events={events} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "evt_006" }));
    expect(onPick).toHaveBeenCalledWith("evt_006");
    expect(screen.getByRole("button")).toHaveAttribute("title", events[0].title);
  });
  it("labels profile context separately from event evidence", () => {
    render(<ProfileChip />);
    expect(screen.getByText("company profile")).toBeVisible();
  });
  it("shows the exact distinct citation count", () => {
    render(<EvidenceBadge answer={view.answer} />);
    expect(screen.getByText("Grounded · 3 events")).toBeVisible();
  });
  it("puts factual text beneath its inference inside its Events region", () => {
    render(<InferenceList answer={view.answer} cited={view.evidence.cited} company={company} />);
    const region = screen.getByRole("region", { name: "Analytical inference" });
    const item = within(region).getAllByRole("listitem")[0];
    const eventRegion = within(item).getByRole("region", { name: "Events" });
    expect(within(eventRegion).getByText(view.answer.facts[0].claim)).toBeVisible();
    expect(within(eventRegion).queryByText(view.answer.analysis[0].claim)).toBeNull();
    expect(within(item).getByText(view.answer.analysis[0].claim).compareDocumentPosition(eventRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(eventRegion).getByText(company.revenue_mix)).toBeVisible();
  });
  it("shows unused facts in their own section", () => {
    render(<FactList answer={view.answer} company={company} events={events} />);
    const region = screen.getByRole("region", { name: "Also stated in the data" });
    expect(within(region).getByText(view.answer.facts[2].claim)).toBeVisible();
    expect(within(region).queryByText(view.answer.facts[0].claim)).toBeNull();
  });
  it("preserves every known event and profile source of a fact beneath an inference", () => {
    const fact = { claim: "Two developments affect critical inputs.", sources: [
      { type: "event" as const, id: "evt_006" }, { type: "event" as const, id: "evt_004" },
      { type: "event" as const, id: "evt_099" }, { type: "company_profile" as const, field: "critical_dependencies" as const },
    ] };
    const answer = { ...view.answer, facts: [fact], analysis: [view.answer.analysis[0]] };
    render(<AnswerMessage view={{ ...view, answer }} company={company} onEventPick={vi.fn()} />);
    const region = screen.getByRole("region", { name: "Events" });
    expect(within(region).getByText(fact.claim)).toBeVisible();
    expect(within(region).getByRole("button", { name: "evt_006" })).toBeVisible();
    expect(within(region).getByRole("button", { name: "evt_004" })).toBeVisible();
    expect(within(region).queryByRole("button", { name: "evt_099" })).toBeNull();
    expect(within(region).getByText(company.critical_dependencies)).toBeVisible();
    expect(within(region).getByText(company.revenue_mix)).toBeVisible();
    expect(screen.queryByRole("region", { name: "Also stated in the data" })).toBeNull();
  });
  it("preserves profile context on unused event-backed facts", () => {
    const fact = { ...view.answer.facts[2], sources: [...view.answer.facts[2].sources, { type: "company_profile" as const, field: "critical_dependencies" as const }] };
    render(<AnswerMessage view={{ ...view, answer: { ...view.answer, facts: [fact] } }} company={company} />);
    const region = screen.getByRole("region", { name: "Also stated in the data" });
    expect(within(region).getByText("evt_001")).toBeVisible();
    expect(within(region).getByText("company profile")).toBeVisible();
    expect(within(region).getByText(company.critical_dependencies)).toBeVisible();
  });
  it("shows the insufficient-evidence gap and amber badge", () => {
    const answer = { ...view.answer, facts: [], analysis: [], evidence_level: "none" as const, missing_info: "Monetary-policy events are needed." };
    render(<AnswerMessage view={{ ...view, answer }} company={company} />);
    const badge = screen.getByText("Insufficient evidence");
    expect(badge).toHaveAttribute("data-evidence", "none");
    expect(badge.className).toContain("#FFF3D6");
    expect(screen.getByText(/What would be needed: Monetary-policy events are needed/)).toBeVisible();
  });
  it("renders user text safely as text", () => {
    render(<UserMessage text="<script>danger</script>" />);
    expect(screen.getByText("<script>danger</script>")).toBeVisible();
  });
});

describe("answer trace", () => {
  it("lists one row per recorded stage and the rewritten question", () => {
    render(<TraceTable view={view} />);
    expect(screen.getAllByRole("row")).toHaveLength(view.trace.stages.length + 1);
    expect(screen.getByText("1,842 → 96")).toBeVisible();
    expect(screen.getByText(view.standaloneQuestion)).toBeVisible();
    expect(screen.getByText("select v1 · 3f9c")).toBeVisible();
  });
  it("reports removed references without making them citation chips", () => {
    const verifyReport = { ...view.verifyReport, removed_citations: [{ id: "evt_099", reason: "unknown" as const, claim: "Unsupported" }] };
    render(<TraceTable view={{ ...view, verifyReport }} />);
    expect(screen.getByText(/evt_099 unknown/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "evt_099" })).toBeNull();
  });
  it("keeps the trace collapsed until requested and routes reports", () => {
    const onReport = vi.fn();
    render(<AnswerFooter view={view} onReport={onReport} />);
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /How this answer was produced/ }));
    expect(screen.getByRole("table")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    expect(onReport).toHaveBeenCalledWith(view.turnId);
  });
});
