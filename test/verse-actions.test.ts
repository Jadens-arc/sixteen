import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_VERSE_LENGTH } from "@/lib/bars";

const mocks = vi.hoisted(() => ({
  auth: vi.fn<() => Promise<{ userId: string | null }>>(),
  upsertVerse: vi.fn(),
  getVerseForPrompt: vi.fn(),
  getUserKey: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/queries", () => ({
  upsertVerse: mocks.upsertVerse,
  getVerseForPrompt: mocks.getVerseForPrompt,
}));
// No passphrase on this account unless a test says so, which is the path
// every save took before the setting existed.
vi.mock("@/lib/db/vault", () => ({ getUserKey: mocks.getUserKey }));

const { saveVerse, completeVerse } = await import("@/actions/verse");

const PROMPT_ID = "123e4567-e89b-12d3-a456-426614174000";

function signedIn() {
  mocks.auth.mockResolvedValue({ userId: "user_1" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: null });
  mocks.upsertVerse.mockResolvedValue({ id: "verse_1" });
  mocks.getVerseForPrompt.mockResolvedValue(undefined);
  mocks.getUserKey.mockResolvedValue(undefined);
});

describe("saveVerse", () => {
  it("rejects when there is no signed-in user", async () => {
    await expect(saveVerse({ promptId: PROMPT_ID, body: "one line" })).rejects.toThrow(
      "Unauthenticated",
    );
  });

  it("rejects a promptId that is not a uuid", async () => {
    signedIn();
    await expect(saveVerse({ promptId: "prompt-1", body: "one line" })).rejects.toThrow();
    expect(mocks.upsertVerse).not.toHaveBeenCalled();
  });

  it("rejects a body over the length cap", async () => {
    signedIn();
    const body = "x".repeat(MAX_VERSE_LENGTH + 1);
    await expect(saveVerse({ promptId: PROMPT_ID, body })).rejects.toThrow();
    expect(mocks.upsertVerse).not.toHaveBeenCalled();
  });

  it("rejects a body that is not a string", async () => {
    signedIn();
    const input = { promptId: PROMPT_ID, body: { toString: () => "nice try" } };
    await expect(saveVerse(input as unknown as { promptId: string; body: string })).rejects.toThrow();
    expect(mocks.upsertVerse).not.toHaveBeenCalled();
  });

  it("saves a valid verse against the signed-in user", async () => {
    signedIn();
    await saveVerse({ promptId: PROMPT_ID, body: "one line" });
    expect(mocks.upsertVerse).toHaveBeenCalledWith({
      promptId: PROMPT_ID,
      userId: "user_1",
      body: { sealed: false, body: "one line" },
    });
  });

  it("accepts a body exactly at the cap", async () => {
    signedIn();
    await saveVerse({ promptId: PROMPT_ID, body: "x".repeat(MAX_VERSE_LENGTH) });
    expect(mocks.upsertVerse).toHaveBeenCalledOnce();
  });
});

describe("completeVerse", () => {
  it("rejects when there is no signed-in user", async () => {
    await expect(completeVerse({ promptId: PROMPT_ID })).rejects.toThrow("Unauthenticated");
  });

  it("rejects a promptId that is not a uuid", async () => {
    signedIn();
    await expect(completeVerse({ promptId: "prompt-1" })).rejects.toThrow();
    expect(mocks.getVerseForPrompt).not.toHaveBeenCalled();
  });

  it("refuses to complete a verse short of the bar target", async () => {
    signedIn();
    mocks.getVerseForPrompt.mockResolvedValue({ body: "one\ntwo\nthree", sealed: false });
    await expect(completeVerse({ promptId: PROMPT_ID })).rejects.toThrow("at least 16 bars");
    expect(mocks.upsertVerse).not.toHaveBeenCalled();
  });

  it("completes a verse that reaches the bar target", async () => {
    signedIn();
    const body = Array.from({ length: 16 }, (_, i) => `bar ${i + 1}`).join("\n");
    mocks.getVerseForPrompt.mockResolvedValue({ body, sealed: false });
    await completeVerse({ promptId: PROMPT_ID });
    expect(mocks.upsertVerse).toHaveBeenCalledWith({
      promptId: PROMPT_ID,
      userId: "user_1",
      body: { sealed: false, body },
      completed: true,
    });
  });
});
