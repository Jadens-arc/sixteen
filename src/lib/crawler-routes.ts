/**
 * Paths that must stay reachable without a session, because the things that
 * fetch them - search engine crawlers, answer engines, link unfurlers, a
 * phone adding the app to a home screen - have no session to offer.
 *
 * This lives apart from middleware.ts so it can be asserted against in a test
 * without pulling Clerk in. The failure it guards is quiet and total: with
 * Clerk configured, a missing entry here redirects the crawler's request to
 * the sign-in page, and a site whose robots.txt 302s is a site with no
 * organic traffic.
 *
 * Note that the middleware's own matcher already skips paths ending in a
 * handful of static extensions (.svg, .ico, .webmanifest and friends), which
 * is why /icon.svg and /favicon.ico are not listed. ".txt", ".xml" and the
 * extensionless generated image routes are not among those extensions.
 */
export const CRAWLER_ROUTE_PATTERNS = [
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/manifest.webmanifest",
  "/opengraph-image(.*)",
  "/twitter-image(.*)",
  "/icon(.*)",
  "/apple-icon(.*)",
] as const;
