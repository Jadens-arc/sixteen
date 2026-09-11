import { and, asc, eq, gt } from "drizzle-orm";

import { db } from "../src/lib/db/client";
import { verses } from "../src/lib/db/schema";
import { isSealed } from "../src/lib/crypto/envelope";
import {
  readStoredBody,
  sealWithServerKey,
  serverEncryptionEnabled,
} from "../src/lib/crypto/server";

/**
 * Encrypts verses that were written before encryption was turned on.
 *
 * Nothing requires this. The app reads a plaintext body perfectly well and
 * rewrites it encrypted the next time that verse is saved, so old writing is
 * never lost and never has to be touched. But a verse nobody reopens would
 * sit in plaintext forever, and the point of the key is that a database dump
 * gives up nothing - which is only true once every row is encrypted. So this
 * exists to be run once, by hand, after the key is set:
 *
 *   VERSE_ENCRYPTION_KEY=... DATABASE_URL=... npm run db:encrypt-verses
 *
 * It is safe to run again - an already-encrypted body is left alone - and
 * safe to interrupt, because each row is committed on its own.
 *
 * Three things it deliberately does not do. It never writes a row it cannot
 * immediately read back, so a bad key stops the run instead of rewriting the
 * notebook into noise. It never writes a row that changed while it was
 * working, so somebody typing in the app during the run keeps what they
 * typed. And it leaves updated_at alone: re-encrypting a verse is not editing
 * it, and the notebook is ordered by that column.
 */

const BATCH_SIZE = 100;

interface Counts {
  encrypted: number;
  alreadyEncrypted: number;
  empty: number;
  changedUnderneath: number;
}

// A verse sealed in somebody's browser is counted here and then left alone.
// The server key cannot open it and has no business trying: that account
// chose a passphrase, and this script has nothing to offer it.

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set - there is no database to read.");
  }
  if (!serverEncryptionEnabled()) {
    throw new Error(
      "VERSE_ENCRYPTION_KEY is not set. Set it to the key this deployment " +
        "writes with, or there is nothing to encrypt these verses with.",
    );
  }

  const counts: Counts = {
    encrypted: 0,
    alreadyEncrypted: 0,
    empty: 0,
    changedUnderneath: 0,
  };
  // Paging by id rather than by offset: the rows are being rewritten as the
  // scan moves through them, and an offset over a changing table can skip one.
  let cursor = "00000000-0000-0000-0000-000000000000";

  for (;;) {
    const batch = await db
      .select({ id: verses.id, userId: verses.userId, body: verses.body })
      .from(verses)
      .where(gt(verses.id, cursor))
      .orderBy(asc(verses.id))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const verse of batch) {
      if (verse.body.length === 0) {
        counts.empty += 1;
        continue;
      }
      if (isSealed(verse.body)) {
        counts.alreadyEncrypted += 1;
        continue;
      }

      const stored = sealWithServerKey(verse.body, verse.userId);
      const readBack = readStoredBody(stored, verse.userId);
      if (readBack.kind !== "plaintext" || readBack.body !== verse.body) {
        throw new Error(
          `Verse ${verse.id} did not read back as what it was. Nothing was ` +
            "written for it; the row is unchanged. Check VERSE_ENCRYPTION_KEY.",
        );
      }

      // Matching on the body we read, not just the id: the app is still
      // serving while this runs, and a verse saved between the select above
      // and this update has already been encrypted by that save. Losing the
      // race here means writing stale writing over fresh writing, so the
      // update simply matches nothing and the row is left alone.
      const written = await db
        .update(verses)
        .set({ body: stored })
        .where(and(eq(verses.id, verse.id), eq(verses.body, verse.body)))
        .returning({ id: verses.id });

      if (written.length > 0) counts.encrypted += 1;
      else counts.changedUnderneath += 1;
    }
  }

  console.log(
    `Encrypted ${counts.encrypted} verses. ` +
      `${counts.alreadyEncrypted} were already sealed (by this key, a previous ` +
      `one, or somebody's passphrase), and ${counts.empty} were empty.`,
  );
  if (counts.changedUnderneath > 0) {
    console.log(
      `${counts.changedUnderneath} were saved in the app mid-run and left as ` +
        "they were - that save encrypted them. Re-run to confirm.",
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
