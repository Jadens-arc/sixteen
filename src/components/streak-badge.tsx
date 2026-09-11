import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { streakLabel, streakTier } from "@/lib/streak";

// The compact form of the flame on the home page: same tier, same colour,
// next to a page heading that already has its own job.
export function StreakBadge({ streak }: { streak: number }) {
  const tier = streakTier(streak);

  if (!tier) {
    return <Badge variant="outline">{streakLabel(0)}</Badge>;
  }

  return (
    <Badge
      variant="outline"
      title={`${tier.name} tier`}
      className={cn("gap-1.5", tier.surface, tier.text)}
    >
      <span aria-hidden>{tier.flame}</span>
      {streakLabel(streak)}
    </Badge>
  );
}
