import { and, asc, count, eq, not, sql, type SQL } from "drizzle-orm";

import { NAMESPACE, USER_VERSION } from "@/lib/crypto/envelope";
import { readStoredBody } from "@/lib/crypto/server";

import { db } from "./client";
import { userKeys, verses, type UserKey } from "./schema";

/**
 * The database side of the passphrase setting.
 *
 * A row in user_keys means this person's verses are sealed in their own
 * browser. The row holds a salt, an iteration count and a data key wrapped
 * twice - once under their passphrase, once under their recovery code - and
 * none of that is any use to whoever holds the database.
 */

export type VaultState = "active" | "unsealing";

/** How many verses one conversion round trip carries. */
export const CONVERSION_BATCH = 20;

export async function getUserKey(userId: string): Promise<UserKey | undefined> {
  const [record] = await db
    .select()
    .from(userKeys)
    .where(eq(userKeys.userId, userId))
    .limit(1);

  return record;
}

/**
 * Starts sealing an account.
 *
 * onConflictDoNothing rather than an upsert: overwriting an existing record
 * would replace the wrapped data key, and every verse already sealed under the
 * old one would become unreadable by anybody, forever. A second attempt has to
 * fail loudly instead.
 */
export async function createUserKey(input: {
  userId: string;
  salt: string;
  recoverySalt: string;
  kdf: string;
  iterations: number;
  dataKeyId: string;
  wrappedByPassphrase: string;
  wrappedByRecovery: string;
}): Promise<UserKey | undefined> {
  const [record] = await db
    .insert(userKeys)
    .values({ ...input, state: "active" })
    .onConflictDoNothing({ target: userKeys.userId })
    .returning();

  return record;
}

/** Rewraps the data key under a new passphrase. The key itself never changes. */
export async function updateUserKeyWrapping(input: {
  userId: string;
  salt: string;
  wrappedByPassphrase: string;
}): Promise<UserKey | undefined> {
  const [record] = await db
    .update(userKeys)
    .set({
      salt: input.salt,
      wrappedByPassphrase: input.wrappedByPassphrase,
      updatedAt: new Date(),
    })
    .where(eq(userKeys.userId, input.userId))
    .returning();

  return record;
}

export async function setUserKeyState(
  userId: string,
  state: VaultState,
): Promise<UserKey | undefined> {
  const [record] = await db
    .update(userKeys)
    .set({ state, updatedAt: new Date() })
    .where(eq(userKeys.userId, userId))
    .returning();

  return record;
}

/**
 * Forgets the passphrase settings entirely. Only correct once every verse has
 * been converted back to something the server can read - the caller checks
 * that, because doing it early would strand verses nobody can open.
 */
export async function deleteUserKey(userId: string): Promise<void> {
  await db.delete(userKeys).where(eq(userKeys.userId, userId));
}

export interface ConvertibleVerse {
  id: string;
  /** What the browser has to work on: writing to seal, or ciphertext to open. */
  body: string;
  /**
   * The column exactly as it stands. It goes back with the converted verse so
   * the write can match on it and do nothing if the row has changed since -
   * the pads keep autosaving while a conversion runs, and a save that landed
   * in between has already written the verse in its new form.
   */
  storedBody: string;
  barCount: number;
}

// Built from the envelope constants rather than spelled out, so the format and
// the predicate that finds it cannot drift apart. There are no LIKE wildcards
// in the prefix itself, so nothing needs escaping.
const SEALED_PREFIX_PATTERN = `${NAMESPACE}.${USER_VERSION}.%`;

function isSealedInSql(): SQL {
  return sql`${verses.body} like ${SEALED_PREFIX_PATTERN}`;
}

// An empty verse has nothing to seal and is skipped by both directions, which
// is why it is excluded here rather than filtered out afterwards - the counts
// below have to agree with the batches, or a conversion never reads as done.
function needsSealing(userId: string): SQL | undefined {
  return and(
    eq(verses.userId, userId),
    not(isSealedInSql()),
    sql`${verses.body} <> ''`,
  );
}

function isSealedFor(userId: string): SQL | undefined {
  return and(eq(verses.userId, userId), isSealedInSql());
}

/**
 * The next few verses that still need sealing, as writing, for the browser to
 * seal and hand back. Only rows the server can still read appear here, so a
 * conversion that stops halfway simply has fewer rows to do next time.
 */
export async function listVersesToSeal(userId: string): Promise<ConvertibleVerse[]> {
  const rows = await db
    .select({ id: verses.id, body: verses.body, barCount: verses.barCount })
    .from(verses)
    .where(needsSealing(userId))
    .orderBy(asc(verses.id))
    .limit(CONVERSION_BATCH);

  return rows.map((row) => {
    const read = readStoredBody(row.body, userId);
    if (read.kind !== "plaintext") {
      // needsSealing() excluded everything sealed in a browser, so anything
      // unreadable here is a server-key problem, and readStoredBody has
      // already thrown for it. This is belt and braces on a promise the SQL
      // above is making.
      throw new Error(`Verse ${row.id} cannot be read on the server.`);
    }
    return {
      id: row.id,
      body: read.body,
      storedBody: row.body,
      barCount: row.barCount,
    };
  });
}

/** The mirror image: verses still sealed, as ciphertext, for the browser to open. */
export async function listVersesToUnseal(userId: string): Promise<ConvertibleVerse[]> {
  const rows = await db
    .select({ id: verses.id, body: verses.body, barCount: verses.barCount })
    .from(verses)
    .where(isSealedFor(userId))
    .orderBy(asc(verses.id))
    .limit(CONVERSION_BATCH);

  // Going this way the ciphertext is both what the browser works on and what
  // the write has to match against, so the two fields are the same value.
  return rows.map((row) => ({ ...row, storedBody: row.body }));
}

/** What is left to do, for a progress count that means something. */
export async function countVersesToSeal(userId: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(verses).where(needsSealing(userId));
  return row?.total ?? 0;
}

export async function countVersesSealed(userId: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(verses).where(isSealedFor(userId));
  return row?.total ?? 0;
}

/**
 * Writes one converted verse.
 *
 * Matching on the body as it was read, not just the id: the pads are still
 * autosaving while a conversion runs, and a verse saved since this one was
 * handed out has already been written in the new form by that save. Losing
 * that race means writing a stale copy over a fresh one, so the update simply
 * matches nothing and the row is left alone.
 *
 * updated_at is deliberately not touched. Converting a verse is not editing
 * it, and the notebook is ordered by that column.
 */
export async function replaceVerseBody(input: {
  id: string;
  userId: string;
  expectedBody: string;
  body: string;
  barCount: number;
}): Promise<boolean> {
  const written = await db
    .update(verses)
    .set({ body: input.body, barCount: input.barCount })
    .where(
      and(
        eq(verses.id, input.id),
        eq(verses.userId, input.userId),
        eq(verses.body, input.expectedBody),
      ),
    )
    .returning({ id: verses.id });

  return written.length > 0;
}
