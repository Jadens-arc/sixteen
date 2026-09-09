import { PromptCard } from "@/components/prompt-card";
import { SetupNotice } from "@/components/setup-notice";
import { SignedOutPad } from "@/components/signed-out-pad";
import { VersePad } from "@/components/verse-pad";
import { getUserId } from "@/lib/auth";
import { getOrCreateTodayPrompt, getVerseForPrompt } from "@/lib/db/queries";
import type { DailyPrompt, Verse } from "@/lib/db/schema";

// This page hits the database on every request, so it can never be part of
// static generation - a build with no DATABASE_URL set (the state of a
// first Vercel deploy) would otherwise fail.
export const dynamic = "force-dynamic";

interface Today {
  prompt: DailyPrompt;
  verse: Verse | undefined;
  signedIn: boolean;
}

// The prompt is the same for everyone and is what the page is for, so it
// loads either way. Only the verse needs an account - there's nobody to look
// one up for otherwise.
async function loadToday(): Promise<Today> {
  const userId = await getUserId();
  const prompt = await getOrCreateTodayPrompt();
  const verse = userId ? await getVerseForPrompt(prompt.id, userId) : undefined;
  return { prompt, verse, signedIn: Boolean(userId) };
}

export default async function TodayPage() {
  let today: Today;
  try {
    today = await loadToday();
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  const { prompt, verse, signedIn } = today;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <PromptCard prompt={prompt} />
      {signedIn ? (
        <VersePad
          promptId={prompt.id}
          initialBody={verse?.body ?? ""}
          initialCompletedAt={verse?.completedAt?.toISOString() ?? null}
        />
      ) : (
        <SignedOutPad />
      )}
    </main>
  );
}
