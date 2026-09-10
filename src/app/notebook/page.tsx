import Link from "next/link";

import { NotebookList } from "@/components/notebook-list";
import { SearchField } from "@/components/search-field";
import { SetupNotice } from "@/components/setup-notice";
import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/auth";
import { listNotebook, type NotebookEntry } from "@/lib/db/queries";
import { privatePageMetadata } from "@/lib/metadata";
import { normalizeSearchQuery } from "@/lib/search";

// Reads a person's own writing on every request, like every other page here.
export const dynamic = "force-dynamic";

export const metadata = privatePageMetadata("Notebook");

export default async function NotebookPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const query = normalizeSearchQuery(Array.isArray(q) ? q[0] : q);

  let entries: NotebookEntry[];
  try {
    entries = await listNotebook(await requireUserId(), query);
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-mono text-lg font-semibold">Notebook</h1>
        <Button asChild size="sm">
          <Link href="/notebook/new">New verse</Link>
        </Button>
      </div>

      <p className="text-muted-foreground text-sm">
        Bars with no prompt behind them. Nothing to finish, nothing counted
        toward a streak - just somewhere to put a verse.
      </p>

      <SearchField
        path="/notebook"
        query={query ?? ""}
        placeholder="Search your notebook"
      />

      <NotebookList entries={entries} query={query} />
    </main>
  );
}
