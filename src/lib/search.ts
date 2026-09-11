// Ceiling on a search string. Every verse in the scanned window is matched
// against it, so it stays short by construction.
export const MAX_SEARCH_LENGTH = 100;

/**
 * Collapses a raw query string from the URL into what the database should
 * actually be asked for, or null when there is nothing to search. Whitespace
 * is squeezed so "pawn   shop" finds the same rows as "pawn shop".
 */
export function normalizeSearchQuery(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  const query = raw.replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_LENGTH);
  return query.length > 0 ? query : null;
}

/**
 * Whether a piece of text contains the query, case-insensitively.
 *
 * This used to be an `ILIKE` pattern Postgres ran over the verse bodies. It
 * cannot be, now that those bodies are stored encrypted: matching happens
 * where the plaintext is, which is here. One upside comes free - a substring
 * search in JavaScript has no wildcards to escape, so `50%` looks for `50%`
 * without anything having to arrange that.
 */
export function matchesQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

// How much of a body an excerpt shows, and how far ahead of a hit the window
// starts so the match lands in context instead of at the left edge.
const EXCERPT_LENGTH = 180;
const EXCERPT_RADIUS = 60;

/**
 * A window onto a body: the text around the first hit when searching, the top
 * of it otherwise. A query that misses the body entirely - the row matched on
 * its prompt, or there is no query - reads as "start at the top", which is
 * exactly the preview an unsearched list wants.
 *
 * Ellipses mark a window that starts or ends mid-body, so a reader can tell a
 * clipped excerpt from a short verse.
 */
export function excerptAround(body: string, query: string | null): string {
  const at = query ? body.toLowerCase().indexOf(query.toLowerCase()) : -1;
  const start = at === -1 ? 0 : Math.max(at - EXCERPT_RADIUS, 0);

  const prefix = start > 0 ? "..." : "";
  const suffix = body.length > start + EXCERPT_LENGTH ? "..." : "";

  return `${prefix}${body.slice(start, start + EXCERPT_LENGTH)}${suffix}`;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Splits text into alternating plain and matching segments so a result can
 * show why it matched. Matching is case-insensitive to line up with the ILIKE
 * the rows were selected by.
 */
export function highlightSegments(text: string, query: string | null): HighlightSegment[] {
  const needle = query?.toLowerCase() ?? "";
  if (needle.length === 0) return [{ text, match: false }];

  const haystack = text.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (;;) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) break;

    if (at > cursor) segments.push({ text: text.slice(cursor, at), match: false });
    segments.push({ text: text.slice(at, at + needle.length), match: true });
    cursor = at + needle.length;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}
