import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import {
  KEY_BYTES,
  IV_BYTES,
  SERVER_VERSION,
  USER_VERSION,
  additionalData,
  formatEnvelope,
  parseBody,
  splitPayload,
} from "./envelope";

/**
 * The server's half of the encryption: the key in VERSE_ENCRYPTION_KEY, which
 * seals every verse belonging to someone who has not set a passphrase.
 *
 * What this protects against is a database seen without the application: a
 * leaked connection string, a copied Neon branch, a snapshot in the wrong
 * bucket. It does not protect against the application itself, which holds the
 * key by design so that pages can render and searches can run. Somebody who
 * wants a promise stronger than that turns on a passphrase, and their verses
 * move to src/lib/crypto/client.ts - sealed in their browser, opaque here.
 *
 * The rules that keep verses from being lost:
 *
 * 1. Stored values say what they are, so plaintext written before any of this
 *    existed is recognised and returned untouched. Nothing has to be migrated
 *    for old writing to keep opening.
 * 2. A body this process cannot open is never guessed at. It throws, or - for
 *    a verse sealed in somebody's browser - it is handed on still sealed. It
 *    is never returned as though it were writing, because the pads autosave
 *    and would overwrite the verse with whatever they were shown.
 * 3. The key that sealed a body is named in it, so a rotation can keep the
 *    previous key readable and a wrong key produces an error that says which
 *    key is missing.
 */

const ALGORITHM = "aes-256-gcm";

const PRIMARY_ENV = "VERSE_ENCRYPTION_KEY";
const PREVIOUS_ENV = "VERSE_ENCRYPTION_KEY_PREVIOUS";

interface ServerKey {
  id: string;
  bytes: Buffer;
}

interface KeyRing {
  primary: ServerKey | undefined;
  all: ServerKey[];
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
// prefix of the plain SHA-256 of the key material.
//
// Hex rather than base64url on purpose: this id is quoted in the error a
// missing key raises, and SetupNotice reads that message for the name of an
// environment variable to point at. A base64url id can look like one
// (`AB_CDEFG`); lowercase hex cannot.
export function serverKeyId(bytes: Buffer): string {
  return createHash("sha256")
    .update(`sixteen.key-id.`)
    .update(bytes)
    .digest("hex")
    .slice(0, 12);
}

function toKey(raw: string | undefined, name: string): ServerKey | undefined {
  if (!raw || raw.trim().length === 0) return undefined;
  const bytes = decodeKey(raw, name);
  return { id: serverKeyId(bytes), bytes };
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

  const all: ServerKey[] = [];
  for (const key of [primary, previous]) {
    if (key && !all.some((existing) => existing.id === key.id)) all.push(key);
  }

  cached = { primaryRaw, previousRaw, ring: { primary, all } };
  return cached.ring;
}

/**
 * Whether new server-side writes will be sealed. False is a supported state,
 * not a broken one: the app is meant to deploy before its environment is
 * filled in, and it stores plaintext until a key exists.
 */
export function serverEncryptionEnabled(): boolean {
  return keyRing().primary !== undefined;
}

/**
 * Seals a body with the server key, or returns it unchanged when no key is
 * configured. An empty body stays empty - there is nothing in it to protect,
 * and the notebook leans on an emptied verse still reading as empty.
 */
export function sealWithServerKey(body: string, userId: string): string {
  if (body.length === 0) return body;

  const { primary } = keyRing();
  if (!primary) return body;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, primary.bytes, iv);
  cipher.setAAD(additionalData(SERVER_VERSION, userId));

  const ciphertext = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);

  return formatEnvelope({
    version: SERVER_VERSION,
    keyId: primary.id,
    iv: new Uint8Array(iv),
    payload: new Uint8Array(Buffer.concat([ciphertext, cipher.getAuthTag()])),
  });
}

/**
 * What a verse is to the server once it has been read out of the database.
 *
 * `sealed` is not a failure. It is a verse whose owner has a passphrase, and
 * the value carried here is the ciphertext exactly as stored, on its way to
 * the browser that can open it. Everything server-side that wants to read a
 * verse - search, excerpts, the bar count - has to handle this case by doing
 * without, which is the whole point of the setting.
 */
export type StoredBody =
  | { kind: "plaintext"; body: string }
  | { kind: "sealed"; body: string };

/**
 * Reads a stored body as far as this process can.
 *
 * Throws when a body is sealed with a server key this process does not have.
 * The row is fine and the key is the problem, and saying so is the only
 * honest way to keep the verse - see rule 2 at the top of this file.
 */
export function readStoredBody(stored: string, userId: string): StoredBody {
  const parsed = parseBody(stored);

  if (parsed.kind === "plaintext") return { kind: "plaintext", body: stored };

  if (parsed.kind === "unsupported") {
    throw new Error(
      `This verse was written in the ${parsed.version} format, which this ` +
        "version of the app does not understand. It has been left exactly as " +
        "it is; deploying a newer build will read it.",
    );
  }

  // Sealed in the writer's browser. Passed on untouched for it to open.
  if (parsed.version === USER_VERSION) return { kind: "sealed", body: stored };

  const key = keyRing().all.find((candidate) => candidate.id === parsed.keyId);
  if (!key) {
    throw new Error(
      `This verse was encrypted with key ${parsed.keyId}, which is not configured. ` +
        `Set that key as ${PRIMARY_ENV} (or ${PREVIOUS_ENV} while rotating). ` +
        "The stored verse is intact and untouched.",
    );
  }

  try {
    const { ciphertext, tag } = splitPayload(parsed.payload);
    const decipher = createDecipheriv(ALGORITHM, key.bytes, parsed.iv);
    decipher.setAAD(additionalData(SERVER_VERSION, userId));
    decipher.setAuthTag(tag);

    const body = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    );
    return { kind: "plaintext", body };
  } catch {
    // Naming the variable, not just the key id, so the setup notice this
    // surfaces through has something to tell the reader to go and fix.
    throw new Error(
      `This verse could not be decrypted with key ${parsed.keyId}. Either ` +
        `${PRIMARY_ENV} is not the key that wrote it, or the stored value has ` +
        "been altered. The stored verse is intact and untouched.",
    );
  }
}

/**
 * The plaintext, or undefined when only the writer's browser can produce it.
 * For the places that want to do something with the writing and can simply
 * skip a verse they cannot read.
 */
export function readableBody(stored: string, userId: string): string | undefined {
  const read = readStoredBody(stored, userId);
  return read.kind === "plaintext" ? read.body : undefined;
}
