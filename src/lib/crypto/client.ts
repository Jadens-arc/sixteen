import {
  IV_BYTES,
  KEY_BYTES,
  USER_VERSION,
  additionalData,
  formatEnvelope,
  fromBase64Url,
  parseBody,
  splitPayload,
  toBase64Url,
} from "./envelope";

/**
 * The browser's half of the encryption: a key derived from a passphrase the
 * server never sees, which seals the verses of anyone who turns the setting
 * on. This is the only design here that can honestly say nobody but the
 * writer can read their writing - and the only one where a forgotten
 * passphrase means the writing is gone, which is why nothing in this file
 * runs until a recovery code has been written down and typed back.
 *
 * The passphrase does not encrypt verses directly. It derives a wrapping key,
 * and that wrapping key encrypts a random data key which is what verses are
 * actually sealed with. Two things follow, both of which matter more than the
 * indirection costs:
 *
 *   - changing the passphrase rewraps one small value instead of re-encrypting
 *     every verse
 *   - the same data key can be wrapped a second time under a recovery code, so
 *     there is exactly one way back in that does not depend on memory
 */

const KDF = "PBKDF2-SHA256";
// OWASP's floor for PBKDF2-SHA256 at the time of writing. Argon2id would be
// the better choice against GPU cracking, but it costs a wasm dependency and
// this is one derivation per unlock, not per request.
const ITERATIONS = 600_000;
const SALT_BYTES = 16;

// No I, O, 0 or 1: this is read off a screen and typed back by hand, often
// from a photo or a piece of paper.
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECOVERY_GROUPS = 5;
const RECOVERY_GROUP_SIZE = 5;

export const KDF_NAME = KDF;
export const KDF_ITERATIONS = ITERATIONS;

