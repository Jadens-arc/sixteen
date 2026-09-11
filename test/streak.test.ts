import { describe, expect, it } from "vitest";

import {
  STREAK_TIERS,
  daysToTier,
  nextStreakTier,
  streakLabel,
  streakTier,
  tierRangeLabel,
} from "@/lib/streak";

describe("streak tiers", () => {
  it("has no tier for a streak of zero", () => {
    expect(streakTier(0)).toBeNull();
    expect(streakTier(-1)).toBeNull();
  });

  it("lands the first day in the first tier", () => {
    expect(streakTier(1)?.id).toBe("spark");
  });

  it("puts every tier boundary in the tier it opens", () => {
    for (const tier of STREAK_TIERS) {
      expect(streakTier(tier.minDays)?.id).toBe(tier.id);
    }
  });

  it("keeps the day before a boundary in the tier below", () => {
    for (const tier of STREAK_TIERS.slice(1)) {
      expect(streakTier(tier.minDays - 1)?.id).not.toBe(tier.id);
    }
  });

  it("holds the top tier open for any streak past its floor", () => {
    const top = STREAK_TIERS[STREAK_TIERS.length - 1];
    expect(streakTier(top.minDays)?.id).toBe(top.id);
    expect(streakTier(5_000)?.id).toBe(top.id);
  });

  it("covers every day with exactly one tier", () => {
    for (const [i, tier] of STREAK_TIERS.entries()) {
      const next = STREAK_TIERS[i + 1];
      expect(tier.maxDays).toBe(next ? next.minDays - 1 : null);
    }
  });

  it("names the next tier up, and none past the last", () => {
    expect(nextStreakTier(0)?.id).toBe("spark");
    expect(nextStreakTier(1)?.id).toBe("ember");
    expect(nextStreakTier(6)?.id).toBe("blaze");
    expect(nextStreakTier(100)).toBeNull();
  });

  it("counts the days left to a tier, never below zero", () => {
    const blaze = STREAK_TIERS.find((tier) => tier.id === "blaze")!;
    expect(daysToTier(1, blaze)).toBe(6);
    expect(daysToTier(7, blaze)).toBe(0);
    expect(daysToTier(40, blaze)).toBe(0);
  });

  it("gives every tier a flame that only grows", () => {
    let previous = 0;
    for (const tier of STREAK_TIERS) {
      const flames = [...tier.flame].length;
      expect(flames).toBeGreaterThanOrEqual(previous);
      previous = flames;
    }
    expect(previous).toBeGreaterThan(1);
  });

  it("gives every tier its own colour", () => {
    const colours = new Set(STREAK_TIERS.map((tier) => tier.text));
    expect(colours.size).toBe(STREAK_TIERS.length);
  });
});

describe("streakLabel", () => {
  it("says so when there is no streak", () => {
    expect(streakLabel(0)).toBe("No streak yet");
  });

  it("keeps a one day streak singular", () => {
    expect(streakLabel(1)).toBe("1 day streak");
    expect(streakLabel(2)).toBe("2 day streak");
  });
});

describe("tierRangeLabel", () => {
  it("prints a closed range and an open one", () => {
    const blaze = STREAK_TIERS.find((tier) => tier.id === "blaze")!;
    const top = STREAK_TIERS[STREAK_TIERS.length - 1];
    expect(tierRangeLabel(blaze)).toBe("7-13 days");
    expect(tierRangeLabel(top)).toBe(`${top.minDays}+ days`);
  });

  it("keeps a one day tier singular", () => {
    expect(
      tierRangeLabel({ ...STREAK_TIERS[0], minDays: 1, maxDays: 1 }),
    ).toBe("1 day");
  });
});
