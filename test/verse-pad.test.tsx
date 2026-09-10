import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/actions/verse", () => ({
  saveVerse: vi.fn(async ({ promptId, body }: { promptId: string; body: string }) => ({
    id: "verse-1",
    promptId,
    body,
  })),
  completeVerse: vi.fn(async ({ promptId }: { promptId: string }) => ({
    id: "verse-1",
    promptId,
    completedAt: new Date(),
  })),
}));

const { saveVerse } = await import("@/actions/verse");
const { toast } = await import("sonner");
const { VersePad } = await import("@/components/verse-pad");

// Enter presses insert a real newline into the textarea, matching how a
// person actually writes bar by bar, unlike a literal "\n" in the string.
function linesOf(count: number): string {
  return Array.from({ length: count }, (_, i) => `bar number ${i + 1}`).join(
    "{enter}",
  );
}

describe("VersePad", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("reflects the number of bars typed", async () => {
    const user = userEvent.setup({ delay: null });
    render(<VersePad promptId="prompt-1" initialBody="" initialCompletedAt={null} />);

    await user.type(screen.getByLabelText("Verse"), linesOf(10));

    expect(screen.getByText("10 / 16 bars")).toBeInTheDocument();
  });

  it("keeps the complete button disabled below 16 bars", async () => {
    const user = userEvent.setup({ delay: null });
    render(<VersePad promptId="prompt-1" initialBody="" initialCompletedAt={null} />);

    await user.type(screen.getByLabelText("Verse"), linesOf(15));

    expect(screen.getByRole("button", { name: /mark 16 done/i })).toBeDisabled();
  });

  it("enables the complete button once 16 bars are written", async () => {
    const user = userEvent.setup({ delay: null });
    render(<VersePad promptId="prompt-1" initialBody="" initialCompletedAt={null} />);

    await user.type(screen.getByLabelText("Verse"), linesOf(16));

    expect(screen.getByText("16 / 16 bars")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark 16 done/i })).toBeEnabled();
  });

  it("autosaves the body after the user stops typing", async () => {
    const user = userEvent.setup({ delay: null });
    render(<VersePad promptId="prompt-1" initialBody="" initialCompletedAt={null} />);

    await user.type(screen.getByLabelText("Verse"), "first bar");
    expect(saveVerse).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(saveVerse).toHaveBeenCalledWith({ promptId: "prompt-1", body: "first bar" });
  });

  it("does not resend a body that already matches the last save", async () => {
    render(<VersePad promptId="prompt-1" initialBody="first bar" initialCompletedAt={null} />);

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(saveVerse).not.toHaveBeenCalled();
  });

  it("shows a toast when autosave fails", async () => {
    vi.mocked(saveVerse).mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup({ delay: null });
    render(<VersePad promptId="prompt-1" initialBody="" initialCompletedAt={null} />);

    await user.type(screen.getByLabelText("Verse"), "first bar");
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(toast.error).toHaveBeenCalled();
  });

  it("locks a completed verse until it is reopened", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <VersePad
        promptId="prompt-1"
        initialBody="first bar"
        initialCompletedAt="2026-03-04T10:00:00.000Z"
      />,
    );

    expect(screen.getByLabelText("Verse")).toHaveAttribute("readonly");
    expect(screen.getByText("Done - reopen to edit")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Verse")).not.toHaveAttribute("readonly");
  });

  it("saves an edit made to a completed verse", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <VersePad
        promptId="prompt-1"
        initialBody="first bar"
        initialCompletedAt="2026-03-04T10:00:00.000Z"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Verse"), " rewritten");
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(saveVerse).toHaveBeenCalledWith({
      promptId: "prompt-1",
      body: "first bar rewritten",
    });
  });

  it("locks the pad again when the edit is finished", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <VersePad
        promptId="prompt-1"
        initialBody="first bar"
        initialCompletedAt="2026-03-04T10:00:00.000Z"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Done editing" }));

    expect(screen.getByLabelText("Verse")).toHaveAttribute("readonly");
  });
});
