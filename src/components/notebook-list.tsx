import Link from "next/link";

import { Highlighted } from "@/components/highlighted";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { firstBar } from "@/lib/bars";
import { formatWrittenAt } from "@/lib/date";
import type { NotebookEntry } from "@/lib/db/queries";

function barLabel(count: number): string {
  return count === 1 ? "1 bar" : `${count} bars`;
}

function Entry({ entry, query }: { entry: NotebookEntry; query: string | null }) {
  // A loose verse is named by its opening bar. One that has been emptied out
  // still has to be reachable - it is a row someone can delete - so it keeps a
  // place in the list under a stand-in name rather than quietly disappearing.
  const opening = firstBar(entry.opening);
  const excerpt = entry.excerpt?.trim();

  return (
    <Link
      href={`/notebook/${entry.id}`}
      className="focus-visible:ring-ring/50 block rounded-xl outline-none focus-visible:ring-[3px]"
    >
      <Card className="hover:border-ring transition-colors">
        <CardHeader className="flex flex-col gap-1">
          <CardTitle className="text-base font-normal">
            {opening ? (
              <Highlighted text={opening} query={query} />
            ) : (
              <span className="text-muted-foreground italic">Empty verse</span>
            )}
          </CardTitle>
          <p className="text-muted-foreground font-mono text-xs">
            {barLabel(entry.barCount)} - {formatWrittenAt(entry.updatedAt)}
          </p>
        </CardHeader>
        {/* The opening bar is already the title; repeating it under itself
            says nothing. A search hit deeper in the verse does. */}
        {excerpt && excerpt !== opening ? (
          <CardContent>
            <p className="text-muted-foreground line-clamp-2 font-mono text-xs leading-relaxed whitespace-pre-line">
              <Highlighted text={excerpt} query={query} />
            </p>
          </CardContent>
        ) : null}
      </Card>
    </Link>
  );
}

export function NotebookList({
  entries,
  query = null,
}: {
  entries: NotebookEntry[];
  query?: string | null;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {query
          ? `Nothing in your notebook matches "${query}".`
          : "Nothing jotted yet. Start a verse whenever one shows up."}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Entry entry={entry} query={query} />
        </li>
      ))}
    </ul>
  );
}
