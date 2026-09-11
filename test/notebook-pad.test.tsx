import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VerseView } from "@/lib/db/queries";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/actions/notebook", () => ({
  createVerseNote: vi.fn(async ({ body }: { body: string }) => ({
    id: "note-1",
    body,
  })),
  saveVerseNote: vi.fn(async ({ id, body }: { id: string; body: string }) => ({
    id,
    body,
  })),
  deleteVerseNote: vi.fn(async () => undefined),
}));
vi.mock("@/lib/crypto/vault-context", async () => (await import("./vault-mock")).vaultModuleMock());

const { createVerseNote, deleteVerseNote, saveVerseNote } = await import(
  "@/actions/notebook"
);
const { toast } = await import("sonner");
const { NotebookPad } = await import("@/components/notebook-pad");

const AUTOSAVE_MS = 800;

async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(AUTOSAVE_MS);
  });
}

describe("NotebookPad", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("writes nothing to the database until there is something to save", async () => {
    render(<NotebookPad id={null} initialBody="" initialSealed={false} />);

    await settle();

    expect(createVerseNote).not.toHaveBeenCalled();
    expect(saveVerseNote).not.toHaveBeenCalled();
  });

  it("creates the verse on the first autosave and takes its URL", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id={null} initialBody="" initialSealed={false} />);

    await user.type(screen.getByLabelText("Verse"), "cold open");
    await settle();

    expect(createVerseNote).toHaveBeenCalledWith({ body: "cold open" });
    expect(window.location.pathname).toBe("/notebook/note-1");
  });

  // A router navigation would swap /notebook/new for /notebook/[id] - two
  // different route segments - and take the live pad down with it. The URL has
  // to move without one.
  it("takes the new URL without navigating away from the pad", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id={null} initialBody="" initialSealed={false} />);

    await user.type(screen.getByLabelText("Verse"), "cold open");
    await settle();

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("updates the verse it just created instead of creating another", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id={null} initialBody="" initialSealed={false} />);

    const pad = screen.getByLabelText("Verse");
    await user.type(pad, "cold open");
    await settle();
    await user.type(pad, " again");
    await settle();

    expect(createVerseNote).toHaveBeenCalledOnce();
    expect(saveVerseNote).toHaveBeenCalledWith({
      id: "note-1",
      body: "cold open again",
    });
  });

  it("saves an existing verse without creating anything", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id="note-9" initialBody="first bar" initialSealed={false} />);

    await user.type(screen.getByLabelText("Verse"), " and another");
    await settle();

    expect(createVerseNote).not.toHaveBeenCalled();
    expect(saveVerseNote).toHaveBeenCalledWith({
      id: "note-9",
      body: "first bar and another",
    });
  });

  it("counts bars as they are written", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id="note-9" initialBody="" initialSealed={false} />);

    await user.type(screen.getByLabelText("Verse"), "one{enter}two{enter}three");

    expect(screen.getByText("3 bars")).toBeInTheDocument();
  });

  it("reports a failed save without losing what was typed", async () => {
    vi.mocked(saveVerseNote).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id="note-9" initialBody="first bar" initialSealed={false} />);

    await user.type(screen.getByLabelText("Verse"), " more");
    await settle();

    expect(toast.error).toHaveBeenCalled();
    expect(screen.getByLabelText("Verse")).toHaveValue("first bar more");
  });

  it("retries a failed save on the next keystroke", async () => {
    vi.mocked(saveVerseNote).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id="note-9" initialBody="first bar" initialSealed={false} />);

    const pad = screen.getByLabelText("Verse");
    await user.type(pad, " more");
    await settle();
    await user.type(pad, "!");
    await settle();

    expect(saveVerseNote).toHaveBeenLastCalledWith({
      id: "note-9",
      body: "first bar more!",
    });
  });

  it("offers no delete on a verse that does not exist yet", () => {
    render(<NotebookPad id={null} initialBody="" initialSealed={false} />);

    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("asks before deleting", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id="note-9" initialBody="first bar" initialSealed={false} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText("Delete this verse for good?")).toBeInTheDocument();
    expect(deleteVerseNote).not.toHaveBeenCalled();
  });

  it("backs out of a delete", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id="note-9" initialBody="first bar" initialSealed={false} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Keep it" }));

    expect(deleteVerseNote).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("deletes on confirmation and leaves for the list", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id="note-9" initialBody="first bar" initialSealed={false} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Delete" }));
    });

    expect(deleteVerseNote).toHaveBeenCalledWith({ id: "note-9" });
    expect(mocks.push).toHaveBeenCalledWith("/notebook");
  });
});

// The pad in the route Next actually renders it in. /notebook/new and
// /notebook/[id] are different route segments, so any router navigation
// between them unmounts the pad mid-keystroke and mounts a new one on whatever
// the server has stored - which is what this harness reproduces.
describe("NotebookPad inside its route", () => {
  const stored = new Map<string, string>();
  let navigate: (id: string) => void = () => {};

  function NotebookRoute() {
    const [id, setId] = useState<string | null>(null);
    navigate = setId;

    return (
      <NotebookPad
        key={id ?? "new"}
        id={id}
        initialBody={id ? (stored.get(id) ?? "") : ""} initialSealed={false}
      />
    );
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stored.clear();
    mocks.replace.mockImplementation((url: string) => {
      navigate(url.split("/").pop() ?? "");
    });
    vi.mocked(saveVerseNote).mockImplementation(async ({ id, body }) => {
      stored.set(id, body);
      return { id, body } as unknown as VerseView;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("keeps what was typed while the create was still in flight", async () => {
    const user = userEvent.setup({ delay: null });

    let finishCreate = () => {};
    vi.mocked(createVerseNote).mockImplementationOnce(
      ({ body }) =>
        new Promise<VerseView>((resolve) => {
          finishCreate = () => {
            stored.set("note-1", body);
            resolve({ id: "note-1", body } as unknown as VerseView);
          };
        }),
    );

    render(<NotebookRoute />);
    const pad = screen.getByLabelText("Verse");

    await user.type(pad, "cold open");
    await settle();

    // The row is being written; the writer has not stopped writing.
    await user.type(pad, " and one more");
    await act(async () => {
      finishCreate();
    });
    await settle();

    expect(pad).toHaveValue("cold open and one more");
    expect(stored.get("note-1")).toBe("cold open and one more");
  });
});
