import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarMeter } from "@/components/bar-meter";
import { BAR_TARGET } from "@/lib/bars";

function filledCount() {
  return screen
    .getAllByTestId("bar-segment")
    .filter((segment) => segment.dataset.filled === "true").length;
}

describe("BarMeter", () => {
  it("renders sixteen segments", () => {
    render(<BarMeter barCount={0} />);
    expect(screen.getAllByTestId("bar-segment")).toHaveLength(BAR_TARGET);
  });

  it("fills one segment per bar written", () => {
    render(<BarMeter barCount={5} />);
    expect(filledCount()).toBe(5);
  });

  it("fills nothing for an empty verse", () => {
    render(<BarMeter barCount={0} />);
    expect(filledCount()).toBe(0);
  });

  it("never fills more segments than the bar target", () => {
    render(<BarMeter barCount={40} />);
    expect(filledCount()).toBe(BAR_TARGET);
  });
});
