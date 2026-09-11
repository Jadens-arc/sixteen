import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ArchiveList } from "@/components/archive-list";
import type { ArchiveEntry } from "@/lib/db/queries";

vi.mock("@/lib/crypto/vault-context", async () => (await import("./vault-mock")).vaultModuleMock());

function entry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    prompt: {
      id: "prompt-1",
      promptDate: "2026-03-04",
      concept: "The pawn shop clock",
      scenario: "Write from behind the counter.",
      rhymeScheme: "AABB",
      pocket: "boom bap, 88 bpm",
      constraints: ["No adlibs"],
      wordBank: ["ticket"],
      source: "offline",
      model: null,
      createdAt: new Date("2026-03-04T10:00:00Z"),
    },
    verse: {
      sealed: false,
      barCount: 8,
      completedAt: null,
      excerpt: "traded the chain for a ticket",
    },
    ...overrides,
  };
}

describe("ArchiveList", () => {
  it("links each entry to its own day", () => {
    render(<ArchiveList entries={[entry()]} />);

    expect(screen.getByRole("link", { name: /pawn shop clock/i })).toHaveAttribute(
      "href",
      "/archive/2026-03-04",
    );
  });

  it("previews the verse under the bar meter", () => {
    render(<ArchiveList entries={[entry()]} />);

    expect(screen.getByText(/traded the chain for a ticket/)).toBeInTheDocument();
  });

  it("leaves the excerpt out when nothing is written yet", () => {
    render(<ArchiveList entries={[entry({ verse: null })]} />);

    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(screen.queryByTestId("bar-segment")).not.toBeInTheDocument();
  });

  it("marks what the search matched", () => {
    const { container } = render(<ArchiveList entries={[entry()]} query="ticket" />);

    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("ticket");
  });

  it("names the query when a search finds nothing", () => {
    render(<ArchiveList entries={[]} query="hydroplane" />);

    expect(screen.getByText(/matches "hydroplane"/)).toBeInTheDocument();
  });

  it("falls back to the empty archive copy without a search", () => {
    render(<ArchiveList entries={[]} />);

    expect(screen.getByText(/no prompts yet/i)).toBeInTheDocument();
  });
});
