import type { Metadata } from "next";

/**
 * Everything behind sign-in. A crawler that reaches one of these gets the
 * sign-in page, so indexing it would put a login screen in results under this
 * site's name and spend crawl budget that belongs to the one page that
 * changes every morning.
 *
 * `follow` stays on: the pages themselves shouldn't rank, but the links back
 * to the home page on them should still count.
 *
 * robots.ts disallows the same paths. Both are needed and neither is
 * redundant: a disallowed page can still be indexed from an external link
 * precisely because the crawler is not allowed to fetch it and read this tag.
 */
export function privatePageMetadata(title: string): Metadata {
  return {
    title,
    robots: {
      index: false,
      follow: true,
      googleBot: { index: false, follow: true },
    },
  };
}
