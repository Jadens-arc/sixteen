import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  decryptVerseBody,
  encryptVerseBody,
  isEncryptedVerseBody,
  verseEncryptionEnabled,
} from "@/lib/verse-crypto";

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

beforeEach(() => configure(KEY_A));
afterEach(() => configure());

describe("with a key configured", () => {
  it("reports that new writes are encrypted", () => {
    expect(verseEncryptionEnabled()).toBe(true);
  });

  it("round-trips a verse", () => {
    const stored = encryptVerseBody(VERSE, USER);
    expect(stored).not.toContain("pawn shop");
    expect(decryptVerseBody(stored, USER)).toBe(VERSE);
  });

  it("keeps every line, unicode included", () => {
    const body = "bar one\n\nbar two - 50% up\nemoji \u{1f525}\ntrailing\n";
    expect(decryptVerseBody(encryptVerseBody(body, USER), USER)).toBe(body);
  });

  it("writes a different ciphertext every time", () => {
    const first = encryptVerseBody(VERSE, USER);
    const second = encryptVerseBody(VERSE, USER);
    expect(first).not.toBe(second);
    expect(decryptVerseBody(second, USER)).toBe(VERSE);
  });

  it("leaves an empty verse empty", () => {
    expect(encryptVerseBody("", USER)).toBe("");
    expect(isEncryptedVerseBody("")).toBe(false);
    expect(decryptVerseBody("", USER)).toBe("");
  });

  it("marks what it wrote as encrypted", () => {
    expect(isEncryptedVerseBody(encryptVerseBody(VERSE, USER))).toBe(true);
  });

  it("refuses to open one person's verse as another's", () => {
    const stored = encryptVerseBody(VERSE, USER);
    expect(() => decryptVerseBody(stored, "user_2")).toThrow(/could not be decrypted/);
  });

  it("refuses a body that has been tampered with", () => {
    const stored = encryptVerseBody(VERSE, USER);
    const flipped = `${stored.slice(0, -2)}${stored.at(-2) === "A" ? "B" : "A"}${stored.at(-1)}`;
    expect(() => decryptVerseBody(flipped, USER)).toThrow(/could not be decrypted/);
  });
});

describe("with no key configured", () => {
  beforeEach(() => configure());

  it("stores the verse as it was written", () => {
    expect(verseEncryptionEnabled()).toBe(false);
    expect(encryptVerseBody(VERSE, USER)).toBe(VERSE);
  });

  it("still reads back a plaintext verse", () => {
    expect(decryptVerseBody(VERSE, USER)).toBe(VERSE);
  });

  it("says which key an encrypted verse needs rather than losing it", () => {
    configure(KEY_A);
    const stored = encryptVerseBody(VERSE, USER);
    configure();

    expect(() => decryptVerseBody(stored, USER)).toThrow(/is not configured/);
    expect(() => decryptVerseBody(stored, USER)).toThrow(/intact and untouched/);
  });
});

// The whole point of the envelope: a database full of verses written before
// any of this existed keeps opening, with nothing migrated and nothing lost.
describe("verses written before encryption", () => {
  it("reads back untouched", () => {
    expect(decryptVerseBody(VERSE, USER)).toBe(VERSE);
    expect(isEncryptedVerseBody(VERSE)).toBe(false);
  });

  it("is not mistaken for an envelope by a verse that writes about one", () => {
    const body = "sixteen.v1. is how the ciphertext starts, and then";
    expect(isEncryptedVerseBody(body)).toBe(false);
    expect(decryptVerseBody(body, USER)).toBe(body);
  });

  it("becomes encrypted the next time it is saved", () => {
    const stored = encryptVerseBody(decryptVerseBody(VERSE, USER), USER);
    expect(isEncryptedVerseBody(stored)).toBe(true);
    expect(decryptVerseBody(stored, USER)).toBe(VERSE);
  });
});

describe("rotating the key", () => {
  it("reads what the previous key wrote and writes with the new one", () => {
    const old = encryptVerseBody(VERSE, USER);

    configure(KEY_B, KEY_A);
    expect(decryptVerseBody(old, USER)).toBe(VERSE);

    const rewritten = encryptVerseBody(VERSE, USER);
    expect(rewritten).not.toBe(old);

    // The new key alone still opens what it wrote; the old verse now needs
    // the previous key, which is why it is named in the envelope.
    configure(KEY_B);
    expect(decryptVerseBody(rewritten, USER)).toBe(VERSE);
    expect(() => decryptVerseBody(old, USER)).toThrow(/is not configured/);
  });

  it("does not mind the same key being set twice", () => {
    configure(KEY_A, KEY_A);
    expect(decryptVerseBody(encryptVerseBody(VERSE, USER), USER)).toBe(VERSE);
  });
});

describe("a malformed key", () => {
  it("is refused with the length it decoded to", () => {
    configure("too-short");
    expect(() => encryptVerseBody(VERSE, USER)).toThrow(/VERSE_ENCRYPTION_KEY must be a 32-byte key/);
  });

  it("is accepted as hex as well as base64", () => {
    const hex = randomBytes(32).toString("hex");
    configure(hex);
    expect(verseEncryptionEnabled()).toBe(true);
    expect(decryptVerseBody(encryptVerseBody(VERSE, USER), USER)).toBe(VERSE);
  });

  it("is ignored when it is blank, rather than half-configuring the app", () => {
    configure("   ");
    expect(verseEncryptionEnabled()).toBe(false);
  });
});

describe("the key id in an envelope", () => {
  it("cannot be mistaken for the name of an environment variable", () => {
    // SetupNotice turns a failed read into "Set <VAR> in your environment" by
    // finding the first SCREAMING_SNAKE name in the message, and the key id is
    // quoted in that message ahead of the variable it means to name.
    const envVarPattern = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;

    const stored = encryptVerseBody(VERSE, USER);
    const keyId = stored.split(".")[2];
    expect(keyId).toMatch(/^[0-9a-f]{12}$/);

    configure();
    const message = (() => {
      try {
        decryptVerseBody(stored, USER);
        return "";
      } catch (error) {
        return (error as Error).message;
      }
    })();

    expect(message.match(envVarPattern)?.[0]).toBe("VERSE_ENCRYPTION_KEY");
  });
});
