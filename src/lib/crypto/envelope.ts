/**
 * The wire format for a stored verse body, and nothing else.
 *
 * This module is deliberately free of any crypto: it runs unchanged in the
 * Node server and in the browser, and it is the one place that knows what a
 * stored body looks like. The server (src/lib/crypto/server.ts) and the
 * browser (src/lib/crypto/client.ts) hold different keys and use different
 * crypto APIs, but they must agree on the bytes to the character, so the
 * format lives here rather than twice.
 *
 * A body is one of three things:
 *
 *   plaintext            written before any of this existed, or while no key
 *                        was configured - readable by anyone with the row
 *   sixteen.v1.…         sealed with the server's VERSE_ENCRYPTION_KEY - the
 *                        app can open it, a stolen database cannot
 *   sixteen.v2.…         sealed with a key derived from the writer's
 *                        passphrase - only their browser can open it
 *
 * Version is part of the value rather than a column, which is what lets one
 * account hold all three at once. Turning encryption on converts rows one at
 * a time, and an interrupted conversion leaves a table that still reads
 * perfectly - every row says for itself how to be opened.
 */

export const NAMESPACE = "sixteen";

/** Sealed with the server key. */
export const SERVER_VERSION = "v1";
/** Sealed with a key only the writer's browser has. */
export const USER_VERSION = "v2";

export type EnvelopeVersion = typeof SERVER_VERSION | typeof USER_VERSION;

export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const KEY_BYTES = 32;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Written by hand rather than through Buffer or btoa, because this file has to
// behave the same in both runtimes and neither of those exists in both.
export function toBase64Url(bytes: Uint8Array): string {
  let out = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];

    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b === undefined) break;
    out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c === undefined) break;
    out += ALPHABET[c & 63];
  }

  return out;
}

export function fromBase64Url(text: string): Uint8Array | null {
  const length = text.length;
  if (length % 4 === 1) return null;

  const bytes = new Uint8Array(Math.floor((length * 3) / 4));
  let written = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < length; i += 1) {
    const value = ALPHABET.indexOf(text[i]);
    if (value === -1) return null;

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes[written] = (buffer >> bits) & 0xff;
      written += 1;
    }
  }

  return bytes.subarray(0, written);
}

export interface Envelope {
  version: EnvelopeVersion;
  keyId: string;
  iv: Uint8Array;
  payload: Uint8Array;
}

export type ParsedBody =
  | { kind: "plaintext" }
  | ({ kind: "sealed" } & Envelope)
  // Well-formed, but written by a version of this app that this one does not
  // know about. See parseBody() for why that is its own case.
  | { kind: "unsupported"; version: string };

function isSupported(version: string): version is EnvelopeVersion {
  return version === SERVER_VERSION || version === USER_VERSION;
}

/**
 * Reads a stored body without opening it.
 *
 * The `unsupported` case is the one worth explaining. A body written by a
 * later version of this app is structurally an envelope but not one this code
 * can decrypt, and the dangerous answer would be to shrug and call it
 * plaintext: it would be rendered into a pad as raw ciphertext, and the pad
 * autosaves - the verse would be overwritten by a mangled copy of itself.
 * Naming the case lets every caller refuse instead.
 */
export function parseBody(stored: string): ParsedBody {
  if (!stored.startsWith(`${NAMESPACE}.`)) return { kind: "plaintext" };

  const parts = stored.split(".");
  if (parts.length !== 5) return { kind: "plaintext" };

  const [, version, keyId, ivPart, payloadPart] = parts;
  if (version.length === 0 || keyId.length === 0) return { kind: "plaintext" };

  const iv = fromBase64Url(ivPart);
  const payload = fromBase64Url(payloadPart);
  if (!iv || !payload) return { kind: "plaintext" };
  if (iv.length !== IV_BYTES || payload.length <= TAG_BYTES) return { kind: "plaintext" };

  if (!isSupported(version)) return { kind: "unsupported", version };
  return { kind: "sealed", version, keyId, iv, payload };
}

export function formatEnvelope(envelope: Envelope): string {
  return [
    NAMESPACE,
    envelope.version,
    envelope.keyId,
    toBase64Url(envelope.iv),
    toBase64Url(envelope.payload),
  ].join(".");
}

/** True for anything this app sealed, whichever key holds it. */
export function isSealed(stored: string): boolean {
  return parseBody(stored).kind === "sealed";
}

/** True for a body only the writer's browser can open. */
export function isUserSealed(stored: string): boolean {
  const parsed = parseBody(stored);
  return parsed.kind === "sealed" && parsed.version === USER_VERSION;
}

/**
 * Binds a ciphertext to its owner and its version. A body lifted from one row
 * into another user's row fails to authenticate rather than opening, and a v1
 * body cannot be replayed as a v2 one.
 */
export function additionalData(version: EnvelopeVersion, userId: string): Uint8Array {
  return new TextEncoder().encode(`${NAMESPACE}.${version}.user:${userId}`);
}

/** Splits the stored payload into the parts AES-GCM wants separately. */
export function splitPayload(payload: Uint8Array): {
  ciphertext: Uint8Array;
  tag: Uint8Array;
} {
  const at = payload.length - TAG_BYTES;
  return { ciphertext: payload.subarray(0, at), tag: payload.subarray(at) };
}
