import { describe, expect, it } from "vitest";

import {
  dataKeyId,
  deriveWrappingKey,
  generateDataKey,
  generateRecoveryCode,
  generateSalt,
  importDataKey,
  looksLikeRecoveryCode,
  normalizeRecoveryCode,
  openUserSealed,
  sealWithUserKey,
  unwrapDataKey,
  wrapDataKey,
} from "@/lib/crypto/client";
import { isUserSealed, parseBody } from "@/lib/crypto/envelope";
import { readStoredBody } from "@/lib/crypto/server";

const USER = "user_1";
const VERSE = "cold open in the pawn shop\nsecond bar\nthird bar";

// The real derivation is 600k PBKDF2 rounds, which is the point of it and far
// too slow to do in every test. The count is a parameter precisely so it can
// be turned down here without changing the code under test.
const FAST = 1_000;

async function keyFor(raw: Uint8Array) {
  return { key: await importDataKey(raw), keyId: await dataKeyId(raw) };
}

describe("sealing a verse in the browser", () => {
  it("round-trips it", async () => {
    const raw = generateDataKey();
    const { key, keyId } = await keyFor(raw);

    const stored = await sealWithUserKey(VERSE, key, keyId, USER);
    expect(stored).not.toContain("pawn shop");
    expect(isUserSealed(stored)).toBe(true);
    expect(await openUserSealed(stored, key, USER)).toBe(VERSE);
  });

  it("keeps every line, unicode included", async () => {
    const raw = generateDataKey();
    const { key, keyId } = await keyFor(raw);
    const body = "bar one\n\nbar two - 50% up\nemoji \u{1f525}\ntrailing\n";

    const stored = await sealWithUserKey(body, key, keyId, USER);
    expect(await openUserSealed(stored, key, USER)).toBe(body);
  });

  it("writes a different ciphertext every time", async () => {
    const raw = generateDataKey();
    const { key, keyId } = await keyFor(raw);

    const first = await sealWithUserKey(VERSE, key, keyId, USER);
    const second = await sealWithUserKey(VERSE, key, keyId, USER);
    expect(first).not.toBe(second);
  });

  it("leaves an empty verse empty", async () => {
    const raw = generateDataKey();
    const { key, keyId } = await keyFor(raw);
    expect(await sealWithUserKey("", key, keyId, USER)).toBe("");
  });

  it("refuses to open one person's verse as another's", async () => {
    const raw = generateDataKey();
    const { key, keyId } = await keyFor(raw);
    const stored = await sealWithUserKey(VERSE, key, keyId, USER);

    await expect(openUserSealed(stored, key, "user_2")).rejects.toThrow(/could not be opened/);
  });

  it("refuses another key's verse rather than returning noise", async () => {
    const mine = await keyFor(generateDataKey());
    const theirs = await keyFor(generateDataKey());
    const stored = await sealWithUserKey(VERSE, mine.key, mine.keyId, USER);

    await expect(openUserSealed(stored, theirs.key, USER)).rejects.toThrow(
      /could not be opened/,
    );
  });

  it("passes a verse it did not seal straight through", async () => {
    const { key } = await keyFor(generateDataKey());
    // Plaintext and server-sealed bodies both turn up during a conversion.
    expect(await openUserSealed(VERSE, key, USER)).toBe(VERSE);
  });

  it("names the key it used, so a replaced one says so", async () => {
    const raw = generateDataKey();
    const { key, keyId } = await keyFor(raw);
    const stored = await sealWithUserKey(VERSE, key, keyId, USER);

    const parsed = parseBody(stored);
    expect(parsed.kind === "sealed" && parsed.keyId).toBe(keyId);
    expect(keyId).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("the data key the server holds", () => {
  it("is useless without the passphrase", async () => {
    const raw = generateDataKey();
    const salt = generateSalt();
    const wrapping = await deriveWrappingKey("a long enough passphrase", salt, FAST);
    const wrapped = await wrapDataKey(raw, wrapping, USER);

    expect(wrapped).not.toContain(Buffer.from(raw).toString("base64").slice(0, 8));

    const wrong = await deriveWrappingKey("not the passphrase", salt, FAST);
    await expect(unwrapDataKey(wrapped, wrong, USER)).rejects.toThrow(/not right/);
  });

  it("comes back intact with the passphrase", async () => {
    const raw = generateDataKey();
    const salt = generateSalt();
    const wrapping = await deriveWrappingKey("a long enough passphrase", salt, FAST);

    const wrapped = await wrapDataKey(raw, wrapping, USER);
    const again = await deriveWrappingKey("a long enough passphrase", salt, FAST);

    expect(Array.from(await unwrapDataKey(wrapped, again, USER))).toEqual(Array.from(raw));
  });

  it("will not unwrap into a different account", async () => {
    const raw = generateDataKey();
    const salt = generateSalt();
    const wrapping = await deriveWrappingKey("a long enough passphrase", salt, FAST);
    const wrapped = await wrapDataKey(raw, wrapping, USER);

    await expect(unwrapDataKey(wrapped, wrapping, "user_2")).rejects.toThrow();
  });

  it("opens with the recovery code as well, through its own salt", async () => {
    const raw = generateDataKey();
    const code = generateRecoveryCode();

    const recoverySalt = generateSalt();
    const wrapping = await deriveWrappingKey(code, recoverySalt, FAST);
    const wrapped = await wrapDataKey(raw, wrapping, USER);

    const again = await deriveWrappingKey(code, recoverySalt, FAST);
    expect(Array.from(await unwrapDataKey(wrapped, again, USER))).toEqual(Array.from(raw));
  });
});

describe("the recovery code", () => {
  it("is five groups of five from an unambiguous alphabet", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){4}$/);
    expect(looksLikeRecoveryCode(code)).toBe(true);
  });

  it("is different every time", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRecoveryCode()));
    expect(codes.size).toBe(20);
  });

  it("reads back however it was typed", () => {
    const code = generateRecoveryCode();
    const typed = code.toLowerCase().replace(/-/g, " ");
    expect(normalizeRecoveryCode(typed)).toBe(code);
  });

  // The alphabet already leaves out I, O, 0 and 1, so a code can contain an L
  // and folding letters onto digits would corrupt a code typed correctly.
  it("does not rewrite the characters it does use", () => {
    expect(normalizeRecoveryCode("LLLLL-LLLLL")).toBe("LLLLL-LLLLL");
  });

  it("knows a code of the wrong length when it sees one", () => {
    expect(looksLikeRecoveryCode("ABCDE")).toBe(false);
    expect(looksLikeRecoveryCode("")).toBe(false);
  });
});

// The two halves run in different places, on different crypto APIs. They agree
// on the format or an account that turns the passphrase on stops being able to
// read its own verses, so this is the seam most worth pinning down.
describe("the server and the browser agree on the format", () => {
  it("hands a browser-sealed verse back untouched rather than opening it", async () => {
    const raw = generateDataKey();
    const { key, keyId } = await keyFor(raw);
    const stored = await sealWithUserKey(VERSE, key, keyId, USER);

    process.env.VERSE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    try {
      const read = readStoredBody(stored, USER);
      expect(read.kind).toBe("sealed");
      expect(read.body).toBe(stored);
      // And the browser can still open exactly what the server passed on.
      expect(await openUserSealed(read.body, key, USER)).toBe(VERSE);
    } finally {
      delete process.env.VERSE_ENCRYPTION_KEY;
    }
  });
});
