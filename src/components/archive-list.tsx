import { BarMeter } from "@/components/bar-meter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BAR_TARGET } from "@/lib/bars";
import { formatPromptDate } from "@/lib/date";
import type { ArchiveEntry } from "@/lib/db/queries";

function VerseStatus({ entry }: { entry: ArchiveEntry }) {
  if (!entry.verse || entry.verse.barCount === 0) {
    return <Badge variant="outline">Not started</Badge>;
  }
  if (entry.verse.completedAt) {
    return <Badge>Done</Badge>;
  }
  return (
    <Badge variant="secondary" className="font-mono">
      {entry.verse.barCount} / {BAR_TARGET}
    </Badge>
  );
}

export function ArchiveList({ entries }: { entries: ArchiveEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No prompts yet. Check back tomorrow.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.prompt.id}>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base font-normal">
                  {entry.prompt.concept}
                </CardTitle>
                <p className="text-muted-foreground font-mono text-xs">
                  {formatPromptDate(entry.prompt.promptDate)}
                </p>
              </div>
              <VerseStatus entry={entry} />
            </CardHeader>
            {entry.verse && entry.verse.barCount > 0 ? (
              <CardContent>
                <BarMeter barCount={entry.verse.barCount} />
              </CardContent>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
