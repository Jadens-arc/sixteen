import { and, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";

import { generateDailyPrompt } from "@/lib/ai";
import { countBars } from "@/lib/bars";
import { addDays, todayInAppTimezone } from "@/lib/date";
import { likePattern, normalizeSearchQuery } from "@/lib/search";

import { db } from "./client";
import { dailyPrompts, verses, type DailyPrompt, type Verse } from "./schema";

const RECENT_CONCEPTS_LIMIT = 14;
const ARCHIVE_LIMIT = 60;
const NOTEBOOK_LIMIT = 200;
const STREAK_SCAN_LIMIT = 400;

// Enough of the top of a loose verse for the list to name it by its first bar.
const OPENING_LENGTH = 160;

// How much of a verse the archive shows per row, and how far ahead of a search
// hit the shown window starts so the match lands in context instead of at the
// left edge.
const EXCERPT_LENGTH = 180;
const EXCERPT_RADIUS = 60;

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

// Only what the archive actually renders. Selecting the whole verse row would
// pull every body - up to ARCHIVE_LIMIT of them, each up to MAX_VERSE_LENGTH -
// across the wire on a page that shows two lines of one.
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

// Postgres cuts the window so the body itself never travels. strpos is
// 1-based and returns 0 when the query missed the body entirely - the row
// matched on its prompt, or there is no query - and greatest() reads that as
// "start at the top", which is exactly the preview an unsearched archive wants.
function bodyExcerpt(query: string): SQL<string | null> {
  return sql<string | null>`(
    select
      case when w.start > 1 then '...' else '' end
      || substring(${verses.body} from w.start for ${EXCERPT_LENGTH}::int)
      || case
           when char_length(${verses.body}) > w.start + ${EXCERPT_LENGTH}::int - 1
           then '...'
           else ''
         end
    from (
      select greatest(
        strpos(lower(${verses.body}), lower(${query})) - ${EXCERPT_RADIUS}::int,
        1
      ) as start
    ) as w
  )`;
}

// The verse body is joined on the user id, so a match against it can only ever
// be a match against the caller's own writing.
function matchesSearch(query: string): SQL | undefined {
  const pattern = likePattern(query);

  return or(
    ilike(dailyPrompts.concept, pattern),
    ilike(dailyPrompts.scenario, pattern),
    ilike(verses.body, pattern),
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
      verse: { barCount: verses.barCount, completedAt: verses.completedAt },
      excerpt: bodyExcerpt(query ?? ""),
    })
    .from(dailyPrompts)
    .leftJoin(verses, and(eq(verses.promptId, dailyPrompts.id), eq(verses.userId, userId)))
    .where(query ? matchesSearch(query) : undefined)
    .orderBy(desc(dailyPrompts.promptDate))
    .limit(ARCHIVE_LIMIT);

  return rows;
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
  return { prompt: row.prompt, verse: row.verse ?? undefined };
}

// A loose verse - no prompt behind it, so nothing to show but the writing.
// Everything here is bounded: the opening names the row, the excerpt says why
// a search matched it, and the body itself stays in the database until the
// verse is actually opened.
export interface NotebookEntry {
  id: string;
  barCount: number;
  updatedAt: Date;
  opening: string;
  excerpt: string | null;
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

  return db
    .select({
      id: verses.id,
      barCount: verses.barCount,
      updatedAt: verses.updatedAt,
      opening: sql<string>`left(${verses.body}, ${OPENING_LENGTH}::int)`,
      excerpt: bodyExcerpt(query ?? ""),
    })
    .from(verses)
    .where(
      and(
        isNotebookVerse(userId),
        query ? ilike(verses.body, likePattern(query)) : undefined,
      ),
    )
    .orderBy(desc(verses.updatedAt))
    .limit(NOTEBOOK_LIMIT);
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

  return verse;
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
      body: input.body,
      barCount: countBars(input.body),
    })
    .returning();

  return verse;
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
      body: input.body,
      barCount: countBars(input.body),
      // The database stamps this, not the app: the list is ordered by it, and
      // a JS Date is only precise to the millisecond, so a verse edited just
      // after another was created could otherwise sort behind it.
      updatedAt: sql`now()`,
    })
    .where(and(eq(verses.id, input.id), isNotebookVerse(input.userId)))
    .returning();

  return verse;
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
