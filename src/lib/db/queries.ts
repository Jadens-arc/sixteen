import { and, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";

import { generateDailyPrompt } from "@/lib/ai";
import { countBars } from "@/lib/bars";
import { readStoredBody, sealWithServerKey } from "@/lib/crypto/server";
import { addDays, todayInAppTimezone } from "@/lib/date";
import { ARCHIVE_LIMIT, NOTEBOOK_LIMIT } from "@/lib/list-limits";
import { excerptAround, matchesQuery, normalizeSearchQuery } from "@/lib/search";

import { db } from "./client";
import { dailyPrompts, verses, type DailyPrompt, type Verse } from "./schema";

const RECENT_CONCEPTS_LIMIT = 14;
const STREAK_SCAN_LIMIT = 400;

// Enough of the top of a loose verse for the list to name it by its first bar.
const OPENING_LENGTH = 160;

/**
 * A verse on its way out of the database.
 *
 * `sealed` says who can read the body. False means the body is writing: it
 * was stored as plaintext, or the server key opened it. True means the body
 * is ciphertext that only the writer's browser can open, and every server-side
 * thing that wants the writing - search, excerpts, the bar count - has to do
 * without. That is the trade the passphrase setting makes, stated in a type so
 * no caller can forget it.
 */
export interface VerseView {
  id: string;
  promptId: string | null;
  userId: string;
  body: string;
  sealed: boolean;
  barCount: number;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function viewVerse(verse: Verse, userId: string): VerseView {
  const read = readStoredBody(verse.body, userId);
  return { ...verse, body: read.body, sealed: read.kind === "sealed" };
}

/**
 * What to store, and what the bar count is, for one save.
 *
 * A save from a browser holding a passphrase arrives already sealed, and the
 * count comes with it because this side cannot read the verse to count it.
 * Everything else is plaintext that gets sealed here with the server key.
 */
export type BodyInput =
  | { sealed: false; body: string }
  | { sealed: true; body: string; barCount: number };

function storable(input: BodyInput, userId: string): { body: string; barCount: number } {
  if (input.sealed) return { body: input.body, barCount: input.barCount };
  // Counted from the plaintext, before it goes down. The bar count stays
  // readable in the row - a length, not the writing - because the meter, the
  // archive and the streak all read it without opening a verse.
  return { body: sealWithServerKey(input.body, userId), barCount: countBars(input.body) };
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
): Promise<VerseView | undefined> {
  const [verse] = await db
    .select()
    .from(verses)
    .where(and(eq(verses.promptId, promptId), eq(verses.userId, userId)))
    .limit(1);

  return verse && viewVerse(verse, userId);
}

export async function upsertVerse(input: {
  promptId: string;
  userId: string;
  body: BodyInput;
  completed?: boolean;
}): Promise<VerseView> {
  const { body, barCount } = storable(input.body, input.userId);
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

  return viewVerse(verse, input.userId);
}

// What the archive renders for one day. The sealed case carries the ciphertext
// instead of an excerpt, because the excerpt is made in the browser.
export type ArchiveVerse =
  | { sealed: false; barCount: number; completedAt: Date | null; excerpt: string }
  | { sealed: true; barCount: number; completedAt: Date | null; body: string };

export interface ArchiveEntry {
  prompt: DailyPrompt;
  verse: ArchiveVerse | null;
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

  const scan = db
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
    .orderBy(desc(dailyPrompts.promptDate));

  // A search reads every row and takes no LIMIT. Postgres cannot match an
  // encrypted body, so the filtering happens here, and a scan window would
  // mean a search that silently stops finding verses past some age - a worse
  // answer than a slower one. The table is one row per calendar day, so its
  // size is the age of the app rather than anything a person can run away
  // with. Without a search there is nothing to filter and the limit stands.
  const rows = await (query ? scan : scan.limit(ARCHIVE_LIMIT));

  const entries: ArchiveEntry[] = [];

  // Only rows this side could actually match count against the limit. A sealed
  // row has not been searched yet - the browser does that - so capping on it
  // here would cut the search off at sixty unsearched verses and quietly lose
  // every older one. The browser applies ARCHIVE_LIMIT once it knows what
  // matched.
  let decided = 0;

  for (const row of rows) {
    if (!row.verse) {
      if (query && !matchesArchiveSearch(row.prompt, null, query)) continue;
      entries.push({ prompt: row.prompt, verse: null });
      decided += 1;
      if (decided === ARCHIVE_LIMIT) break;
      continue;
    }

    const read = readStoredBody(row.verse.body, userId);
    const { barCount, completedAt } = row.verse;

    if (read.kind === "sealed") {
      // Unsearchable here by construction. It travels to the browser, which
      // holds the key, and the filtering and excerpting happen there.
      entries.push({
        prompt: row.prompt,
        verse: { sealed: true, barCount, completedAt, body: read.body },
      });
      if (!query && entries.length === ARCHIVE_LIMIT) break;
      continue;
    } else {
      if (query && !matchesArchiveSearch(row.prompt, read.body, query)) continue;
      entries.push({
        prompt: row.prompt,
        // The body stops here. It came to the server to be searched and cut
        // down; what carries on to the browser is the excerpt.
        verse: {
          sealed: false,
          barCount,
          completedAt,
          excerpt: excerptAround(read.body, query),
        },
      });
      decided += 1;
    }

    if (decided === ARCHIVE_LIMIT) break;
  }

  return entries;
}

export interface ArchiveDetail {
  prompt: DailyPrompt;
  verse: VerseView | undefined;
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
    verse: row.verse ? viewVerse(row.verse, userId) : undefined,
  };
}

// A loose verse - no prompt behind it, so nothing to show but the writing.
export type NotebookEntry = {
  id: string;
  barCount: number;
  updatedAt: Date;
} & (
  | { sealed: false; opening: string; excerpt: string }
  | { sealed: true; body: string }
);

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

  const scan = db
    .select({
      id: verses.id,
      barCount: verses.barCount,
      updatedAt: verses.updatedAt,
      body: verses.body,
    })
    .from(verses)
    .where(isNotebookVerse(userId))
    .orderBy(desc(verses.updatedAt));

  // As in listArchive: a search reads the whole notebook rather than a window
  // of it, because a search that quietly misses old verses is the wrong kind
  // of cheap.
  const rows = await (query ? scan : scan.limit(NOTEBOOK_LIMIT));

  const entries: NotebookEntry[] = [];

  // As in listArchive: a sealed verse has not been searched yet, so it cannot
  // count against the limit without cutting the search short.
  let decided = 0;

  for (const row of rows) {
    const read = readStoredBody(row.body, userId);
    const { id, barCount, updatedAt } = row;

    if (read.kind === "sealed") {
      entries.push({ id, barCount, updatedAt, sealed: true, body: read.body });
      if (!query && entries.length === NOTEBOOK_LIMIT) break;
      continue;
    }

    if (query && !matchesQuery(read.body, query)) continue;
    entries.push({
      id,
      barCount,
      updatedAt,
      sealed: false,
      opening: read.body.slice(0, OPENING_LENGTH),
      excerpt: excerptAround(read.body, query),
    });

    decided += 1;
    if (decided === NOTEBOOK_LIMIT) break;
  }

  return entries;
}

