import { cache } from "react";
import type { Metadata } from "next";

import { Faq, HowItWorks, SiteIntro } from "@/components/site-copy";
import { JsonLd } from "@/components/json-ld";
import { PromptCard } from "@/components/prompt-card";
import { SetupNotice } from "@/components/setup-notice";
import { SignedOutPad } from "@/components/signed-out-pad";
import { StreakFlame } from "@/components/streak-flame";
import { VersePad } from "@/components/verse-pad";
import { getUserId } from "@/lib/auth";
import { formatPromptDate } from "@/lib/date";
import {
  getOrCreateTodayPrompt,
  getStreak,
  getVerseForPrompt,
  type VerseView,
} from "@/lib/db/queries";
import type { DailyPrompt } from "@/lib/db/schema";
import { clampDescription } from "@/lib/site";
import { dailyPromptGraph, faqGraph, howToGraph } from "@/lib/structured-data";

// This page hits the database on every request, so it can never be part of
// static generation - a build with no DATABASE_URL set (the state of a
// first Vercel deploy) would otherwise fail.
export const dynamic = "force-dynamic";

interface Today {
  prompt: DailyPrompt;
  verse: VerseView | undefined;
  streak: number;
  signedIn: boolean;
}

// The prompt is the same for everyone and is what the page is for, so it
// loads either way. Only the verse needs an account - there's nobody to look
// one up for otherwise.
//
// Cached because generateMetadata() and the component below both need the
// prompt: React dedupes them within a request, so the title is built from the
// same row the page renders rather than a second round trip.
const loadToday = cache(async function loadToday(): Promise<Today> {
  const userId = await getUserId();
  const prompt = await getOrCreateTodayPrompt();
  // Two reads of the same person's verses; neither waits on the other.
  const [verse, streak] = userId
    ? await Promise.all([
        getVerseForPrompt(prompt.id, userId),
        getStreak(userId),
      ])
    : [undefined, 0];
  return { prompt, verse, streak, signedIn: Boolean(userId) };
});

// A title carrying the day's actual concept is what makes this page worth
// recrawling daily and worth clicking in a result - "today's prompt" alone
// tells a searcher nothing about today.
export async function generateMetadata(): Promise<Metadata> {
  let prompt: DailyPrompt;
  try {
    prompt = (await loadToday()).prompt;
  } catch {
    // No database yet. The layout's defaults are still a correct description
    // of the app, so fall back to them rather than failing the render.
    return { alternates: { canonical: "/" } };
  }

  const title = `${prompt.concept} - today's 16-bar rap prompt`;
  const description = clampDescription(
    `${formatPromptDate(prompt.promptDate)}: ${prompt.scenario} Rhyme scheme ${prompt.rhymeScheme}, ${prompt.pocket}. Write your 16 bars free.`,
  );

  return {
    title,
    description,
    alternates: { canonical: "/" },
    openGraph: { title, description, type: "website", url: "/" },
    twitter: { title, description },
  };
}

export default async function TodayPage() {
  let today: Today;
  try {
    today = await loadToday();
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  const { prompt, verse, streak, signedIn } = today;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 p-4 sm:p-8">
      <div className="flex flex-col gap-6">
        {/* The first thing a returning writer sees, above the day's prompt:
            what they have going, and what it would cost to drop it. Signed
            out there is no streak to show and no account to hang one on. */}
        {signedIn ? <StreakFlame streak={streak} /> : null}

        <div className="flex flex-col gap-2">
          {/* The one <h1> on the site. It names what a searcher typed rather
              than the brand: nobody searches "Sixteen", they search for a rap
              writing prompt. The day's concept is the <h2> in the card below. */}
          <h1 className="text-2xl leading-tight font-semibold sm:text-3xl">
            Today&rsquo;s 16-bar rap writing prompt
          </h1>
          {/* Someone already signed in knows what the app is - they came back
              to write, not to be pitched it again. See site-copy.tsx. */}
          {signedIn ? null : <SiteIntro />}
        </div>

        <PromptCard prompt={prompt} />

        {signedIn ? (
          <VersePad
            promptId={prompt.id}
            initialBody={verse?.body ?? ""}
            initialSealed={verse?.sealed ?? false}
            initialCompletedAt={verse?.completedAt?.toISOString() ?? null}
          />
        ) : (
          <SignedOutPad />
        )}
      </div>

      {/* The explainer and the FAQ, and the structured data that restates
          them, go together: schema is only allowed to describe what the page
          actually renders. Both stay for signed-out visitors and therefore for
          every crawler, which is where all of their value was to begin with. */}
      {signedIn ? null : (
        <>
          <HowItWorks />
          <Faq />
          <JsonLd data={howToGraph()} />
          <JsonLd data={faqGraph()} />
        </>
      )}

      <JsonLd data={dailyPromptGraph(prompt)} />
    </main>
  );
}
