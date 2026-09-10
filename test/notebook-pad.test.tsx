import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    render(<NotebookPad id={null} initialBody="" />);

    await settle();

    expect(createVerseNote).not.toHaveBeenCalled();
    expect(saveVerseNote).not.toHaveBeenCalled();
  });

  it("creates the verse on the first autosave and takes its URL", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id={null} initialBody="" />);

    await user.type(screen.getByLabelText("Verse"), "cold open");
    await settle();

    expect(createVerseNote).toHaveBeenCalledWith({ body: "cold open" });
    expect(mocks.replace).toHaveBeenCalledWith("/notebook/note-1", { scroll: false });
  });

  it("updates the verse it just created instead of creating another", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id={null} initialBody="" />);

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
    render(<NotebookPad id="note-9" initialBody="first bar" />);

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
    render(<NotebookPad id="note-9" initialBody="" />);

    await user.type(screen.getByLabelText("Verse"), "one{enter}two{enter}three");

    expect(screen.getByText("3 bars")).toBeInTheDocument();
  });

  it("reports a failed save without losing what was typed", async () => {
    vi.mocked(saveVerseNote).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id="note-9" initialBody="first bar" />);

    await user.type(screen.getByLabelText("Verse"), " more");
    await settle();

    expect(toast.error).toHaveBeenCalled();
    expect(screen.getByLabelText("Verse")).toHaveValue("first bar more");
  });

  it("retries a failed save on the next keystroke", async () => {
    vi.mocked(saveVerseNote).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id="note-9" initialBody="first bar" />);

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
    render(<NotebookPad id={null} initialBody="" />);

    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("asks before deleting", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id="note-9" initialBody="first bar" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText("Delete this verse for good?")).toBeInTheDocument();
    expect(deleteVerseNote).not.toHaveBeenCalled();
  });

  it("backs out of a delete", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id="note-9" initialBody="first bar" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Keep it" }));

    expect(deleteVerseNote).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("deletes on confirmation and leaves for the list", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NotebookPad id="note-9" initialBody="first bar" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Delete" }));
    });

    expect(deleteVerseNote).toHaveBeenCalledWith({ id: "note-9" });
    expect(mocks.push).toHaveBeenCalledWith("/notebook");
  });
});
