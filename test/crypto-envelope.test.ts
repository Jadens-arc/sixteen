import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  additionalData,
  formatEnvelope,
  fromBase64Url,
  isSealed,
  isUserSealed,
  parseBody,
  splitPayload,
  toBase64Url,
} from "@/lib/crypto/envelope";

// This encoder is written by hand because it has to behave identically in Node
// and in the browser, and neither Buffer nor btoa exists in both. Node's
// implementation is the reference it has to match.
describe("base64url", () => {
  it("matches Node for every length up to 64 bytes", () => {
    for (let length = 0; length <= 64; length += 1) {
      const bytes = randomBytes(length);
      expect(toBase64Url(new Uint8Array(bytes))).toBe(bytes.toString("base64url"));
    }
  });

  it("matches Node for every single byte value", () => {
    for (let value = 0; value < 256; value += 1) {
      const bytes = Uint8Array.of(value);
      expect(toBase64Url(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
    }
  });

  it("round-trips anything it encodes", () => {
    for (let length = 0; length <= 64; length += 1) {
      const bytes = new Uint8Array(randomBytes(length));
      expect(Array.from(fromBase64Url(toBase64Url(bytes))!)).toEqual(Array.from(bytes));
    }
  });

  it("decodes what Node encodes", () => {
    const bytes = randomBytes(48);
    const decoded = fromBase64Url(bytes.toString("base64url"));
    expect(Array.from(decoded!)).toEqual(Array.from(bytes));
  });

  it("refuses input that is not base64url", () => {
    expect(fromBase64Url("has spaces")).toBeNull();
    expect(fromBase64Url("plus+slash/")).toBeNull();
    expect(fromBase64Url("padded==")).toBeNull();
    // A single trailing character cannot encode any whole byte.
    expect(fromBase64Url("AAAAA")).toBeNull();
  });
});

function envelope(version: string, payloadBytes = 32) {
  return [
    "sixteen",
    version,
    "abcdef012345",
    toBase64Url(new Uint8Array(randomBytes(12))),
    toBase64Url(new Uint8Array(randomBytes(payloadBytes))),
  ].join(".");
}

describe("reading a stored body", () => {
  it("calls ordinary writing plaintext", () => {
    expect(parseBody("just some bars").kind).toBe("plaintext");
    expect(parseBody("").kind).toBe("plaintext");
  });

  it("recognises both sealed formats and tells them apart", () => {
    const server = envelope("v1");
    const user = envelope("v2");

    expect(isSealed(server)).toBe(true);
    expect(isSealed(user)).toBe(true);
    expect(isUserSealed(server)).toBe(false);
    expect(isUserSealed(user)).toBe(true);
  });

  it("names a version it does not know instead of guessing", () => {
    const parsed = parseBody(envelope("v9"));
    expect(parsed.kind).toBe("unsupported");
    expect(parsed.kind === "unsupported" && parsed.version).toBe("v9");
  });

  // Everything here has to read as plaintext: a verse that happens to start
  // with the namespace is still a verse, and treating it as a broken envelope
  // would fail a read that should simply have worked.
  it("does not mistake writing about the format for the format", () => {
    const notEnvelopes = [
      "sixteen.v1. is how it starts",
      "sixteen.v1.abc.def",
      "sixteen.v1.abc.def.ghi.jkl",
      "sixteen.v1..AAAA.BBBB",
      "sixteen.v1.abcdef012345.not+base64url.BBBB",
      // Right shape, wrong sizes: a 12-byte IV and a payload longer than the tag.
      `sixteen.v1.abcdef012345.${toBase64Url(new Uint8Array(randomBytes(8)))}.${toBase64Url(new Uint8Array(randomBytes(32)))}`,
      `sixteen.v1.abcdef012345.${toBase64Url(new Uint8Array(randomBytes(12)))}.${toBase64Url(new Uint8Array(randomBytes(16)))}`,
    ];

    for (const body of notEnvelopes) {
      expect(parseBody(body).kind).toBe("plaintext");
    }
  });

  it("survives a round trip through formatEnvelope", () => {
    const iv = new Uint8Array(randomBytes(12));
    const payload = new Uint8Array(randomBytes(48));
    const parsed = parseBody(
      formatEnvelope({ version: "v2", keyId: "abcdef012345", iv, payload }),
    );

    expect(parsed.kind).toBe("sealed");
    if (parsed.kind !== "sealed") return;
    expect(parsed.version).toBe("v2");
    expect(Array.from(parsed.iv)).toEqual(Array.from(iv));
    expect(Array.from(parsed.payload)).toEqual(Array.from(payload));
  });
});

describe("what a ciphertext is bound to", () => {
  it("differs by user, so a verse cannot be moved between rows", () => {
    expect(additionalData("v1", "user_1")).not.toEqual(additionalData("v1", "user_2"));
  });

  it("differs by version, so a server-sealed body cannot be replayed as a user one", () => {
    expect(additionalData("v1", "user_1")).not.toEqual(additionalData("v2", "user_1"));
  });
});

describe("splitPayload", () => {
  it("takes the last 16 bytes as the tag", () => {
    const payload = new Uint8Array(randomBytes(48));
    const { ciphertext, tag } = splitPayload(payload);

    expect(ciphertext).toHaveLength(32);
    expect(tag).toHaveLength(16);
    expect(Array.from(tag)).toEqual(Array.from(payload.subarray(32)));
  });
});
