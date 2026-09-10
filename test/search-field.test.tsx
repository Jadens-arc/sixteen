import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

const { SearchField, searchHref } = await import("@/components/search-field");

const DEBOUNCE_MS = 300;
const PLACEHOLDER = "Search your verses and prompts";

describe("searchHref", () => {
  it("drops the parameter for an empty query", () => {
    expect(searchHref("/archive", "   ")).toBe("/archive");
  });

  it("encodes what a person typed", () => {
    expect(searchHref("/archive", "pawn shop & clock")).toBe(
      "/archive?q=pawn%20shop%20%26%20clock",
    );
  });

  it("keeps each list searching its own page", () => {
    expect(searchHref("/notebook", "hook")).toBe("/notebook?q=hook");
  });
});

describe("SearchField", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function Field({ query }: { query: string }) {
    return <SearchField path="/archive" query={query} placeholder={PLACEHOLDER} />;
  }

  it("puts the typed query in the URL once typing stops", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Field query="" />);

    await user.type(screen.getByLabelText(PLACEHOLDER), "pawn");
    expect(mocks.replace).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(mocks.replace).toHaveBeenCalledWith("/archive?q=pawn", { scroll: false });
  });

  it("does not navigate when the field already matches the URL", async () => {
    render(<Field query="pawn" />);

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("clears back to the unsearched archive", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Field query="pawn" />);

    await user.click(screen.getByRole("button", { name: "Clear" }));
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(mocks.replace).toHaveBeenCalledWith("/archive", { scroll: false });
  });

  it("offers nothing to clear when the field is empty", () => {
    render(<Field query="" />);

    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("submits without waiting for the debounce", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Field query="" />);

    const input = screen.getByLabelText(PLACEHOLDER);
    await user.type(input, "clock{enter}");

    expect(mocks.replace).toHaveBeenCalledWith("/archive?q=clock", { scroll: false });
  });
});
