import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NotebookList } from "@/components/notebook-list";
import type { NotebookEntry } from "@/lib/db/queries";

function entry(overrides: Partial<NotebookEntry> = {}): NotebookEntry {
  return {
    id: "note-1",
    barCount: 4,
    updatedAt: new Date("2026-03-04T15:00:00Z"),
    opening: "traded the chain for a ticket\nsecond bar here",
    excerpt: "traded the chain for a ticket\nsecond bar here",
    ...overrides,
  };
}

describe("NotebookList", () => {
  it("names a verse by its opening bar and links to it", () => {
    render(<NotebookList entries={[entry()]} />);

    const link = screen.getByRole("link", { name: /traded the chain/ });
    expect(link).toHaveAttribute("href", "/notebook/note-1");
  });

  it("does not repeat the opening bar underneath itself", () => {
    render(<NotebookList entries={[entry({ excerpt: "traded the chain for a ticket" })]} />);

    expect(screen.getAllByText(/traded the chain for a ticket/)).toHaveLength(1);
  });

  it("shows the surrounding text when a search matched deeper in", () => {
    const { container } = render(
      <NotebookList
        entries={[entry({ excerpt: "...bar eleven about a pawn shop..." })]}
        query="pawn shop"
      />,
    );

    // The phrase is split across <mark> boundaries by the highlight, so read
    // it back the way someone sees it rather than node by node.
    expect(container.textContent).toContain("bar eleven about a pawn shop");
  });

  it("marks the match", () => {
    const { container } = render(<NotebookList entries={[entry()]} query="ticket" />);

    expect(container.querySelectorAll("mark")[0]).toHaveTextContent("ticket");
  });

  it("counts one bar without pluralizing it", () => {
    render(<NotebookList entries={[entry({ barCount: 1 })]} />);

    expect(screen.getByText(/^1 bar -/)).toBeInTheDocument();
  });

  it("keeps an emptied verse reachable so it can be deleted", () => {
    render(<NotebookList entries={[entry({ opening: "   ", excerpt: "" })]} />);

    expect(screen.getByText("Empty verse")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/notebook/note-1");
  });

  it("names the query when a search finds nothing", () => {
    render(<NotebookList entries={[]} query="hydroplane" />);

    expect(screen.getByText(/matches "hydroplane"/)).toBeInTheDocument();
  });

  it("invites a first verse when the notebook is empty", () => {
    render(<NotebookList entries={[]} />);

    expect(screen.getByText(/nothing jotted yet/i)).toBeInTheDocument();
  });
});
