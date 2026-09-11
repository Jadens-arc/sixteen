import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Envelope encryption for verse bodies.
 *
 * Everything a person writes here is theirs, and a database dump - a Neon
 * snapshot, a leaked connection string, a support engineer with read access -
 * should not be sixteen bars of somebody's unreleased writing. So the body
 * column holds ciphertext and the key lives only in the application's
 * environment, never in the database.
 *
 * Three rules shape the format, and all three come from the same worry: an
 * encrypted verse that cannot be read is a lost verse.
 *
 * 1. Stored values say what they are. An encrypted body carries a versioned
 *    prefix, so a plaintext body written before this existed - or written
 *    while no key was configured - is recognised as plaintext and returned
 *    untouched. Nothing has to be migrated for the old writing to keep
 *    opening.
 * 2. The key that wrote a body is named in it. A short, non-reversible key id
 *    lets a rotation keep reading what the previous key wrote, and turns a
 *    wrong key into an error that says which key is missing instead of a
 *    generic failure.
 * 3. A body that cannot be decrypted throws. It never degrades to a
 *    placeholder: a placeholder would reach the pad, and the pad autosaves -
 *    the row would be overwritten with the stand-in and the verse really
 *    would be gone. Failing loudly leaves the ciphertext on disk, intact,
 *    for whoever finds the key again.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

// Marks a stored body as an envelope this module wrote. Bumping the version
// means a new format; the reader below dispatches on it, so old rows keep
// being readable by the code that understands them.
const NAMESPACE = "sixteen";
const VERSION = "v1";
const ENVELOPE_PREFIX = `${NAMESPACE}.${VERSION}.`;

const PRIMARY_ENV = "VERSE_ENCRYPTION_KEY";
const PREVIOUS_ENV = "VERSE_ENCRYPTION_KEY_PREVIOUS";

interface VerseKey {
  /** Short, non-reversible fingerprint, stored in the envelope. */
  id: string;
  bytes: Buffer;
}

interface KeyRing {
  /** What new writes are encrypted with. Undefined when no key is configured. */
  primary: VerseKey | undefined;
  /** Every key that may decrypt, newest first. */
  all: VerseKey[];
}

function decodeKey(raw: string, name: string): Buffer {
  const trimmed = raw.trim();
  // Hex is what `openssl rand -hex 32` prints and base64 is what
  // `openssl rand -base64 32` prints; both are things a person reasonably
  // pastes in, and guessing wrong would fail the length check below with a
  // byte count that explains nothing.
  const bytes = /^[0-9a-f]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");

  if (bytes.length !== KEY_BYTES) {
    throw new Error(
      `${name} must be a ${KEY_BYTES}-byte key: ${KEY_BYTES * 2} hex characters, ` +
        `or base64 from \`openssl rand -base64 ${KEY_BYTES}\`. ` +
        `The value set decodes to ${bytes.length} bytes.`,
    );
  }

  return bytes;
}

// A hash rather than the key itself, and domain-separated so the id is not a
// prefix of the plain SHA-256 of the key material. Six bytes is enough to tell
// a handful of keys apart and short enough to keep the envelope readable.
//
// Hex rather than base64url on purpose: this id is quoted in the error a
// missing key raises, and SetupNotice reads that message for the name of an
// environment variable to point at. A base64url id can look like one
// (`AB_CDEFG`); lowercase hex cannot.
function keyId(bytes: Buffer): string {
  return createHash("sha256")
    .update(`${NAMESPACE}.key-id.`)
    .update(bytes)
    .digest("hex")
    .slice(0, 12);
}

function toKey(raw: string | undefined, name: string): VerseKey | undefined {
  if (!raw || raw.trim().length === 0) return undefined;
  const bytes = decodeKey(raw, name);
  return { id: keyId(bytes), bytes };
}

// Keyed by the raw environment values, so a test (or a reloaded process) that
// changes a key gets a fresh ring without anything having to remember to
// invalidate a cache.
let cached: { primaryRaw?: string; previousRaw?: string; ring: KeyRing } | undefined;

function keyRing(): KeyRing {
  const primaryRaw = process.env[PRIMARY_ENV];
  const previousRaw = process.env[PREVIOUS_ENV];

  if (cached && cached.primaryRaw === primaryRaw && cached.previousRaw === previousRaw) {
    return cached.ring;
  }

  const primary = toKey(primaryRaw, PRIMARY_ENV);
  const previous = toKey(previousRaw, PREVIOUS_ENV);

  const all: VerseKey[] = [];
  for (const key of [primary, previous]) {
    if (key && !all.some((existing) => existing.id === key.id)) all.push(key);
  }

  cached = { primaryRaw, previousRaw, ring: { primary, all } };
  return cached.ring;
}

