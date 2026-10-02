// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

describe("shadcn ui primitives", () => {
  afterEach(cleanup);

  it("renders a button with its label", () => {
    render(<Button>Send</Button>);
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("renders a badge with its text", () => {
    render(<Badge>Grounded</Badge>);
    expect(screen.getByText("Grounded")).toBeInTheDocument();
  });
});
