import { BAR_TARGET } from "@/lib/bars";
import { cn } from "@/lib/utils";

const SEGMENTS = Array.from({ length: BAR_TARGET }, (_, i) => i);

export function BarMeter({ barCount }: { barCount: number }) {
  const filled = Math.min(barCount, BAR_TARGET);

  return (
    <div
      className="grid w-fit grid-cols-4 gap-1.5"
      role="img"
      aria-label={`${filled} of ${BAR_TARGET} bars written`}
    >
      {SEGMENTS.map((i) => (
        <div
          key={i}
          data-testid="bar-segment"
          data-filled={i < filled}
          className={cn(
            "h-2 w-4 rounded-sm",
            i < filled ? "bg-primary" : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}