/**
 * Whether new writes will be encrypted. False is a supported state, not a
 * broken one: the app is meant to deploy before its environment is filled in,
 * and it stores plaintext until a key exists.
 */
export function verseEncryptionEnabled(): boolean {
  return keyRing().primary !== undefined;
}

/**
 * Binds a ciphertext to its owner. A verse lifted from one row and pasted into
 * another user's row fails to authenticate rather than decrypting into
 * somebody else's notebook.
 */
function additionalData(userId: string): Buffer {
  return Buffer.from(`${NAMESPACE}.${VERSION}.user:${userId}`, "utf8");
}

interface Envelope {
  keyId: string;
  iv: Buffer;
  payload: Buffer;
}

// Structural, not trusting: a plaintext verse that happens to open with the
// prefix (someone writing about this very format) fails to parse and is
// returned as the plaintext it is. Only a well-formed envelope is treated as
// one, and from there a failure is a real failure worth raising.
function parseEnvelope(stored: string): Envelope | null {
  if (!stored.startsWith(ENVELOPE_PREFIX)) return null;

  const parts = stored.split(".");
  if (parts.length !== 5) return null;

  const [, , id, ivPart, payloadPart] = parts;
  if (id.length === 0 || ivPart.length === 0 || payloadPart.length === 0) return null;

  const iv = Buffer.from(ivPart, "base64url");
  const payload = Buffer.from(payloadPart, "base64url");
  // The payload is ciphertext followed by the 16-byte GCM tag, so anything at
  // or under the tag length cannot be one.
  if (iv.length !== IV_BYTES || payload.length <= 16) return null;

  return { keyId: id, iv, payload };
}

/** True when a stored value is an envelope rather than a plaintext body. */
export function isEncryptedVerseBody(stored: string): boolean {
  return parseEnvelope(stored) !== null;
}

/**
 * Encrypts a body for storage, or returns it unchanged when no key is
 * configured. An empty body stays empty - there is nothing in it to protect,
 * and the notebook leans on an emptied verse still reading as empty.
 */
export function encryptVerseBody(body: string, userId: string): string {
  if (body.length === 0) return body;

  const { primary } = keyRing();
  if (!primary) return body;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, primary.bytes, iv);
  cipher.setAAD(additionalData(userId));

  const ciphertext = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  const payload = Buffer.concat([ciphertext, cipher.getAuthTag()]);

  return [
    NAMESPACE,
    VERSION,
    primary.id,
    iv.toString("base64url"),
    payload.toString("base64url"),
  ].join(".");
}

/**
 * Reads a stored body back. Plaintext - anything written before encryption was
 * turned on - passes straight through, which is what keeps every verse already
 * in the database readable.
 *
 * Throws when a body is encrypted and this process cannot decrypt it. See the
 * third rule at the top of this file: the row is fine, the key is the problem,
 * and saying so is the only honest way to keep the verse.
 */
export function decryptVerseBody(stored: string, userId: string): string {
  const envelope = parseEnvelope(stored);
  if (!envelope) return stored;

  const { all } = keyRing();
  const key = all.find((candidate) => candidate.id === envelope.keyId);
  if (!key) {
    throw new Error(
      `This verse was encrypted with key ${envelope.keyId}, which is not configured. ` +
        `Set that key as ${PRIMARY_ENV} (or ${PREVIOUS_ENV} while rotating). ` +
        "The stored verse is intact and untouched.",
    );
  }

  try {
    const tagAt = envelope.payload.length - 16;
    const decipher = createDecipheriv(ALGORITHM, key.bytes, envelope.iv);
    decipher.setAAD(additionalData(userId));
    decipher.setAuthTag(envelope.payload.subarray(tagAt));

    return Buffer.concat([
      decipher.update(envelope.payload.subarray(0, tagAt)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Naming the variable, not just the key id, so the setup notice this
    // surfaces through has something to tell the reader to go and fix.
    throw new Error(
      `This verse could not be decrypted with key ${envelope.keyId}. Either ` +
        `${PRIMARY_ENV} is not the key that wrote it, or the stored value has ` +
        "been altered. The stored verse is intact and untouched.",
    );
  }
}