function subtle(): SubtleCrypto {
  const available = globalThis.crypto?.subtle;
  if (!available) {
    throw new Error(
      "This browser does not support the Web Crypto API, which a passphrase " +
        "needs. Your verses have not been changed.",
    );
  }
  return available;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** The bytes a key is stored and transported as, never the key object. */
export type RawKey = Uint8Array;

export function generateSalt(): string {
  return toBase64Url(randomBytes(SALT_BYTES));
}

export function generateDataKey(): RawKey {
  return randomBytes(KEY_BYTES);
}

/**
 * Imports raw bytes as a key that can seal and open verses but can never be
 * read back out. Stored in the browser this way, an XSS can use the key while
 * the tab is open but cannot copy it out to use later somewhere else.
 */
export async function importDataKey(raw: RawKey): Promise<CryptoKey> {
  return subtle().importKey("raw", raw as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Same short fingerprint the server uses, so an envelope reads the same way. */
export async function dataKeyId(raw: RawKey): Promise<string> {
  const labelled = new TextEncoder().encode("sixteen.key-id.");
  const input = new Uint8Array(labelled.length + raw.length);
  input.set(labelled);
  input.set(raw, labelled.length);

  const digest = new Uint8Array(await subtle().digest("SHA-256", input as BufferSource));
  return Array.from(digest.subarray(0, 6))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Turns something a person remembers - or a recovery code they wrote down -
 * into the key that unwraps their data key. Slow on purpose.
 */
export async function deriveWrappingKey(
  secret: string,
  salt: string,
  iterations = ITERATIONS,
): Promise<CryptoKey> {
  const saltBytes = fromBase64Url(salt);
  if (!saltBytes) throw new Error("This account's encryption settings are unreadable.");

  const material = await subtle().importKey(
    "raw",
    new TextEncoder().encode(secret) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return subtle().deriveKey(
    { name: "PBKDF2", salt: saltBytes as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function wrapAad(userId: string): Uint8Array {
  return new TextEncoder().encode(`sixteen.wrap.user:${userId}`);
}

/** Encrypts the data key for storage. The server keeps this and cannot open it. */
export async function wrapDataKey(
  raw: RawKey,
  wrappingKey: CryptoKey,
  userId: string,
): Promise<string> {
  const iv = randomBytes(IV_BYTES);
  const sealed = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: wrapAad(userId) as BufferSource },
      wrappingKey,
      raw as BufferSource,
    ),
  );

  return `${toBase64Url(iv)}.${toBase64Url(sealed)}`;
}

/**
 * Recovers the data key. A wrong passphrase fails here, at one cheap
 * authenticated decryption, rather than by producing a key that turns every
 * verse into noise.
 */
export async function unwrapDataKey(
  wrapped: string,
  wrappingKey: CryptoKey,
  userId: string,
): Promise<RawKey> {
  const [ivPart, sealedPart] = wrapped.split(".");
  const iv = ivPart ? fromBase64Url(ivPart) : null;
  const sealed = sealedPart ? fromBase64Url(sealedPart) : null;
  if (!iv || !sealed) throw new Error("This account's encryption settings are unreadable.");

  try {
    const raw = new Uint8Array(
      await subtle().decrypt(
        { name: "AES-GCM", iv: iv as BufferSource, additionalData: wrapAad(userId) as BufferSource },
        wrappingKey,
        sealed as BufferSource,
      ),
    );
    return raw;
  } catch {
    throw new Error("That passphrase is not right.");
  }
}

/** Seals a verse so that only this browser, holding this key, can open it. */
export async function sealWithUserKey(
  body: string,
  key: CryptoKey,
  keyId: string,
  userId: string,
): Promise<string> {
  if (body.length === 0) return body;

  const iv = randomBytes(IV_BYTES);
  const payload = new Uint8Array(
    await subtle().encrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
        additionalData: additionalData(USER_VERSION, userId) as BufferSource,
      },
      key,
      new TextEncoder().encode(body) as BufferSource,
    ),
  );

  return formatEnvelope({ version: USER_VERSION, keyId, iv, payload });
}

/**
 * Opens a verse. Plaintext and server-sealed bodies are not this function's
 * business - during a conversion an account holds a mixture - so anything that
 * is not sealed with a user key comes back as it arrived.
 */
export async function openUserSealed(
  stored: string,
  key: CryptoKey,
  userId: string,
): Promise<string> {
  const parsed = parseBody(stored);
  if (parsed.kind !== "sealed" || parsed.version !== USER_VERSION) return stored;

  // WebCrypto wants the tag appended to the ciphertext, which is how it is
  // stored; splitPayload exists for Node's API, which wants them apart.
  const { ciphertext, tag } = splitPayload(parsed.payload);
  const joined = new Uint8Array(ciphertext.length + tag.length);
  joined.set(ciphertext);
  joined.set(tag, ciphertext.length);

  try {
    const plain = await subtle().decrypt(
      {
        name: "AES-GCM",
        iv: parsed.iv as BufferSource,
        additionalData: additionalData(USER_VERSION, userId) as BufferSource,
      },
      key,
      joined as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error(
      `This verse could not be opened with the key you unlocked with ` +
        `(it names key ${parsed.keyId}). The stored verse is intact and untouched.`,
    );
  }
}

/**
 * The one way back in that does not depend on memory. High entropy by
 * construction - 25 characters of a 32-character alphabet - so it can be the
 * only thing between somebody and their notebook.
 */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_GROUPS * RECOVERY_GROUP_SIZE);
  const characters = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % 32]);

  const groups: string[] = [];
  for (let i = 0; i < RECOVERY_GROUPS; i += 1) {
    groups.push(
      characters.slice(i * RECOVERY_GROUP_SIZE, (i + 1) * RECOVERY_GROUP_SIZE).join(""),
    );
  }

  return groups.join("-");
}

/**
 * Reads a recovery code back the way somebody actually types it: any spacing,
 * any case, dashes or not.
 *
 * Nothing is folded onto anything else. The alphabet already leaves out the
 * characters that get misread - there is no I, O, 0 or 1 in a code - so a
 * "helpful" mapping could only ever corrupt a code that was typed correctly.
 * A wrong code fails where it should, at the unwrap, rather than here.
 */
export function normalizeRecoveryCode(input: string): string {
  const characters = input.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const groups: string[] = [];
  for (let i = 0; i < characters.length; i += RECOVERY_GROUP_SIZE) {
    groups.push(characters.slice(i, i + RECOVERY_GROUP_SIZE));
  }

  return groups.join("-");
}

/** Whether a typed code is even the right shape to try. */
export function looksLikeRecoveryCode(input: string): boolean {
  const characters = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return characters.length === RECOVERY_GROUPS * RECOVERY_GROUP_SIZE;
}
