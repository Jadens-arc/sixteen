import { cn } from "@/lib/utils";
import {
  STREAK_TIERS,
  daysToTier,
  nextStreakTier,
  streakLabel,
  streakTier,
  tierRangeLabel,
  type StreakTier,
} from "@/lib/streak";

// What the streak is worth writing today: the next tier, or the fact that
// there isn't one left to reach.
function progressLine(streak: number): string {
  const next = nextStreakTier(streak);
  if (!next) return "Hottest the flame goes. Keep it there.";

  const days = daysToTier(streak, next);
  const dayWord = days === 1 ? "day" : "days";
  return `${days} more ${dayWord} to ${next.name}`;
}

function TierRow({
  tier,
  current,
}: {
  tier: StreakTier;
  current: boolean;
}) {
  return (
    <li
      data-testid="streak-tier"
      data-current={current}
      aria-current={current ? "true" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md border border-transparent px-2 py-1.5",
        current && tier.surface,
      )}
    >
      <span aria-hidden className="w-14 shrink-0 text-sm whitespace-nowrap">
        {tier.flame}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cn("text-sm font-medium", tier.text)}>
          {tier.name}
          {current ? (
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              you are here
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground text-xs">{tier.blurb}</span>
      </span>
      <span className="text-muted-foreground ml-auto shrink-0 font-mono text-xs">
        {tierRangeLabel(tier)}
      </span>
    </li>
  );
}

/**
 * The streak, big enough to be the first thing a returning writer sees, and
 * openable for what the tiers actually are.
 *
 * A native <details> rather than state: this stays a server component, the
 * legend is in the page for find-in-page and a screen reader whether it is
 * open or not, and clicking or hitting enter on it already works.
 */
export function StreakFlame({ streak }: { streak: number }) {
  const tier = streakTier(streak);

  return (
    <details className="group" data-testid="streak-flame">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-4 rounded-lg border px-4 py-3 transition-colors [&::-webkit-details-marker]:hidden",
          tier ? tier.surface : "bg-muted/40",
        )}
      >
        <span
          aria-hidden
          data-testid="streak-flame-emoji"
          className={cn(
            "text-xl leading-none whitespace-nowrap",
            tier ? null : "opacity-40 grayscale",
          )}
        >
          {tier?.flame ?? "🔥"}
        </span>

        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            className={cn(
              "font-mono text-base leading-none font-semibold",
              tier ? tier.text : "text-muted-foreground",
            )}
          >
            {streakLabel(streak)}
          </span>
          <span className="text-muted-foreground text-xs">
            {tier
              ? `${tier.name} - ${progressLine(streak)}`
              : "Finish today's sixteen to light it."}
          </span>
        </span>

        <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1 text-xs">
          <span className="hidden sm:inline">Tiers</span>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5 transition-transform group-open:rotate-90"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      </summary>

      <div className="flex flex-col gap-2 px-1 pt-3">
        <p className="text-muted-foreground text-xs">
          One completed verse a day keeps the streak. The flame burns the way a
          real one does - red, orange, amber, yellow, white, then blue at its
          hottest.
        </p>
        <ul className="flex flex-col gap-0.5">
          {STREAK_TIERS.map((row) => (
            <TierRow key={row.id} tier={row} current={row.id === tier?.id} />
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          Miss a day and it resets - but every past prompt stays in your
          archive, and writing one late never costs you a day you already
          earned.
        </p>
      </div>
    </details>
  );
}
