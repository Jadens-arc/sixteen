import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_VERSE_LENGTH } from "@/lib/bars";

const mocks = vi.hoisted(() => ({ getUserKey: vi.fn() }));
vi.mock("@/lib/db/vault", () => ({ getUserKey: mocks.getUserKey }));

const { resolveBodyInput } = await import("@/lib/vault-policy");

const USER = "user_1";
const SEALED = `sixteen.v2.abcdef012345.${"A".repeat(16)}.${"B".repeat(48)}`;
const SERVER_SEALED = `sixteen.v1.abcdef012345.${"A".repeat(16)}.${"B".repeat(48)}`;

function withPassphrase(state: "active" | "unsealing" = "active") {
  mocks.getUserKey.mockResolvedValue({ userId: USER, state });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserKey.mockResolvedValue(undefined);
});

describe("an account with no passphrase", () => {
  it("stores what was written, to be sealed with the server key", async () => {
    expect(await resolveBodyInput(USER, { body: "one line" })).toEqual({
      sealed: false,
      body: "one line",
    });
  });

  // Accepting this would store a verse that nothing could ever open: there is
  // no user key on this account for it to have been sealed with.
  it("refuses a sealed body outright", async () => {
    await expect(resolveBodyInput(USER, { body: SEALED, barCount: 3 })).rejects.toThrow(
      /no passphrase set/,
    );
  });

  it("enforces the plaintext length cap", async () => {
    await expect(
      resolveBodyInput(USER, { body: "x".repeat(MAX_VERSE_LENGTH + 1) }),
    ).rejects.toThrow(/too long/);
  });
});

describe("an account with a passphrase", () => {
  beforeEach(() => withPassphrase());

  it("takes a sealed body and the count that came with it", async () => {
    expect(await resolveBodyInput(USER, { body: SEALED, barCount: 12 })).toEqual({
      sealed: true,
      body: SEALED,
      barCount: 12,
    });
  });

  // The failure this is here to catch is a client bug, not an attack: a pad
  // that forgot to seal would post the writing in the clear and look like it
  // had saved correctly.
  it("refuses writing sent in the clear", async () => {
    await expect(resolveBodyInput(USER, { body: "one line" })).rejects.toThrow(
      /should have been sealed/,
    );
  });

  it("refuses a sealed body with no bar count, which it cannot work out", async () => {
    await expect(resolveBodyInput(USER, { body: SEALED })).rejects.toThrow(
      /carry its own bar count/,
    );
  });

  it("still allows an emptied verse, which has nothing to protect", async () => {
    expect(await resolveBodyInput(USER, { body: "" })).toEqual({ sealed: false, body: "" });
  });
});

describe("an account being unlocked", () => {
  beforeEach(() => withPassphrase("unsealing"));

  it("accepts writing in the clear, which is the direction of travel", async () => {
    expect(await resolveBodyInput(USER, { body: "one line" })).toEqual({
      sealed: false,
      body: "one line",
    });
  });

  it("still accepts a sealed body from a pad that has not caught up", async () => {
    expect(await resolveBodyInput(USER, { body: SEALED, barCount: 4 })).toEqual({
      sealed: true,
      body: SEALED,
      barCount: 4,
    });
  });
});

// A browser has no business producing either of these, in any mode.
describe("bodies a browser should never send", () => {
  it("refuses a server-key envelope", async () => {
    await expect(
      resolveBodyInput(USER, { body: SERVER_SEALED, barCount: 3 }),
    ).rejects.toThrow(/does not accept from a browser/);

    withPassphrase();
    await expect(
      resolveBodyInput(USER, { body: SERVER_SEALED, barCount: 3 }),
    ).rejects.toThrow(/does not accept from a browser/);
  });
});
