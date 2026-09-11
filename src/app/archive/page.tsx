import { ArchiveList } from "@/components/archive-list";
import { SearchField } from "@/components/search-field";
import { SetupNotice } from "@/components/setup-notice";
import { StreakBadge } from "@/components/streak-badge";
import { requireUserId } from "@/lib/auth";
import { getStreak, listArchive, type ArchiveEntry } from "@/lib/db/queries";
import { privatePageMetadata } from "@/lib/metadata";
import { normalizeSearchQuery } from "@/lib/search";

// Same reasoning as the Today page: this reads from the database on every
// request and must never be prerendered at build time.
export const dynamic = "force-dynamic";

export const metadata = privatePageMetadata("Archive");

async function loadArchive(
  query: string | null,
): Promise<{ entries: ArchiveEntry[]; streak: number }> {
  const userId = await requireUserId();
  const [entries, streak] = await Promise.all([
    listArchive(userId, query),
    getStreak(userId),
  ]);
  return { entries, streak };
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  // Next hands a repeated ?q= back as an array; one search box means one query.
  const { q } = await searchParams;
  const query = normalizeSearchQuery(Array.isArray(q) ? q[0] : q);

  let archive: { entries: ArchiveEntry[]; streak: number };
  try {
    archive = await loadArchive(query);
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-semibold">Archive</h1>
        <StreakBadge streak={archive.streak} />
      </div>

      <div className="flex flex-col gap-2">
        <SearchField
          path="/archive"
          query={query ?? ""}
          placeholder="Search your verses and prompts"
        />
      </div>

      <ArchiveList entries={archive.entries} query={query} />
    </main>
  );
}
