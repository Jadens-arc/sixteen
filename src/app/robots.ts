import type { MetadataRoute } from "next";

import { absoluteUrl, siteUrl } from "@/lib/site";

// Only the day's prompt is public. The archive, the notebook and the sign-in
// flow either need a session or have nothing to rank for, and letting a
// crawler queue them wastes the crawl budget that should go to the one page
// that changes every morning. Disallowing them is not a privacy control -
// requireUserId() is - it just keeps them out of the index.
const PRIVATE_PATHS = [
  "/archive",
  "/notebook",
  "/settings",
  "/sign-in",
  "/sign-up",
  "/api/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteUrl,
  };
}
