import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { NotebookPad } from "@/components/notebook-pad";
import { SetupNotice } from "@/components/setup-notice";
import { requireUserId } from "@/lib/auth";
import { formatWrittenAt } from "@/lib/date";
import { getNotebookVerse } from "@/lib/db/queries";
import type { Verse } from "@/lib/db/schema";
import { privatePageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = privatePageMetadata("Notebook verse");

export default async function NotebookVersePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  let verse: Verse | undefined;
  try {
    verse = await getNotebookVerse(id, await requireUserId());
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  // Outside the try: notFound() signals by throwing, and the catch above would
  // otherwise turn a missing verse into a setup notice. A verse belonging to
  // someone else lands here too - getNotebookVerse() matches on the reader.
  if (!verse) notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-baseline justify-between gap-4">
        <Link
          href="/notebook"
          className="text-muted-foreground hover:text-foreground w-fit font-mono text-xs"
        >
          &larr; Notebook
        </Link>
        <span className="text-muted-foreground font-mono text-xs">
          {formatWrittenAt(verse.createdAt)}
        </span>
      </div>

      <NotebookPad id={verse.id} initialBody={verse.body} />
    </main>
  );
}
