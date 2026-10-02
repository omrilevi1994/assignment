// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ChatLayout, EvidencePanel, Sidebar } from "./index";
import { company, events, view } from "./test-fixtures";

afterEach(cleanup);

describe("chat frame", () => {
  it("lists cited evidence first, then considered events with a reason and source", () => {
    render(<EvidencePanel evidence={{ cited: view.evidence.cited.slice(0, 2), considered: [view.evidence.cited[2]] }} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining(events[0].title), expect.stringContaining(events[1].title), expect.stringContaining(events[2].title)]);
    expect(within(rows[0]).getByText(/Semiconductors are a critical dependency/)).toBeVisible();
    expect(within(rows[0]).getByText(events[0].source_name)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Considered, not cited" })).toBeVisible();
  });
  it("distinguishes no selected answer from insufficient evidence", () => {
    const { rerender } = render(<EvidencePanel />);
    expect(screen.getByText("Nothing cited yet")).toBeVisible();
    rerender(<EvidencePanel evidence={{ cited: [], considered: [] }} />);
    expect(screen.getByText("Nothing cited by the selected answer")).toBeVisible();
  });
  it("routes conversation selection and new conversation", () => {
    const onSelect = vi.fn();
    const onNew = vi.fn();
    render(<Sidebar company={company} conversations={[{ id: "one", title: "Cost base exposure" }]} selectedId="one" onSelect={onSelect} onNew={onNew} />);
    fireEvent.click(screen.getByRole("button", { name: "Cost base exposure" }));
    fireEvent.click(screen.getByRole("button", { name: "+ New conversation" }));
    expect(onSelect).toHaveBeenCalledWith("one");
    expect(onNew).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Cost base exposure" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Context for analysis, not evidence.")).toBeVisible();
  });
  it("provides the three laptop columns and a separate composer slot", () => {
    render(<ChatLayout sidebar={<span>Conversation list</span>} evidence={<span>Evidence panel</span>} composer={<span>Question entry</span>}><p>Chat messages</p></ChatLayout>);
    expect(screen.getByRole("main")).toHaveTextContent("Chat messages");
    expect(screen.getByRole("main")).toHaveTextContent("Question entry");
    expect(screen.getByText("Conversation list")).toBeVisible();
    expect(screen.getByText("Evidence panel")).toBeVisible();
  });
});
