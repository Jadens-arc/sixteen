import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StreakBadge } from "@/components/streak-badge";
import { StreakFlame } from "@/components/streak-flame";
import { STREAK_TIERS, streakTier } from "@/lib/streak";

function currentTierRow() {
  return screen
    .getAllByTestId("streak-tier")
    .find((row) => row.dataset.current === "true");
}

describe("StreakFlame", () => {
  it("names the streak and the tier it reached", () => {
    render(<StreakFlame streak={9} />);
    expect(screen.getByText("9 day streak")).toBeInTheDocument();
    expect(screen.getByText(/Blaze - /)).toBeInTheDocument();
  });

  it("keeps a one day streak singular", () => {
    render(<StreakFlame streak={1} />);
    expect(screen.getByText("1 day streak")).toBeInTheDocument();
  });

  it("says how many days are left to the next tier", () => {
    render(<StreakFlame streak={5} />);
    expect(screen.getByText(/2 more days to Blaze/)).toBeInTheDocument();
  });

  it("says one day in the singular", () => {
    render(<StreakFlame streak={6} />);
    expect(screen.getByText(/1 more day to Blaze/)).toBeInTheDocument();
  });

  it("promises nothing further once the top tier is reached", () => {
    render(<StreakFlame streak={365} />);
    expect(screen.getByText(/Blue flame - Hottest the flame goes/)).toBeInTheDocument();
  });

  it("shows a cold flame and an invitation with no streak", () => {
    render(<StreakFlame streak={0} />);
    expect(screen.getByText("No streak yet")).toBeInTheDocument();
    expect(screen.getByTestId("streak-flame-emoji").className).toContain("grayscale");
  });

  it("carries more flames the longer the streak runs", () => {
    const { unmount } = render(<StreakFlame streak={1} />);
    const short = screen.getByTestId("streak-flame-emoji").textContent ?? "";
    unmount();

    render(<StreakFlame streak={200} />);
    const long = screen.getByTestId("streak-flame-emoji").textContent ?? "";

    expect([...long].length).toBeGreaterThan([...short].length);
  });

  it("lists every tier and its day range, closed", () => {
    const { container } = render(<StreakFlame streak={3} />);

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");

    expect(screen.getAllByTestId("streak-tier")).toHaveLength(STREAK_TIERS.length);
    for (const tier of STREAK_TIERS) {
      expect(details).toContainElement(screen.getByText(tier.name));
    }
    expect(screen.getByText("7-13 days")).toBeInTheDocument();
    expect(screen.getByText("100+ days")).toBeInTheDocument();
  });

  it("marks the tier the streak is in, and only that one", () => {
    render(<StreakFlame streak={20} />);

    const marked = screen
      .getAllByTestId("streak-tier")
      .filter((row) => row.dataset.current === "true");

    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent("Inferno");
    expect(marked[0].className).toContain(streakTier(20)!.surface.split(" ")[0]);
  });

  it("marks no tier when there is no streak", () => {
    render(<StreakFlame streak={0} />);
    expect(currentTierRow()).toBeUndefined();
  });
});

describe("StreakBadge", () => {
  it("wears the tier colour and flame", () => {
    render(<StreakBadge streak={30} />);

    const badge = screen.getByText("30 day streak");
    expect(badge.className).toContain("text-white");
    expect(badge).toHaveTextContent("🔥🔥🔥");
  });

  it("falls back to a plain badge with no streak", () => {
    render(<StreakBadge streak={0} />);
    expect(screen.getByText("No streak yet")).toBeInTheDocument();
  });
});
