import { describe, expect, it } from "vitest";

import {
  MAX_SEARCH_LENGTH,
  excerptAround,
  highlightSegments,
  matchesQuery,
  normalizeSearchQuery,
} from "@/lib/search";

describe("normalizeSearchQuery", () => {
  it("returns null for nothing to search", () => {
    expect(normalizeSearchQuery(null)).toBeNull();
    expect(normalizeSearchQuery(undefined)).toBeNull();
    expect(normalizeSearchQuery("")).toBeNull();
    expect(normalizeSearchQuery("   ")).toBeNull();
  });

  it("collapses whitespace so spacing does not change the results", () => {
    expect(normalizeSearchQuery("  pawn   shop\n")).toBe("pawn shop");
  });

  it("caps the query length", () => {
    const query = normalizeSearchQuery("x".repeat(MAX_SEARCH_LENGTH + 50));
    expect(query).toHaveLength(MAX_SEARCH_LENGTH);
  });

  it("ignores a value that is not a string", () => {
    expect(normalizeSearchQuery(42 as unknown as string)).toBeNull();
  });
});

describe("matchesQuery", () => {
  it("matches a substring anywhere in the text", () => {
    expect(matchesQuery("a bar about a pawn shop", "pawn")).toBe(true);
    expect(matchesQuery("a bar about a pawn shop", "bodega")).toBe(false);
  });

  it("ignores case on both sides", () => {
    expect(matchesQuery("PAWN shop", "pawn")).toBe(true);
    expect(matchesQuery("pawn shop", "PAWN")).toBe(true);
  });

  it("treats wildcards as the characters they are", () => {
    expect(matchesQuery("up 50% on the month", "50%")).toBe(true);
    expect(matchesQuery("nothing like it", "50%")).toBe(false);
    expect(matchesQuery("a_b", "a_b")).toBe(true);
    expect(matchesQuery("axb", "a_b")).toBe(false);
  });
});

describe("excerptAround", () => {
  const long = "x".repeat(400);

  it("returns a short body whole, unmarked", () => {
    expect(excerptAround("one bar", null)).toBe("one bar");
  });

  it("returns the top of a long body when there is no query", () => {
    const excerpt = excerptAround(long, null);
    expect(excerpt.startsWith("...")).toBe(false);
    expect(excerpt.endsWith("...")).toBe(true);
  });

  it("starts ahead of the hit so the match lands in context", () => {
    const body = `${"a".repeat(300)}pawn shop${"b".repeat(300)}`;
    const excerpt = excerptAround(body, "pawn");

    expect(excerpt).toContain("pawn shop");
    expect(excerpt.startsWith("...a")).toBe(true);
    expect(excerpt.indexOf("pawn")).toBeGreaterThan(3);
  });

  it("starts at the top when the query is not in the body", () => {
    const body = `opening bar${"c".repeat(400)}`;
    expect(excerptAround(body, "nowhere").startsWith("opening bar")).toBe(true);
  });

  it("matches case-insensitively, like the search that selected the row", () => {
    const body = `${"a".repeat(300)}PAWN shop`;
    expect(excerptAround(body, "pawn")).toContain("PAWN shop");
  });

  it("says nothing about an empty body", () => {
    expect(excerptAround("", "pawn")).toBe("");
  });
});

describe("highlightSegments", () => {
  it("returns the whole text as one plain segment with no query", () => {
    expect(highlightSegments("cold night", null)).toEqual([
      { text: "cold night", match: false },
    ]);
  });

  it("marks every occurrence, case-insensitively", () => {
    expect(highlightSegments("Cold nights get cold", "cold")).toEqual([
      { text: "Cold", match: true },
      { text: " nights get ", match: false },
      { text: "cold", match: true },
    ]);
  });

  it("keeps the original casing of the matched text", () => {
    const segments = highlightSegments("PAWN shop", "pawn");
    expect(segments[0]).toEqual({ text: "PAWN", match: true });
  });

  it("rebuilds the original text exactly", () => {
    const text = "first bar\nsecond bar about a pawn shop";
    const joined = highlightSegments(text, "bar")
      .map((segment) => segment.text)
      .join("");
    expect(joined).toBe(text);
  });

  it("returns nothing marked when the query is absent from the text", () => {
    const segments = highlightSegments("cold night", "warm");
    expect(segments).toEqual([{ text: "cold night", match: false }]);
  });
});
