import { Badge } from "@/components/ui/badge";

export function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) {
    return <Badge variant="outline">No streak yet</Badge>;
  }

  return <Badge>{streak === 1 ? "1 day streak" : `${streak} day streak`}</Badge>;
}
