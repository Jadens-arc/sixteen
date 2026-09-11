import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encryptVerseBody, isEncryptedVerseBody } from "@/lib/verse-crypto";

// One chainable stand-in for a drizzle query builder: every method returns it
// and awaiting it hands back the rows the test set up. The queries under test
// are interesting for what they do to a body on the way in and on the way out,
// not for the SQL they build, so the builder only has to be shaped right.
function builder(rows: unknown) {
  const calls: { method: string; args: unknown[] }[] = [];
  const node: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) => resolve(rows);
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return node;
        };
      },
    },
  );

  return { node, calls };
}

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: (...args: unknown[]) => mocks.select(...args),
    insert: (...args: unknown[]) => mocks.insert(...args),
    update: (...args: unknown[]) => mocks.update(...args),
  },
}));

const {
  createNotebookVerse,
  listArchive,
  listNotebook,
  getNotebookVerse,
  upsertVerse,
} = await import("@/lib/db/queries");

const KEY = randomBytes(32).toString("base64");
const USER = "user_1";
const PROMPT_ID = "123e4567-e89b-12d3-a456-426614174000";

const VERSE = "cold open in the pawn shop\nsecond bar\nthird bar";

function prompt(concept: string, scenario = "a scenario") {
  return { id: PROMPT_ID, promptDate: "2026-09-11", concept, scenario };
}

/** What the row would look like written by an older build, before any key. */
function plaintextRow(body: string) {
  return { id: "verse_1", userId: USER, body, barCount: 3, updatedAt: new Date() };
}

/** What the row looks like now. */
function encryptedRow(body: string) {
  return { ...plaintextRow(body), body: encryptVerseBody(body, USER) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VERSE_ENCRYPTION_KEY = KEY;
});

afterEach(() => {
  delete process.env.VERSE_ENCRYPTION_KEY;
});

describe("writing a verse", () => {
  it("sends ciphertext to the database and returns the writing", async () => {
    const { node, calls } = builder([encryptedRow(VERSE)]);
    mocks.insert.mockReturnValue(node);

    const verse = await createNotebookVerse({ userId: USER, body: VERSE });

    const [values] = calls.find((call) => call.method === "values")!.args as [
      { body: string; barCount: number },
    ];
    expect(isEncryptedVerseBody(values.body)).toBe(true);
    expect(values.body).not.toContain("pawn shop");
    // Counted from the writing, not from the ciphertext.
    expect(values.barCount).toBe(3);

    expect(verse.body).toBe(VERSE);
  });

  it("encrypts a daily verse the same way", async () => {
    const { node, calls } = builder([encryptedRow(VERSE)]);
    mocks.insert.mockReturnValue(node);

    const verse = await upsertVerse({ promptId: PROMPT_ID, userId: USER, body: VERSE });

    const [values] = calls.find((call) => call.method === "values")!.args as [
      { body: string },
    ];
    expect(isEncryptedVerseBody(values.body)).toBe(true);
    expect(verse.body).toBe(VERSE);
  });

  it("leaves an emptied verse empty rather than storing a blob", async () => {
    const { node, calls } = builder([plaintextRow("")]);
    mocks.update.mockReturnValue(node);

    const { updateNotebookVerse } = await import("@/lib/db/queries");
    await updateNotebookVerse({ id: "verse_1", userId: USER, body: "" });

    const [set] = calls.find((call) => call.method === "set")!.args as [{ body: string }];
    expect(set.body).toBe("");
  });
});

describe("opening a verse", () => {
  it("hands the pad the writing, not the ciphertext", async () => {
    mocks.select.mockReturnValue(builder([encryptedRow(VERSE)]).node);
    const verse = await getNotebookVerse("verse_1", USER);
    expect(verse?.body).toBe(VERSE);
  });

  it("still opens one written before there was a key", async () => {
    mocks.select.mockReturnValue(builder([plaintextRow(VERSE)]).node);
    const verse = await getNotebookVerse("verse_1", USER);
    expect(verse?.body).toBe(VERSE);
  });

  it("refuses to hand a verse to the wrong reader", async () => {
    mocks.select.mockReturnValue(builder([encryptedRow(VERSE)]).node);
    await expect(getNotebookVerse("verse_1", "user_2")).rejects.toThrow(
      /could not be decrypted/,
    );
  });
});

describe("the notebook list", () => {
  it("names and previews an encrypted verse", async () => {
    mocks.select.mockReturnValue(builder([encryptedRow(VERSE)]).node);

    const [entry] = await listNotebook(USER);
    expect(entry.opening.startsWith("cold open in the pawn shop")).toBe(true);
    expect(entry.excerpt).toContain("pawn shop");
  });

  it("searches the writing inside the ciphertext", async () => {
    mocks.select.mockReturnValue(
      builder([
        { ...encryptedRow(VERSE), id: "verse_1" },
        { ...encryptedRow("nothing to do with it"), id: "verse_2" },
      ]).node,
    );

    const entries = await listNotebook(USER, "pawn");
    expect(entries.map((entry) => entry.id)).toEqual(["verse_1"]);
  });

  it("searches verses from before encryption alongside encrypted ones", async () => {
    mocks.select.mockReturnValue(
      builder([
        { ...plaintextRow("an old bar about a pawn shop"), id: "old" },
        { ...encryptedRow(VERSE), id: "new" },
      ]).node,
    );

    const entries = await listNotebook(USER, "pawn");
    expect(entries.map((entry) => entry.id)).toEqual(["old", "new"]);
  });
});

describe("the archive list", () => {
  const row = (concept: string, body: string | null) => ({
    prompt: prompt(concept),
    verse: body === null ? null : { barCount: 3, completedAt: null, body: encryptVerseBody(body, USER) },
  });

  it("excerpts the verse without handing the body over", async () => {
    mocks.select.mockReturnValue(builder([row("a concept", VERSE)]).node);

    const [entry] = await listArchive(USER);
    expect(entry.excerpt).toContain("pawn shop");
    expect(entry.verse).toEqual({ barCount: 3, completedAt: null });
    expect(entry.verse).not.toHaveProperty("body");
  });

  it("matches on the writing as well as on the prompt", async () => {
    mocks.select.mockReturnValue(
      builder([
        { ...row("a concept", VERSE), prompt: prompt("a concept") },
        { ...row("pawn shop", "unrelated bars"), prompt: prompt("pawn shop") },
        { ...row("neither", "unrelated bars"), prompt: prompt("neither") },
      ]).node,
    );

    const entries = await listArchive(USER, "pawn");
    expect(entries.map((entry) => entry.prompt.concept)).toEqual([
      "a concept",
      "pawn shop",
    ]);
  });

  it("keeps a day with no verse out of a body search", async () => {
    mocks.select.mockReturnValue(builder([row("a concept", null)]).node);

    expect(await listArchive(USER, "pawn")).toEqual([]);
    expect(await listArchive(USER)).toHaveLength(1);
  });
});
