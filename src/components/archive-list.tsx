"use client";

import Link from "next/link";

import { BarMeter } from "@/components/bar-meter";
import { Highlighted } from "@/components/highlighted";
import { VaultUnlock } from "@/components/vault-unlock";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BAR_TARGET } from "@/lib/bars";
import { useVault } from "@/lib/crypto/vault-context";
import { formatPromptDate } from "@/lib/date";
import type { ArchiveEntry } from "@/lib/db/queries";
import { ARCHIVE_LIMIT } from "@/lib/list-limits";
import { excerptAround, matchesQuery } from "@/lib/search";
import { useSealedRows } from "@/lib/use-sealed-rows";
import type { DailyPrompt } from "@/lib/db/schema";

interface Row {
  prompt: DailyPrompt;
  barCount: number;
  completedAt: Date | null;
  excerpt: string;
  started: boolean;
}

function VerseStatus({ row }: { row: Row }) {
  if (!row.started || row.barCount === 0) {
    return <Badge variant="outline">Not started</Badge>;
  }
  if (row.completedAt) {
    return <Badge>Done</Badge>;
  }
  return (
    <Badge variant="secondary" className="font-mono">
      {row.barCount} / {BAR_TARGET}
    </Badge>
  );
}

function Entry({ row, query }: { row: Row; query: string | null }) {
  const excerpt = row.excerpt.trim();

  return (
    <Link
      href={`/archive/${row.prompt.promptDate}`}
      className="focus-visible:ring-ring/50 block rounded-xl outline-none focus-visible:ring-[3px]"
    >
      <Card className="hover:border-ring transition-colors">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base font-normal">
              <Highlighted text={row.prompt.concept} query={query} />
            </CardTitle>
            <p className="text-muted-foreground font-mono text-xs">
              {formatPromptDate(row.prompt.promptDate)}
            </p>
          </div>
          <VerseStatus row={row} />
        </CardHeader>
        {row.started && row.barCount > 0 ? (
          <CardContent className="flex flex-col gap-3">
            <BarMeter barCount={row.barCount} />
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

function countLabel(count: number): string {
  return count === 1 ? "1 match" : `${count} matches`;
}

export function ArchiveList({
  entries,
  query = null,
}: {
  entries: ArchiveEntry[];
  query?: string | null;
}) {
  const { phase } = useVault();

  // A sealed verse is matched and excerpted here, where the key is. An
  // unsealed one arrives already matched and already cut down - the server
  // did that work and kept the body.
  const { rows, pending, error } = useSealedRows<ArchiveEntry, Row>(entries, {
    sealedBodyOf: (entry) => (entry.verse?.sealed ? entry.verse.body : null),
    resolve: (entry, body) => {
      const base = { prompt: entry.prompt, started: entry.verse !== null };

      if (!entry.verse) {
        return { ...base, barCount: 0, completedAt: null, excerpt: "" };
      }

      const { barCount, completedAt } = entry.verse;

      if (body === null) {
        return {
          ...base,
          barCount,
          completedAt,
          excerpt: entry.verse.sealed ? "" : entry.verse.excerpt,
        };
      }

      const matched =
        !query ||
        matchesQuery(entry.prompt.concept, query) ||
        matchesQuery(entry.prompt.scenario, query) ||
        matchesQuery(body, query);
      if (!matched) return null;

      return { ...base, barCount, completedAt, excerpt: excerptAround(body, query) };
    },
  });

  if (error) return <p className="text-destructive text-sm">{error}</p>;

  if (phase === "locked" && entries.some((entry) => entry.verse?.sealed)) {
    return <VaultUnlock />;
  }

  if (pending) {
    return <p className="text-muted-foreground text-sm">Opening your archive...</p>;
  }

  // The server could not cap a list it had not finished searching, so the cap
  // lands here, on the rows that actually matched.
  const shown = rows.slice(0, ARCHIVE_LIMIT);

  if (shown.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {query
          ? `Nothing in the archive matches "${query}".`
          : "No prompts yet. Check back tomorrow."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Counted here rather than on the page: when verses are sealed, the
          server sends every one of them and has no idea how many matched. */}
      {query ? (
        <p className="text-muted-foreground text-xs">
          {countLabel(shown.length)} for &ldquo;{query}&rdquo; - searching concepts,
          scenarios and your verses.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {shown.map((row) => (
          <li key={row.prompt.id}>
            <Entry row={row} query={query} />
          </li>
        ))}
      </ul>
    </div>
  );
}
