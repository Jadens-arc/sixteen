import { and, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";

import { generateDailyPrompt } from "@/lib/ai";
import { countBars } from "@/lib/bars";
import { addDays, todayInAppTimezone } from "@/lib/date";
import { excerptAround, matchesQuery, normalizeSearchQuery } from "@/lib/search";
import { decryptVerseBody, encryptVerseBody } from "@/lib/verse-crypto";

import { db } from "./client";
import { dailyPrompts, verses, type DailyPrompt, type Verse } from "./schema";

const RECENT_CONCEPTS_LIMIT = 14;
const ARCHIVE_LIMIT = 60;
const NOTEBOOK_LIMIT = 200;
const STREAK_SCAN_LIMIT = 400;

// How many rows a search reads before filtering. Postgres used to do the
// filtering with an ILIKE over the verse bodies and return only the matches;
// it cannot see those bodies any more, so the window is what bounds the work
// instead: a search covers the most recent 500 prompts and the most recent 500
// loose verses, and returns the first ARCHIVE_LIMIT / NOTEBOOK_LIMIT hits in
// that window. At one prompt a day, 500 is well over a year of them.
const SEARCH_SCAN_LIMIT = 500;

// Enough of the top of a loose verse for the list to name it by its first bar.
const OPENING_LENGTH = 160;

// The boundary where a stored body becomes writing again. Above this module -
// the actions, the pages, the pads - a verse body is always plaintext; below
// it, in the database, it is always whatever src/lib/verse-crypto.ts wrote.
// Every read goes through here so no path can forget, and every write goes
// through encryptVerseBody() for the same reason.
function decodeVerse<T extends { body: string }>(verse: T, userId: string): T {
  return { ...verse, body: decryptVerseBody(verse.body, userId) };
}

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

  return verse && decodeVerse(verse, userId);
}

export async function upsertVerse(input: {
  promptId: string;
  userId: string;
  body: string;
  completed?: boolean;
}): Promise<Verse> {
  // Counted from the plaintext, before it goes down. The bar count is a number
  // the meter, the archive and the streak all read without opening the verse,
  // so it stays readable in the row - a length, not the writing.
  const barCount = countBars(input.body);
  const body = encryptVerseBody(input.body, input.userId);
  const now = new Date();

  const [verse] = await db
    .insert(verses)
    .values({
      promptId: input.promptId,
      userId: input.userId,
      body,
      barCount,
      completedAt: input.completed ? now : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [verses.promptId, verses.userId],
      set: {
        body,
        barCount,
        // Leave an existing completion timestamp alone unless this call is
        // the one marking the verse complete - an autosave shouldn't be able
        // to un-complete a verse.
        completedAt: input.completed ? now : sql`${verses.completedAt}`,
        updatedAt: now,
      },
    })
    .returning();

  return decodeVerse(verse, input.userId);
}

// Only what the archive actually renders. The verse body is read to search and
// to excerpt it, but it is not part of what the page gets handed.
export interface ArchiveVerse {
  barCount: number;
  completedAt: Date | null;
}

export interface ArchiveEntry {
  prompt: DailyPrompt;
  verse: ArchiveVerse | null;
  // A window onto the verse body: the opening lines normally, the text around
  // the first hit when searching. Null when there is no verse to excerpt.
  excerpt: string | null;
}

// A row matches on its prompt or on the writing against it. The body is joined
// on the user id, so a match against it can only ever be a match against the
// caller's own writing.
function matchesArchiveSearch(
  prompt: DailyPrompt,
  body: string | null,
  query: string,
): boolean {
  return (
    matchesQuery(prompt.concept, query) ||
    matchesQuery(prompt.scenario, query) ||
    (body !== null && matchesQuery(body, query))
  );
}

export async function listArchive(
  userId: string,
  search?: string | null,
): Promise<ArchiveEntry[]> {
  const query = normalizeSearchQuery(search);

  const rows = await db
    .select({
      prompt: dailyPrompts,
      // barCount leads deliberately: drizzle decides whether an unmatched left
      // join collapses to null from the first selected column of the joined
      // table, so that column has to be one that is NOT NULL when a row exists.
      verse: {
        barCount: verses.barCount,
        completedAt: verses.completedAt,
        body: verses.body,
      },
    })
    .from(dailyPrompts)
    .leftJoin(verses, and(eq(verses.promptId, dailyPrompts.id), eq(verses.userId, userId)))
    .orderBy(desc(dailyPrompts.promptDate))
    .limit(query ? SEARCH_SCAN_LIMIT : ARCHIVE_LIMIT);

  const entries: ArchiveEntry[] = [];

  for (const row of rows) {
    const body = row.verse ? decryptVerseBody(row.verse.body, userId) : null;
    if (query && !matchesArchiveSearch(row.prompt, body, query)) continue;

    entries.push({
      prompt: row.prompt,
      // The body stops here. It came to the server to be searched and cut
      // down; what carries on to the browser is the excerpt.
      verse: row.verse
        ? { barCount: row.verse.barCount, completedAt: row.verse.completedAt }
        : null,
      excerpt: body === null ? null : excerptAround(body, query),
    });

    if (entries.length === ARCHIVE_LIMIT) break;
  }

  return entries;
}

