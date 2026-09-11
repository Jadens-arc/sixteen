import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  dataKeyId,
  deriveWrappingKey,
  generateDataKey,
  generateRecoveryCode,
  generateSalt,
  importDataKey,
  openUserSealed,
  sealWithUserKey,
  unwrapDataKey,
  wrapDataKey,
} from "@/lib/crypto/client";
import { readStoredBody } from "@/lib/crypto/server";

const mocks = vi.hoisted(() => ({ getUserKey: vi.fn() }));
vi.mock("@/lib/db/vault", () => ({ getUserKey: mocks.getUserKey }));

const { resolveBodyInput } = await import("@/lib/vault-policy");

const USER = "user_1";
const VERSE = "cold open in the pawn shop\nsecond bar\nthird bar";
const PASSPHRASE = "a long enough passphrase";
const FAST = 1_000;

beforeEach(() => {
  vi.clearAllMocks();
  // The server key is set, as it would be in production. It must still not be
  // able to read anything sealed in the browser.
  process.env.VERSE_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
});

/** Everything the browser does when somebody turns the setting on. */
async function enable() {
  const raw = generateDataKey();
  const keyId = await dataKeyId(raw);
  const salt = generateSalt();
  const recoverySalt = generateSalt();
  const recoveryCode = generateRecoveryCode();

  const wrappedByPassphrase = await wrapDataKey(
    raw,
    await deriveWrappingKey(PASSPHRASE, salt, FAST),
    USER,
  );
  const wrappedByRecovery = await wrapDataKey(
    raw,
    await deriveWrappingKey(recoveryCode, recoverySalt, FAST),
    USER,
  );

  return {
    raw,
    keyId,
    salt,
    recoverySalt,
    recoveryCode,
    wrappedByPassphrase,
    wrappedByRecovery,
  };
}

/** What a sealed account has in the database for one verse. */
async function storedVerse(raw: Uint8Array, keyId: string, body: string) {
  const key = await importDataKey(raw);
  const sealed = await sealWithUserKey(body, key, keyId, USER);

  mocks.getUserKey.mockResolvedValue({ userId: USER, state: "active" });
  const accepted = await resolveBodyInput(USER, { body: sealed, barCount: 3 });

  // Whatever the policy accepted is what the row would hold, verbatim.
  return accepted.body;
}

describe("a verse written by a browser holding a passphrase", () => {
  it("survives the whole trip and never becomes readable on the server", async () => {
    const account = await enable();
    const stored = await storedVerse(account.raw, account.keyId, VERSE);

    // In the database, and read back by the server as it would be for a page.
    expect(stored).not.toContain("pawn shop");
    const read = readStoredBody(stored, USER);
    expect(read.kind).toBe("sealed");
    expect(read.body).toBe(stored);

    // Back in a browser, after unlocking with the passphrase from scratch.
    const wrapping = await deriveWrappingKey(PASSPHRASE, account.salt, FAST);
    const raw = await unwrapDataKey(account.wrappedByPassphrase, wrapping, USER);
    const key = await importDataKey(raw);

    expect(await openUserSealed(read.body, key, USER)).toBe(VERSE);
  });

  it("opens with the recovery code when the passphrase is gone", async () => {
    const account = await enable();
    const stored = await storedVerse(account.raw, account.keyId, VERSE);

    const wrapping = await deriveWrappingKey(account.recoveryCode, account.recoverySalt, FAST);
    const raw = await unwrapDataKey(account.wrappedByRecovery, wrapping, USER);

    expect(await openUserSealed(stored, await importDataKey(raw), USER)).toBe(VERSE);
  });

  it("is not readable by another account's passphrase", async () => {
    const mine = await enable();
    const theirs = await enable();
    const stored = await storedVerse(mine.raw, mine.keyId, VERSE);

    const wrapping = await deriveWrappingKey(PASSPHRASE, theirs.salt, FAST);
    const raw = await unwrapDataKey(theirs.wrappedByPassphrase, wrapping, USER);

    await expect(
      openUserSealed(stored, await importDataKey(raw), USER),
    ).rejects.toThrow(/could not be opened/);
  });
});

// Changing the passphrase must not touch the data key, or every verse already
// sealed would stop opening.
describe("changing the passphrase", () => {
  it("leaves every sealed verse readable", async () => {
    const account = await enable();
    const stored = await storedVerse(account.raw, account.keyId, VERSE);

    const currentWrapping = await deriveWrappingKey(PASSPHRASE, account.salt, FAST);
    const raw = await unwrapDataKey(account.wrappedByPassphrase, currentWrapping, USER);

    const salt = generateSalt();
    const rewrapped = await wrapDataKey(
      raw,
      await deriveWrappingKey("an entirely different one", salt, FAST),
      USER,
    );

    const next = await unwrapDataKey(
      rewrapped,
      await deriveWrappingKey("an entirely different one", salt, FAST),
      USER,
    );

    expect(await openUserSealed(stored, await importDataKey(next), USER)).toBe(VERSE);
    // And the recovery code, untouched by the change, still works.
    const recoveryRaw = await unwrapDataKey(
      account.wrappedByRecovery,
      await deriveWrappingKey(account.recoveryCode, account.recoverySalt, FAST),
      USER,
    );
    expect(await openUserSealed(stored, await importDataKey(recoveryRaw), USER)).toBe(VERSE);
  });
});

// Turning the setting off has to end with verses the server can read again -
// otherwise deleting the key record would strand them permanently.
describe("turning the passphrase off", () => {
  it("hands back writing the server can store and read", async () => {
    const account = await enable();
    const stored = await storedVerse(account.raw, account.keyId, VERSE);

    const key = await importDataKey(account.raw);
    const opened = await openUserSealed(stored, key, USER);

    mocks.getUserKey.mockResolvedValue({ userId: USER, state: "unsealing" });
    const accepted = await resolveBodyInput(USER, { body: opened });
    expect(accepted).toEqual({ sealed: false, body: VERSE });
  });
});
