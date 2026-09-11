import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isSealed, isUserSealed } from "@/lib/crypto/envelope";
import {
  readStoredBody,
  sealWithServerKey,
  serverEncryptionEnabled,
} from "@/lib/crypto/server";

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");

const USER = "user_1";
const VERSE = "first bar\nsecond bar about a pawn shop\nthird bar";

function configure(primary?: string, previous?: string) {
  if (primary === undefined) delete process.env.VERSE_ENCRYPTION_KEY;
  else process.env.VERSE_ENCRYPTION_KEY = primary;

  if (previous === undefined) delete process.env.VERSE_ENCRYPTION_KEY_PREVIOUS;
  else process.env.VERSE_ENCRYPTION_KEY_PREVIOUS = previous;
}

function open(stored: string, userId = USER): string {
  const read = readStoredBody(stored, userId);
  if (read.kind !== "plaintext") throw new Error(`Expected plaintext, got ${read.kind}`);
  return read.body;
}

beforeEach(() => configure(KEY_A));
afterEach(() => configure());

describe("with a key configured", () => {
  it("reports that new writes are sealed", () => {
    expect(serverEncryptionEnabled()).toBe(true);
  });

  it("round-trips a verse", () => {
    const stored = sealWithServerKey(VERSE, USER);
    expect(stored).not.toContain("pawn shop");
    expect(open(stored)).toBe(VERSE);
  });

  it("keeps every line, unicode included", () => {
    const body = "bar one\n\nbar two - 50% up\nemoji \u{1f525}\ntrailing\n";
    expect(open(sealWithServerKey(body, USER))).toBe(body);
  });

  it("writes a different ciphertext every time", () => {
    const first = sealWithServerKey(VERSE, USER);
    const second = sealWithServerKey(VERSE, USER);
    expect(first).not.toBe(second);
    expect(open(second)).toBe(VERSE);
  });

  it("leaves an empty verse empty", () => {
    expect(sealWithServerKey("", USER)).toBe("");
    expect(isSealed("")).toBe(false);
    expect(open("")).toBe("");
  });

  it("refuses to open one person's verse as another's", () => {
    const stored = sealWithServerKey(VERSE, USER);
    expect(() => readStoredBody(stored, "user_2")).toThrow(/could not be decrypted/);
  });

  it("refuses a body that has been tampered with", () => {
    const stored = sealWithServerKey(VERSE, USER);
    const flipped = `${stored.slice(0, -2)}${stored.at(-2) === "A" ? "B" : "A"}${stored.at(-1)}`;
    expect(() => readStoredBody(flipped, USER)).toThrow(/could not be decrypted/);
  });
});

describe("with no key configured", () => {
  beforeEach(() => configure());

  it("stores the verse as it was written", () => {
    expect(serverEncryptionEnabled()).toBe(false);
    expect(sealWithServerKey(VERSE, USER)).toBe(VERSE);
  });

  it("says which key a sealed verse needs rather than losing it", () => {
    configure(KEY_A);
    const stored = sealWithServerKey(VERSE, USER);
    configure();

    expect(() => readStoredBody(stored, USER)).toThrow(/is not configured/);
    expect(() => readStoredBody(stored, USER)).toThrow(/intact and untouched/);
  });
});

// The whole point of the envelope: a database full of verses written before
// any of this existed keeps opening, with nothing migrated and nothing lost.
describe("verses written before encryption", () => {
  it("reads back untouched", () => {
    expect(open(VERSE)).toBe(VERSE);
    expect(isSealed(VERSE)).toBe(false);
  });

  it("is not mistaken for an envelope by a verse that writes about one", () => {
    const body = "sixteen.v1. is how the ciphertext starts, and then";
    expect(isSealed(body)).toBe(false);
    expect(open(body)).toBe(body);
  });

  it("becomes sealed the next time it is saved", () => {
    const stored = sealWithServerKey(open(VERSE), USER);
    expect(isSealed(stored)).toBe(true);
    expect(open(stored)).toBe(VERSE);
  });
});

describe("a verse sealed in somebody's browser", () => {
  // Built by hand rather than with the client module, so this test says what
  // the server does with a v2 body without depending on how one is made.
  const userSealed = `sixteen.v2.abcdef012345.${"A".repeat(16)}.${"B".repeat(48)}`;

  it("is handed on still sealed rather than opened or guessed at", () => {
    const read = readStoredBody(userSealed, USER);
    expect(read.kind).toBe("sealed");
    expect(read.body).toBe(userSealed);
    expect(isUserSealed(userSealed)).toBe(true);
  });

  it("is never mistaken for writing", () => {
    expect(() => open(userSealed)).toThrow(/Expected plaintext/);
  });
});

// The failure this format is built to avoid: a body from a newer build read as
// though it were plaintext, rendered into a pad, and autosaved over.
describe("a body from a format this build does not know", () => {
  const future = `sixteen.v9.abcdef012345.${"A".repeat(16)}.${"B".repeat(48)}`;

  it("throws rather than passing ciphertext off as a verse", () => {
    expect(() => readStoredBody(future, USER)).toThrow(/v9 format/);
    expect(() => readStoredBody(future, USER)).toThrow(/left exactly as it is/);
  });
});

describe("rotating the key", () => {
  it("reads what the previous key wrote and writes with the new one", () => {
    const old = sealWithServerKey(VERSE, USER);

    configure(KEY_B, KEY_A);
    expect(open(old)).toBe(VERSE);

    const rewritten = sealWithServerKey(VERSE, USER);
    expect(rewritten).not.toBe(old);

    // The new key alone still opens what it wrote; the old verse now needs
    // the previous key, which is why it is named in the envelope.
    configure(KEY_B);
    expect(open(rewritten)).toBe(VERSE);
    expect(() => readStoredBody(old, USER)).toThrow(/is not configured/);
  });

  it("does not mind the same key being set twice", () => {
    configure(KEY_A, KEY_A);
    expect(open(sealWithServerKey(VERSE, USER))).toBe(VERSE);
  });
});

describe("a malformed key", () => {
  it("is refused with the length it decoded to", () => {
    configure("too-short");
    expect(() => sealWithServerKey(VERSE, USER)).toThrow(
      /VERSE_ENCRYPTION_KEY must be a 32-byte key/,
    );
  });

  it("is accepted as hex as well as base64", () => {
    configure(randomBytes(32).toString("hex"));
    expect(serverEncryptionEnabled()).toBe(true);
    expect(open(sealWithServerKey(VERSE, USER))).toBe(VERSE);
  });

  it("is ignored when it is blank, rather than half-configuring the app", () => {
    configure("   ");
    expect(serverEncryptionEnabled()).toBe(false);
  });
});

describe("the key id in an envelope", () => {
  it("cannot be mistaken for the name of an environment variable", () => {
    // SetupNotice turns a failed read into "Set <VAR> in your environment" by
    // finding the first SCREAMING_SNAKE name in the message, and the key id is
    // quoted in that message ahead of the variable it means to name.
    const envVarPattern = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;

    const stored = sealWithServerKey(VERSE, USER);
    expect(stored.split(".")[2]).toMatch(/^[0-9a-f]{12}$/);

    configure();
    let message = "";
    try {
      readStoredBody(stored, USER);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message.match(envVarPattern)?.[0]).toBe("VERSE_ENCRYPTION_KEY");
  });
});
