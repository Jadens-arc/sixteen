"use client";

import Link from "next/link";

import { Highlighted } from "@/components/highlighted";
import { VaultUnlock } from "@/components/vault-unlock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { firstBar } from "@/lib/bars";
import { useVault } from "@/lib/crypto/vault-context";
import { formatWrittenAt } from "@/lib/date";
import type { NotebookEntry } from "@/lib/db/queries";
import { NOTEBOOK_LIMIT } from "@/lib/list-limits";
import { excerptAround, matchesQuery } from "@/lib/search";
import { useSealedRows } from "@/lib/use-sealed-rows";

const OPENING_LENGTH = 160;

interface Row {
  id: string;
  barCount: number;
  updatedAt: Date;
  opening: string;
  excerpt: string;
}

function barLabel(count: number): string {
  return count === 1 ? "1 bar" : `${count} bars`;
}

function Entry({ row, query }: { row: Row; query: string | null }) {
  // A loose verse is named by its opening bar. One that has been emptied out
  // still has to be reachable - it is a row someone can delete - so it keeps a
  // place in the list under a stand-in name rather than quietly disappearing.
  const opening = firstBar(row.opening);
  const excerpt = row.excerpt.trim();

  return (
    <Link
      href={`/notebook/${row.id}`}
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
            {barLabel(row.barCount)} - {formatWrittenAt(row.updatedAt)}
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
  const { phase } = useVault();

  const { rows, pending, error } = useSealedRows<NotebookEntry, Row>(entries, {
    sealedBodyOf: (entry) => (entry.sealed ? entry.body : null),
    resolve: (entry, body) => {
      const base = { id: entry.id, barCount: entry.barCount, updatedAt: entry.updatedAt };

      if (body === null) {
        if (entry.sealed) return { ...base, opening: "", excerpt: "" };
        return { ...base, opening: entry.opening, excerpt: entry.excerpt };
      }

      // Sealed, and now open. The search the server could not run runs here.
      if (query && !matchesQuery(body, query)) return null;

      return {
        ...base,
        opening: body.slice(0, OPENING_LENGTH),
        excerpt: excerptAround(body, query),
      };
    },
  });

  if (error) return <p className="text-destructive text-sm">{error}</p>;

  if (phase === "locked" && entries.some((entry) => entry.sealed)) {
    return <VaultUnlock />;
  }

  if (pending) {
    return <p className="text-muted-foreground text-sm">Opening your notebook...</p>;
  }

  // As in the archive: the server cannot cap what it has not searched.
  const shown = rows.slice(0, NOTEBOOK_LIMIT);

  if (shown.length === 0) {
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
      {shown.map((row) => (
        <li key={row.id}>
          <Entry row={row} query={query} />
        </li>
      ))}
    </ul>
  );
}
