import { cache } from "react";
import type { Metadata } from "next";

import { Faq, HowItWorks } from "@/components/site-copy";
import { JsonLd } from "@/components/json-ld";
import { PromptCard } from "@/components/prompt-card";
import { SetupNotice } from "@/components/setup-notice";
import { SignedOutPad } from "@/components/signed-out-pad";
import { VersePad } from "@/components/verse-pad";
import { getUserId } from "@/lib/auth";
import { formatPromptDate } from "@/lib/date";
import { getOrCreateTodayPrompt, getVerseForPrompt } from "@/lib/db/queries";
import type { DailyPrompt, Verse } from "@/lib/db/schema";
import { clampDescription, siteDescription } from "@/lib/site";
import { dailyPromptGraph, faqGraph, howToGraph } from "@/lib/structured-data";

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
//
// Cached because generateMetadata() and the component below both need the
// prompt: React dedupes them within a request, so the title is built from the
// same row the page renders rather than a second round trip.
const loadToday = cache(async function loadToday(): Promise<Today> {
  const userId = await getUserId();
  const prompt = await getOrCreateTodayPrompt();
  const verse = userId ? await getVerseForPrompt(prompt.id, userId) : undefined;
  return { prompt, verse, signedIn: Boolean(userId) };
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

  const { prompt, verse, signedIn } = today;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 p-4 sm:p-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {/* The one <h1> on the site. It names what a searcher typed rather
              than the brand: nobody searches "Sixteen", they search for a rap
              writing prompt. The day's concept is the <h2> in the card below. */}
          <h1 className="text-2xl leading-tight font-semibold sm:text-3xl">
            Today&rsquo;s 16-bar rap writing prompt
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {siteDescription} A new prompt lands every morning and everyone
            writes to the same one.
          </p>
        </div>

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
      </div>

      <HowItWorks />
      <Faq />

      <JsonLd data={dailyPromptGraph(prompt)} />
      <JsonLd data={howToGraph()} />
      <JsonLd data={faqGraph()} />
    </main>
  );
}