export interface ArchiveDetail {
  prompt: DailyPrompt;
  verse: Verse | undefined;
}

// The whole verse this time - this is the page that opens it for editing.
// Null when no prompt was ever issued for that date, which the route turns
// into a 404 rather than an empty pad against nothing.
export async function getArchiveDetail(
  promptDate: string,
  userId: string,
): Promise<ArchiveDetail | null> {
  const [row] = await db
    .select({ prompt: dailyPrompts, verse: verses })
    .from(dailyPrompts)
    .leftJoin(verses, and(eq(verses.promptId, dailyPrompts.id), eq(verses.userId, userId)))
    .where(eq(dailyPrompts.promptDate, promptDate))
    .limit(1);

  if (!row) return null;
  return {
    prompt: row.prompt,
    verse: row.verse ? decodeVerse(row.verse, userId) : undefined,
  };
}

// A loose verse - no prompt behind it, so nothing to show but the writing.
// Everything here is bounded: the opening names the row, the excerpt says why
// a search matched it, and neither is the whole verse.
export interface NotebookEntry {
  id: string;
  barCount: number;
  updatedAt: Date;
  opening: string;
  excerpt: string;
}

// isNull(promptId) is what separates the notebook from the daily verses
// sharing this table, and eq(userId) is what separates one writer from
// another. Every notebook query carries both.
function isNotebookVerse(userId: string): SQL | undefined {
  return and(eq(verses.userId, userId), isNull(verses.promptId));
}

export async function listNotebook(
  userId: string,
  search?: string | null,
): Promise<NotebookEntry[]> {
  const query = normalizeSearchQuery(search);

  const rows = await db
    .select({
      id: verses.id,
      barCount: verses.barCount,
      updatedAt: verses.updatedAt,
      body: verses.body,
    })
    .from(verses)
    .where(isNotebookVerse(userId))
    .orderBy(desc(verses.updatedAt))
    .limit(query ? SEARCH_SCAN_LIMIT : NOTEBOOK_LIMIT);

  const entries: NotebookEntry[] = [];

  for (const row of rows) {
    const body = decryptVerseBody(row.body, userId);
    if (query && !matchesQuery(body, query)) continue;

    entries.push({
      id: row.id,
      barCount: row.barCount,
      updatedAt: row.updatedAt,
      opening: body.slice(0, OPENING_LENGTH),
      excerpt: excerptAround(body, query),
    });

    if (entries.length === NOTEBOOK_LIMIT) break;
  }

  return entries;
}

export async function getNotebookVerse(
  id: string,
  userId: string,
): Promise<Verse | undefined> {
  const [verse] = await db
    .select()
    .from(verses)
    .where(and(eq(verses.id, id), isNotebookVerse(userId)))
    .limit(1);

  return verse && decodeVerse(verse, userId);
}

export async function createNotebookVerse(input: {
  userId: string;
  body: string;
}): Promise<Verse> {
  const [verse] = await db
    .insert(verses)
    .values({
      promptId: null,
      userId: input.userId,
      body: encryptVerseBody(input.body, input.userId),
      barCount: countBars(input.body),
    })
    .returning();

  return decodeVerse(verse, input.userId);
}

// Undefined when the id belongs to somebody else, to a daily verse, or to
// nothing at all - the caller turns that into a 404 rather than a silent
// success, and the where clause is what makes those cases indistinguishable
// from the outside.
export async function updateNotebookVerse(input: {
  id: string;
  userId: string;
  body: string;
}): Promise<Verse | undefined> {
  const [verse] = await db
    .update(verses)
    .set({
      body: encryptVerseBody(input.body, input.userId),
      barCount: countBars(input.body),
      // The database stamps this, not the app: the list is ordered by it, and
      // a JS Date is only precise to the millisecond, so a verse edited just
      // after another was created could otherwise sort behind it.
      updatedAt: sql`now()`,
    })
    .where(and(eq(verses.id, input.id), isNotebookVerse(input.userId)))
    .returning();

  return verse && decodeVerse(verse, input.userId);
}

export async function deleteNotebookVerse(input: {
  id: string;
  userId: string;
}): Promise<boolean> {
  const deleted = await db
    .delete(verses)
    .where(and(eq(verses.id, input.id), isNotebookVerse(input.userId)))
    .returning({ id: verses.id });

  return deleted.length > 0;
}

export async function getStreak(userId: string): Promise<number> {
  const rows = await db
    .select({ promptDate: dailyPrompts.promptDate })
    .from(verses)
    .innerJoin(dailyPrompts, eq(verses.promptId, dailyPrompts.id))
    .where(and(eq(verses.userId, userId), isNotNull(verses.completedAt)))
    .orderBy(desc(dailyPrompts.promptDate))
    .limit(STREAK_SCAN_LIMIT);

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
