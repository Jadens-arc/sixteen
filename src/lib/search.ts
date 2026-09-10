// Ceiling on a search string. The query becomes a LIKE pattern that Postgres
// scans every archived verse body with, so it stays short by construction.
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
 * Wraps a query as a substring LIKE pattern. The wildcards a person types are
 * literal characters to them - searching for "50%" should find the bar with
 * "50%" in it, not every row - so they're escaped rather than passed through.
 * Backslash goes first, or it would escape the escapes added after it.
 */
export function likePattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
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
