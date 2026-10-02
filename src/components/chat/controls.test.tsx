// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Composer, ErrorCard, FollowUps, LoadingCard } from "./index";

afterEach(cleanup);

describe("turn controls", () => {
  it("retries an error and routes a problem report", () => {
    const onRetry = vi.fn();
    const onReport = vi.fn();
    render(<ErrorCard error={{ kind: "timeout", message: "The model provider did not respond in time." }} onRetry={onRetry} onReport={onReport} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onReport).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("Your question is kept.");
  });
  it("marks the active loading stage and completed selection count", () => {
    render(<LoadingCard stage="answer" selectedCount={4} />);
    expect(screen.getByText("Writing the answer…").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Selected 4 relevant events").closest("li")).toHaveAttribute("data-state", "done");
    expect(screen.getByText("Verifying citations").closest("li")).toHaveAttribute("data-state", "pending");
  });
  it("does not invent a selection count while waiting", () => {
    render(<LoadingCard stage="select" />);
    expect(screen.getByRole("status")).toHaveTextContent("Selecting relevant events…");
    expect(screen.queryByText(/Selected \d/)).toBeNull();
  });
  it("passes a picked follow-up to its caller", () => {
    const onPick = vi.fn();
    render(<FollowUps questions={["What next?"]} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "What next?" }));
    expect(onPick).toHaveBeenCalledWith("What next?");
  });
});

describe("composer", () => {
  it("sends trimmed text with Enter and clears the field", () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const input = screen.getByRole("textbox", { name: "Your question" });
    fireEvent.change(input, { target: { value: "  What next?  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("What next?");
    expect(input).toHaveValue("");
  });
  it("sends with the button and allows Shift+Enter or composition", () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "A question" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("A question");
  });
  it("never sends whitespace or while disabled", () => {
    const onSend = vi.fn();
    const { rerender } = render(<Composer onSend={onSend} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  " } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Question" } });
    rerender(<Composer onSend={onSend} disabled />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });
  it("sends a suggested question and disables suggestions while waiting", () => {
    const onSend = vi.fn();
    const { rerender } = render(<Composer onSend={onSend} suggestions={["Cost exposure?"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Cost exposure?" }));
    expect(onSend).toHaveBeenCalledWith("Cost exposure?");
    rerender(<Composer onSend={onSend} suggestions={["Cost exposure?"]} disabled />);
    expect(screen.getByRole("button", { name: "Cost exposure?" })).toBeDisabled();
  });
});
