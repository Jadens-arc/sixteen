import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

const { ArchiveSearch, archiveHref } = await import("@/components/archive-search");

const DEBOUNCE_MS = 300;

describe("archiveHref", () => {
  it("drops the parameter for an empty query", () => {
    expect(archiveHref("   ")).toBe("/archive");
  });

  it("encodes what a person typed", () => {
    expect(archiveHref("pawn shop & clock")).toBe("/archive?q=pawn%20shop%20%26%20clock");
  });
});

describe("ArchiveSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("puts the typed query in the URL once typing stops", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ArchiveSearch query="" />);

    await user.type(screen.getByLabelText("Search the archive"), "pawn");
    expect(mocks.replace).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(mocks.replace).toHaveBeenCalledWith("/archive?q=pawn", { scroll: false });
  });

  it("does not navigate when the field already matches the URL", async () => {
    render(<ArchiveSearch query="pawn" />);

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("clears back to the unsearched archive", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ArchiveSearch query="pawn" />);

    await user.click(screen.getByRole("button", { name: "Clear" }));
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(mocks.replace).toHaveBeenCalledWith("/archive", { scroll: false });
  });

  it("offers nothing to clear when the field is empty", () => {
    render(<ArchiveSearch query="" />);

    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("submits without waiting for the debounce", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ArchiveSearch query="" />);

    const input = screen.getByLabelText("Search the archive");
    await user.type(input, "clock{enter}");

    expect(mocks.replace).toHaveBeenCalledWith("/archive?q=clock", { scroll: false });
  });
});
