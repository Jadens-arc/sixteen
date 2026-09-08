import { ArchiveList } from "@/components/archive-list";
import { SetupNotice } from "@/components/setup-notice";
import { StreakBadge } from "@/components/streak-badge";
import { requireUserId } from "@/lib/auth";
import { getStreak, listArchive, type ArchiveEntry } from "@/lib/db/queries";

// Same reasoning as the Today page: this reads from the database on every
// request and must never be prerendered at build time.
export const dynamic = "force-dynamic";

async function loadArchive(): Promise<{ entries: ArchiveEntry[]; streak: number }> {
  const userId = await requireUserId();
  const [entries, streak] = await Promise.all([
    listArchive(userId),
    getStreak(userId),
  ]);
  return { entries, streak };
}

export default async function ArchivePage() {
  let archive: { entries: ArchiveEntry[]; streak: number };
  try {
    archive = await loadArchive();
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-semibold">Archive</h1>
        <StreakBadge streak={archive.streak} />
      </div>
      <ArchiveList entries={archive.entries} />
    </main>
  );
}
