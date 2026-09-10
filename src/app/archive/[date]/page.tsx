import Link from "next/link";
import { notFound } from "next/navigation";

import { PromptCard } from "@/components/prompt-card";
import { SetupNotice } from "@/components/setup-notice";
import { VersePad } from "@/components/verse-pad";
import { requireUserId } from "@/lib/auth";
import { isPromptDate } from "@/lib/date";
import { getArchiveDetail, type ArchiveDetail } from "@/lib/db/queries";

// Reads a verse per request, like every other page that touches the database.
export const dynamic = "force-dynamic";

export default async function ArchiveEntryPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isPromptDate(date)) notFound();

  let detail: ArchiveDetail | null;
  try {
    const userId = await requireUserId();
    detail = await getArchiveDetail(date, userId);
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  // Outside the try: notFound() signals by throwing, and the catch above would
  // otherwise turn a missing date into a setup notice.
  if (!detail) notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <Link
        href="/archive"
        className="text-muted-foreground hover:text-foreground w-fit font-mono text-xs"
      >
        &larr; Archive
      </Link>

      <PromptCard prompt={detail.prompt} />

      {/* The same pad the day itself had. A verse written weeks ago is still
          editable here - autosave leaves an existing completion alone, so
          fixing a bar never costs the day it earned. */}
      <VersePad
        promptId={detail.prompt.id}
        initialBody={detail.verse?.body ?? ""}
        initialCompletedAt={detail.verse?.completedAt?.toISOString() ?? null}
      />
    </main>
  );
}
