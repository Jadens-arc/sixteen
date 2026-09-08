import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null })),
}));

const { saveVerse, completeVerse } = await import("@/actions/verse");

describe("saveVerse", () => {
  it("rejects when there is no signed-in user", async () => {
    await expect(saveVerse({ promptId: "prompt-1", body: "one line" })).rejects.toThrow(
      "Unauthenticated",
    );
  });
});

describe("completeVerse", () => {
  it("rejects when there is no signed-in user", async () => {
    await expect(completeVerse({ promptId: "prompt-1" })).rejects.toThrow(
      "Unauthenticated",
    );
  });
});
