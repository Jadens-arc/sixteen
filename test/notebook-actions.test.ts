import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_VERSE_LENGTH } from "@/lib/bars";

const mocks = vi.hoisted(() => ({
  auth: vi.fn<() => Promise<{ userId: string | null }>>(),
  createNotebookVerse: vi.fn(),
  updateNotebookVerse: vi.fn(),
  deleteNotebookVerse: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/queries", () => ({
  createNotebookVerse: mocks.createNotebookVerse,
  updateNotebookVerse: mocks.updateNotebookVerse,
  deleteNotebookVerse: mocks.deleteNotebookVerse,
}));

const { createVerseNote, saveVerseNote, deleteVerseNote } = await import(
  "@/actions/notebook"
);

const NOTE_ID = "123e4567-e89b-12d3-a456-426614174000";

function signedIn() {
  mocks.auth.mockResolvedValue({ userId: "user_1" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: null });
  mocks.createNotebookVerse.mockResolvedValue({ id: NOTE_ID });
  mocks.updateNotebookVerse.mockResolvedValue({ id: NOTE_ID });
  mocks.deleteNotebookVerse.mockResolvedValue(true);
});

describe("createVerseNote", () => {
  it("rejects when there is no signed-in user", async () => {
    await expect(createVerseNote({ body: "one line" })).rejects.toThrow("Unauthenticated");
    expect(mocks.createNotebookVerse).not.toHaveBeenCalled();
  });

  it("rejects a body over the length cap", async () => {
    signedIn();
    await expect(
      createVerseNote({ body: "x".repeat(MAX_VERSE_LENGTH + 1) }),
    ).rejects.toThrow();
    expect(mocks.createNotebookVerse).not.toHaveBeenCalled();
  });

  it("files the verse under the signed-in user", async () => {
    signedIn();
    await createVerseNote({ body: "one line" });
    expect(mocks.createNotebookVerse).toHaveBeenCalledWith({
      userId: "user_1",
      body: "one line",
    });
  });
});

describe("saveVerseNote", () => {
  it("rejects when there is no signed-in user", async () => {
    await expect(saveVerseNote({ id: NOTE_ID, body: "x" })).rejects.toThrow(
      "Unauthenticated",
    );
  });

  it("rejects an id that is not a uuid", async () => {
    signedIn();
    await expect(saveVerseNote({ id: "note-1", body: "x" })).rejects.toThrow();
    expect(mocks.updateNotebookVerse).not.toHaveBeenCalled();
  });

  it("rejects a body that is not a string", async () => {
    signedIn();
    const input = { id: NOTE_ID, body: { toString: () => "nice try" } };
    await expect(
      saveVerseNote(input as unknown as { id: string; body: string }),
    ).rejects.toThrow();
    expect(mocks.updateNotebookVerse).not.toHaveBeenCalled();
  });

  it("scopes the update to the signed-in user", async () => {
    signedIn();
    await saveVerseNote({ id: NOTE_ID, body: "one line" });
    expect(mocks.updateNotebookVerse).toHaveBeenCalledWith({
      id: NOTE_ID,
      userId: "user_1",
      body: "one line",
    });
  });

  it("refuses a verse that is not in the caller's notebook", async () => {
    signedIn();
    mocks.updateNotebookVerse.mockResolvedValue(undefined);
    await expect(saveVerseNote({ id: NOTE_ID, body: "one line" })).rejects.toThrow(
      "not in your notebook",
    );
  });
});

describe("deleteVerseNote", () => {
  it("rejects when there is no signed-in user", async () => {
    await expect(deleteVerseNote({ id: NOTE_ID })).rejects.toThrow("Unauthenticated");
    expect(mocks.deleteNotebookVerse).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a uuid", async () => {
    signedIn();
    await expect(deleteVerseNote({ id: "note-1" })).rejects.toThrow();
    expect(mocks.deleteNotebookVerse).not.toHaveBeenCalled();
  });

  it("scopes the delete to the signed-in user", async () => {
    signedIn();
    await deleteVerseNote({ id: NOTE_ID });
    expect(mocks.deleteNotebookVerse).toHaveBeenCalledWith({
      id: NOTE_ID,
      userId: "user_1",
    });
  });

  it("refuses a verse that is not in the caller's notebook", async () => {
    signedIn();
    mocks.deleteNotebookVerse.mockResolvedValue(false);
    await expect(deleteVerseNote({ id: NOTE_ID })).rejects.toThrow(
      "not in your notebook",
    );
  });
});
