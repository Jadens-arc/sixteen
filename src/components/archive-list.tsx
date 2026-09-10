import Link from "next/link";

import { BarMeter } from "@/components/bar-meter";
import { Highlighted } from "@/components/highlighted";
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

function Entry({ entry, query }: { entry: ArchiveEntry; query: string | null }) {
  const excerpt = entry.excerpt?.trim();

  return (
    <Link
      href={`/archive/${entry.prompt.promptDate}`}
      className="focus-visible:ring-ring/50 block rounded-xl outline-none focus-visible:ring-[3px]"
    >
      <Card className="hover:border-ring transition-colors">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base font-normal">
              <Highlighted text={entry.prompt.concept} query={query} />
            </CardTitle>
            <p className="text-muted-foreground font-mono text-xs">
              {formatPromptDate(entry.prompt.promptDate)}
            </p>
          </div>
          <VerseStatus entry={entry} />
        </CardHeader>
        {entry.verse && entry.verse.barCount > 0 ? (
          <CardContent className="flex flex-col gap-3">
            <BarMeter barCount={entry.verse.barCount} />
            {excerpt ? (
              <p className="text-muted-foreground line-clamp-2 font-mono text-xs leading-relaxed whitespace-pre-line">
                <Highlighted text={excerpt} query={query} />
              </p>
            ) : null}
          </CardContent>
        ) : null}
      </Card>
    </Link>
  );
}

export function ArchiveList({
  entries,
  query = null,
}: {
  entries: ArchiveEntry[];
  query?: string | null;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {query
          ? `Nothing in the archive matches "${query}".`
          : "No prompts yet. Check back tomorrow."}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.prompt.id}>
          <Entry entry={entry} query={query} />
        </li>
      ))}
    </ul>
  );
}
