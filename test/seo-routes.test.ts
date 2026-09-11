import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { CRAWLER_ROUTE_PATTERNS } from "@/lib/crawler-routes";
import { todayInAppTimezone } from "@/lib/date";

describe("robots", () => {
  it("opens the site up and points at the sitemap", () => {
    const rules = robots();
    const rule = Array.isArray(rules.rules) ? rules.rules[0] : rules.rules;

    expect(rule?.userAgent).toBe("*");
    expect(rule?.allow).toBe("/");
    expect(rules.sitemap).toContain("/sitemap.xml");
  });

  it("keeps the pages that need a session out of the crawl", () => {
    const rules = robots();
    const rule = Array.isArray(rules.rules) ? rules.rules[0] : rules.rules;
    const disallowed = [rule?.disallow ?? []].flat();

    expect(disallowed).toContain("/archive");
    expect(disallowed).toContain("/notebook");
    expect(disallowed).toContain("/api/");
  });

  it("never disallows a path a crawler has to fetch", () => {
    const rules = robots();
    const rule = Array.isArray(rules.rules) ? rules.rules[0] : rules.rules;
    const disallowed = [rule?.disallow ?? []].flat();

    for (const pattern of CRAWLER_ROUTE_PATTERNS) {
      const path = pattern.replace("(.*)", "");
      expect(disallowed.some((entry) => path.startsWith(entry))).toBe(false);
    }
  });
});

describe("sitemap", () => {
  it("lists the one public page and nothing that needs a session", () => {
    const entries = sitemap();

    expect(entries).toHaveLength(1);
    expect(entries[0].url).toMatch(/\/$/);
    expect(entries[0].changeFrequency).toBe("daily");
  });

  it("reports today as the last modification, because a prompt lands daily", () => {
    expect(sitemap()[0].lastModified).toBe(todayInAppTimezone());
  });
});

describe("manifest", () => {
  it("is installable: a scope, a start URL and an icon", () => {
    const result = manifest();

    expect(result.start_url).toBe("/");
    expect(result.display).toBe("standalone");
    expect(result.icons?.length).toBeGreaterThan(0);
    expect(result.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
  });
});

describe("crawler routes", () => {
  // The middleware protects every path its matcher does not skip, and the
  // matcher only skips a fixed list of file extensions. Anything a crawler
  // fetches that is not in that list has to be named here or it 302s to
  // sign-in the moment Clerk is configured.
  const SKIPPED_BY_MATCHER = /\.(?:html?|css|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|zip|webmanifest)$/;

  it("covers robots.txt, the sitemap, llms.txt and the generated images", () => {
    for (const path of [
      "/robots.txt",
      "/sitemap.xml",
      "/llms.txt",
      "/opengraph-image",
      "/twitter-image",
      "/apple-icon",
    ]) {
      expect(SKIPPED_BY_MATCHER.test(path)).toBe(false);
      expect(
        CRAWLER_ROUTE_PATTERNS.some(
          (pattern) => pattern.replace("(.*)", "") === path,
        ),
      ).toBe(true);
    }
  });
});
