/*
 * What a streak is worth looking at for. A number alone says nothing about
 * whether four days is a lot; a named tier does, and it gives the next
 * morning something to aim at.
 *
 * The colours run in the order a real flame gets hotter - red, orange,
 * amber, yellow, white, blue - so the palette is a scale rather than six
 * arbitrary brand colours, and the thresholds sit where a writing habit
 * actually turns a corner: a couple of days, a week, a fortnight, a month,
 * a hundred.
 */

export interface StreakTier {
  readonly id: string;
  readonly name: string;
  /** First day of the streak that lands in this tier. */
  readonly minDays: number;
  /** Last day of it, inclusive. Null on the open-ended top tier. */
  readonly maxDays: number | null;
  /** Stacks up as the streak does, so the tier reads at a glance. */
  readonly flame: string;
  readonly blurb: string;
  /** Tailwind classes, kept whole so the scanner can see them. */
  readonly text: string;
  readonly surface: string;
}

export const STREAK_TIERS: readonly StreakTier[] = [
  {
    id: "spark",
    name: "Spark",
    minDays: 1,
    maxDays: 2,
    flame: "🔥",
    blurb: "Lit. Nothing keeping it lit yet.",
    text: "text-red-400",
    surface: "border-red-500/30 bg-red-500/10",
  },
  {
    id: "ember",
    name: "Ember",
    minDays: 3,
    maxDays: 6,
    flame: "🔥",
    blurb: "Three mornings in. It has started to hold.",
    text: "text-orange-400",
    surface: "border-orange-500/30 bg-orange-500/10",
  },
  {
    id: "blaze",
    name: "Blaze",
    minDays: 7,
    maxDays: 13,
    flame: "🔥🔥",
    blurb: "A full week of verses. This is a habit now.",
    text: "text-amber-300",
    surface: "border-amber-400/30 bg-amber-400/10",
  },
  {
    id: "inferno",
    name: "Inferno",
    minDays: 14,
    maxDays: 29,
    flame: "🔥🔥",
    blurb: "Two weeks unbroken. Most people never get here.",
    text: "text-yellow-200",
    surface: "border-yellow-300/30 bg-yellow-300/10",
  },
  {
    id: "wildfire",
    name: "Wildfire",
    minDays: 30,
    maxDays: 99,
    flame: "🔥🔥🔥",
    blurb: "A month or more. White hot.",
    text: "text-white",
    surface: "border-white/30 bg-white/10",
  },
  {
    id: "blue-flame",
    name: "Blue flame",
    minDays: 100,
    maxDays: null,
    flame: "🔥🔥🔥",
    blurb: "A hundred days. The hottest part of the fire.",
    text: "text-sky-300",
    surface: "border-sky-400/30 bg-sky-400/10",
  },
];

/** The tier a streak sits in, or null for a streak of zero - no fire to tier. */
export function streakTier(streak: number): StreakTier | null {
  if (streak < 1) return null;

  // Last tier whose floor the streak has cleared: the tops are only there to
  // be printed, so the top tier staying open-ended needs no special case.
  let current: StreakTier | null = null;
  for (const tier of STREAK_TIERS) {
    if (streak >= tier.minDays) current = tier;
  }

  return current;
}

/** The tier after the current one, or null once the streak is in the last. */
export function nextStreakTier(streak: number): StreakTier | null {
  return STREAK_TIERS.find((tier) => streak < tier.minDays) ?? null;
}

/** Days left before `streak` reaches `tier`. Zero once it is there. */
export function daysToTier(streak: number, tier: StreakTier): number {
  return Math.max(0, tier.minDays - streak);
}

export function streakLabel(streak: number): string {
  if (streak === 0) return "No streak yet";
  return streak === 1 ? "1 day streak" : `${streak} day streak`;
}

/** How a tier's span is printed in the legend: "7-13 days", "100+ days". */
export function tierRangeLabel(tier: StreakTier): string {
  if (tier.maxDays === null) return `${tier.minDays}+ days`;
  if (tier.maxDays === tier.minDays) return `${tier.minDays} day`;
  return `${tier.minDays}-${tier.maxDays} days`;
}
