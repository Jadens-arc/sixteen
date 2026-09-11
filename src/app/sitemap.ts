import type { MetadataRoute } from "next";

import { todayInAppTimezone } from "@/lib/date";
import { absoluteUrl } from "@/lib/site";

// A sitemap that lists pages a crawler is told elsewhere not to index is a
// contradiction, so this holds exactly the public surface: the home page. Its
// lastModified is today's date in the app's timezone because that is the
// truth - a new prompt lands every morning, and saying so is what earns a
// daily recrawl instead of a monthly one.
// Without this the sitemap is prerendered once at build time and its
// lastModified is frozen at the date of the deploy - which would tell crawlers
// the daily prompt stopped changing the day it shipped.
export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl("/"),
      lastModified: todayInAppTimezone(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