export async function getNotebookVerse(
  id: string,
  userId: string,
): Promise<VerseView | undefined> {
  const [verse] = await db
    .select()
    .from(verses)
    .where(and(eq(verses.id, id), isNotebookVerse(userId)))
    .limit(1);

  return verse && viewVerse(verse, userId);
}

export async function createNotebookVerse(input: {
  userId: string;
  body: BodyInput;
}): Promise<VerseView> {
  const { body, barCount } = storable(input.body, input.userId);

  const [verse] = await db
    .insert(verses)
    .values({ promptId: null, userId: input.userId, body, barCount })
    .returning();

  return viewVerse(verse, input.userId);
}

// Undefined when the id belongs to somebody else, to a daily verse, or to
// nothing at all - the caller turns that into a 404 rather than a silent
// success, and the where clause is what makes those cases indistinguishable
// from the outside.
export async function updateNotebookVerse(input: {
  id: string;
  userId: string;
  body: BodyInput;
}): Promise<VerseView | undefined> {
  const { body, barCount } = storable(input.body, input.userId);

  const [verse] = await db
    .update(verses)
    .set({
      body,
      barCount,
      // The database stamps this, not the app: the list is ordered by it, and
      // a JS Date is only precise to the millisecond, so a verse edited just
      // after another was created could otherwise sort behind it.
      updatedAt: sql`now()`,
    })
    .where(and(eq(verses.id, input.id), isNotebookVerse(input.userId)))
    .returning();

  return verse && viewVerse(verse, input.userId);
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
