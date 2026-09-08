import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { generateDailyPrompt } from "@/lib/ai";
import { countBars } from "@/lib/bars";
import { addDays, todayInAppTimezone } from "@/lib/date";

import { db } from "./client";
import { dailyPrompts, verses, type DailyPrompt, type Verse } from "./schema";

const RECENT_CONCEPTS_LIMIT = 14;
const ARCHIVE_LIMIT = 60;

async function recentConcepts(): Promise<string[]> {
  const rows = await db
    .select({ concept: dailyPrompts.concept })
    .from(dailyPrompts)
    .orderBy(desc(dailyPrompts.promptDate))
    .limit(RECENT_CONCEPTS_LIMIT);

  return rows.map((row) => row.concept);
}

export async function getOrCreateTodayPrompt(): Promise<DailyPrompt> {
  const today = todayInAppTimezone();

  const [existing] = await db
    .select()
    .from(dailyPrompts)
    .where(eq(dailyPrompts.promptDate, today))
    .limit(1);
  if (existing) return existing;

  const { prompt, source, model } = await generateDailyPrompt({
    date: today,
    recentConcepts: await recentConcepts(),
  });

  const [inserted] = await db
    .insert(dailyPrompts)
    .values({
      promptDate: today,
      concept: prompt.concept,
      scenario: prompt.scenario,
      rhymeScheme: prompt.rhymeScheme,
      pocket: prompt.pocket,
      constraints: prompt.constraints,
      wordBank: prompt.wordBank,
      source,
      model,
    })
    .onConflictDoNothing({ target: dailyPrompts.promptDate })
    .returning();
  if (inserted) return inserted;

  // Another request generated and inserted today's prompt between our
  // SELECT and INSERT. Read what it wrote instead of erroring.
  const [winner] = await db
    .select()
    .from(dailyPrompts)
    .where(eq(dailyPrompts.promptDate, today))
    .limit(1);
  if (!winner) {
    throw new Error(`Prompt insert for ${today} conflicted but no row exists`);
  }

  return winner;
}

export async function getVerseForPrompt(
  promptId: string,
  userId: string,
): Promise<Verse | undefined> {
  const [verse] = await db
    .select()
    .from(verses)
    .where(and(eq(verses.promptId, promptId), eq(verses.userId, userId)))
    .limit(1);

  return verse;
}

export async function upsertVerse(input: {
  promptId: string;
  userId: string;
  body: string;
  completed?: boolean;
}): Promise<Verse> {
  const barCount = countBars(input.body);
  const now = new Date();

  const [verse] = await db
    .insert(verses)
    .values({
      promptId: input.promptId,
      userId: input.userId,
      body: input.body,
      barCount,
      completedAt: input.completed ? now : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [verses.promptId, verses.userId],
      set: {
        body: input.body,
        barCount,
        // Leave an existing completion timestamp alone unless this call is
        // the one marking the verse complete - an autosave shouldn't be able
        // to un-complete a verse.
        completedAt: input.completed ? now : sql`${verses.completedAt}`,
        updatedAt: now,
      },
    })
    .returning();

  return verse;
}

export interface ArchiveEntry {
  prompt: DailyPrompt;
  verse: Verse | null;
}

export async function listArchive(userId: string): Promise<ArchiveEntry[]> {
  const rows = await db
    .select({ prompt: dailyPrompts, verse: verses })
    .from(dailyPrompts)
    .leftJoin(verses, and(eq(verses.promptId, dailyPrompts.id), eq(verses.userId, userId)))
    .orderBy(desc(dailyPrompts.promptDate))
    .limit(ARCHIVE_LIMIT);

  return rows;
}

export async function getStreak(userId: string): Promise<number> {
  const rows = await db
    .select({ promptDate: dailyPrompts.promptDate })
    .from(verses)
    .innerJoin(dailyPrompts, eq(verses.promptId, dailyPrompts.id))
    .where(and(eq(verses.userId, userId), isNotNull(verses.completedAt)));

  const completedDates = new Set(rows.map((row) => row.promptDate));
  if (completedDates.size === 0) return 0;

  const today = todayInAppTimezone();
  let cursor = completedDates.has(today) ? today : addDays(today, -1);

  let streak = 0;
  while (completedDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}
