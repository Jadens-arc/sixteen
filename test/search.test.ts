import { describe, expect, it } from "vitest";

import {
  MAX_SEARCH_LENGTH,
  highlightSegments,
  likePattern,
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

describe("likePattern", () => {
  it("wraps the query as a substring match", () => {
    expect(likePattern("pawn")).toBe("%pawn%");
  });

  it("escapes wildcards so they match themselves", () => {
    expect(likePattern("50%")).toBe("%50\\%%");
    expect(likePattern("a_b")).toBe("%a\\_b%");
  });

  it("escapes a backslash without escaping its own escapes", () => {
    expect(likePattern("back\\slash")).toBe("%back\\\\slash%");
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
