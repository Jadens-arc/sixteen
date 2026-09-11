"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUserId } from "@/lib/auth";
import { MAX_SEALED_LENGTH, MAX_VERSE_LENGTH } from "@/lib/bars";
import { isUserSealed } from "@/lib/crypto/envelope";
import {
  countVersesSealed,
  countVersesToSeal,
  createUserKey,
  deleteUserKey,
  getUserKey,
  listVersesToSeal,
  listVersesToUnseal,
  replaceVerseBody,
  setUserKeyState,
  updateUserKeyWrapping,
  type ConvertibleVerse,
} from "@/lib/db/vault";

/**
 * Turning the passphrase on and off, and the one verse-at-a-time conversion
 * that each of those means.
 *
 * Every step here is resumable. The state of an account is not held in this
 * module or in a session - it is the user_keys row plus the format each verse
 * is stored in, both of which survive a closed laptop. Nothing here is a
 * transaction across many verses, because the one thing worse than a
 * half-converted notebook is a conversion that has to start over.
 */

const wrappedKey = z.string().min(1).max(1000);
const salt = z.string().min(1).max(200);

const enableSchema = z.object({
  salt,
  recoverySalt: salt,
  kdf: z.string().min(1).max(50),
  iterations: z.number().int().min(100_000).max(10_000_000),
  dataKeyId: z.string().regex(/^[0-9a-f]{12}$/),
  wrappedByPassphrase: wrappedKey,
  wrappedByRecovery: wrappedKey,
});

const convertSchema = z.object({
  id: z.uuid(),
  expectedBody: z.string().max(MAX_SEALED_LENGTH),
  body: z.string().max(MAX_SEALED_LENGTH),
  barCount: z.number().int().min(0).max(MAX_VERSE_LENGTH),
});

const passphraseSchema = z.object({ salt, wrappedByPassphrase: wrappedKey });

/** What the browser needs to unlock, and what it must never be given more of. */
export interface VaultStatus {
  locked: boolean;
  state: "active" | "unsealing" | null;
  kdf: string | null;
  iterations: number | null;
  salt: string | null;
  recoverySalt: string | null;
  dataKeyId: string | null;
  wrappedByPassphrase: string | null;
  wrappedByRecovery: string | null;
}

/**
 * One indexed lookup by primary key, and deliberately nothing more. The vault
 * provider sits in the root layout, so this runs on every page a signed-in
 * person opens - counting their verses here would put two full scans on the
 * path of every page view to render a number only the settings page shows.
 */
export async function getVaultStatus(): Promise<VaultStatus> {
  const record = await getUserKey(await requireUserId());

  if (!record) {
    return {
      locked: false,
      state: null,
      kdf: null,
      iterations: null,
      salt: null,
      recoverySalt: null,
      dataKeyId: null,
      wrappedByPassphrase: null,
      wrappedByRecovery: null,
    };
  }

  return {
    locked: true,
    state: record.state === "unsealing" ? "unsealing" : "active",
    kdf: record.kdf,
    iterations: record.iterations,
    salt: record.salt,
    recoverySalt: record.recoverySalt,
    dataKeyId: record.dataKeyId,
    wrappedByPassphrase: record.wrappedByPassphrase,
    wrappedByRecovery: record.wrappedByRecovery,
  };
}

export interface VaultProgress {
  versesToSeal: number;
  versesSealed: number;
}

/** The counts the settings page shows, asked for only by the page that shows them. */
export async function getVaultProgress(): Promise<VaultProgress> {
  const userId = await requireUserId();

  const [versesToSeal, versesSealed] = await Promise.all([
    countVersesToSeal(userId),
    countVersesSealed(userId),
  ]);

  return { versesToSeal, versesSealed };
}

/**
 * Records the wrapped keys, which is the moment the account becomes sealed.
 *
 * The browser must already have shown the recovery code and made the person
 * type it back before calling this. That ordering is the difference between a
 * setting and a way to lose everything you have written, and it is enforced in
 * the flow rather than here because this side cannot see a piece of paper.
 */
export async function enableVault(input: {
  salt: string;
  recoverySalt: string;
  kdf: string;
  iterations: number;
  dataKeyId: string;
  wrappedByPassphrase: string;
  wrappedByRecovery: string;
}): Promise<void> {
  const userId = await requireUserId();
  const values = enableSchema.parse(input);

  const record = await createUserKey({ userId, ...values });
  if (!record) {
    // A second call would replace the wrapped data key, and every verse sealed
    // under the old one would become unreadable by anyone, permanently.
    throw new Error(
      "This account already has a passphrase. Turn it off before setting a new one.",
    );
  }

  revalidatePath("/", "layout");
}

export async function changePassphrase(input: {
  salt: string;
  wrappedByPassphrase: string;
}): Promise<void> {
  const userId = await requireUserId();
  const values = passphraseSchema.parse(input);

  const record = await updateUserKeyWrapping({ userId, ...values });
  if (!record) throw new Error("This account does not have a passphrase set.");
}

export async function nextVersesToSeal(): Promise<ConvertibleVerse[]> {
  return listVersesToSeal(await requireUserId());
}

export async function nextVersesToUnseal(): Promise<ConvertibleVerse[]> {
  return listVersesToUnseal(await requireUserId());
}

/**
 * Stores one converted verse, in whichever direction the account is going.
 *
 * The direction is not taken on trust: an active vault may only be handed
 * sealed bodies, and an unsealing one only readable bodies. Getting that wrong
 * is how a conversion writes plaintext into a locked notebook.
 */
export async function storeConvertedVerse(input: {
  id: string;
  expectedBody: string;
  body: string;
  barCount: number;
}): Promise<boolean> {
  const userId = await requireUserId();
  const values = convertSchema.parse(input);

  const record = await getUserKey(userId);
  if (!record) throw new Error("This account does not have a passphrase set.");

  const sealed = isUserSealed(values.body);
  if (record.state === "active" && !sealed) {
    throw new Error("A locked notebook cannot be handed a verse in the clear.");
  }
  if (record.state === "unsealing" && sealed) {
    throw new Error("This notebook is being unlocked; its verses should arrive readable.");
  }
  if (!sealed && values.body.length > MAX_VERSE_LENGTH) {
    throw new Error("That verse is too long.");
  }

  return replaceVerseBody({ userId, ...values });
}

/**
 * Opens the window in which plaintext may be written back. Deliberately its
 * own step: while the state is "unsealing" the browser still holds the key and
 * can read what is left, and until the last verse is converted the account is
 * still treated as locked everywhere it is rendered.
 */
export async function beginUnsealing(): Promise<void> {
  const userId = await requireUserId();

  const record = await getUserKey(userId);
  if (!record) throw new Error("This account does not have a passphrase set.");

  await setUserKeyState(userId, "unsealing");
  revalidatePath("/", "layout");
}

/**
 * Forgets the passphrase settings - only once nothing is sealed with them.
 *
 * The count is checked here rather than trusted from the browser. Deleting the
 * record with sealed verses left would strand them behind a wrapped key that
 * no longer exists, which is the one unrecoverable mistake this whole feature
 * can make.
 */
export async function finishUnsealing(): Promise<{ remaining: number }> {
  const userId = await requireUserId();

  const remaining = await countVersesSealed(userId);
  if (remaining > 0) return { remaining };

  await deleteUserKey(userId);
  revalidatePath("/", "layout");
  return { remaining: 0 };
}
