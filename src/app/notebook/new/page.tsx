import Link from "next/link";

import { NotebookPad } from "@/components/notebook-pad";
import { SetupNotice } from "@/components/setup-notice";
import { requireUserId } from "@/lib/auth";
import { privatePageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata = privatePageMetadata("New notebook verse");

// Nothing is read or written here yet - the first autosave creates the row and
// swaps this URL for the verse's own. The auth check still runs, so a page that
// is about to write reaches the writer, not a stranger.
export default async function NewNotebookVersePage() {
  try {
    await requireUserId();
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <Link
        href="/notebook"
        className="text-muted-foreground hover:text-foreground w-fit font-mono text-xs"
      >
        &larr; Notebook
      </Link>

      <NotebookPad id={null} initialBody="" />
    </main>
  );
}
