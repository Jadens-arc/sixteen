import { PromptCard } from "@/components/prompt-card";
import { SetupNotice } from "@/components/setup-notice";
import { VersePad } from "@/components/verse-pad";
import { requireUserId } from "@/lib/auth";
import { getOrCreateTodayPrompt, getVerseForPrompt } from "@/lib/db/queries";
import type { DailyPrompt, Verse } from "@/lib/db/schema";

// This page hits the database on every request, so it can never be part of
// static generation - a build with no DATABASE_URL set (the state of a
// first Vercel deploy) would otherwise fail.
export const dynamic = "force-dynamic";

async function loadToday(): Promise<{ prompt: DailyPrompt; verse: Verse | undefined }> {
  const userId = await requireUserId();
  const prompt = await getOrCreateTodayPrompt();
  const verse = await getVerseForPrompt(prompt.id, userId);
  return { prompt, verse };
}

export default async function TodayPage() {
  let today: { prompt: DailyPrompt; verse: Verse | undefined };
  try {
    today = await loadToday();
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  const { prompt, verse } = today;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <PromptCard prompt={prompt} />
      <VersePad
        promptId={prompt.id}
        initialBody={verse?.body ?? ""}
        initialCompletedAt={verse?.completedAt?.toISOString() ?? null}
      />
    </main>
  );
}
