import { afterEach, describe, expect, it, vi } from "vitest";

import { clampDescription, MAX_DESCRIPTION_LENGTH } from "@/lib/site";

// siteUrl is resolved once at module load, so each case needs a fresh module
// registry with the environment already in place.
async function loadSite(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  return import("@/lib/site");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("siteUrl", () => {
  it("prefers the explicitly configured origin", async () => {
    const site = await loadSite({
      NEXT_PUBLIC_SITE_URL: "https://sixteen.rap",
      VERCEL_PROJECT_PRODUCTION_URL: "sixteen.vercel.app",
    });
    expect(site.siteUrl).toBe("https://sixteen.rap");
  });

  it("falls back to Vercel's production domain, not a preview deployment", async () => {
    const site = await loadSite({
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: "sixteen.vercel.app",
      VERCEL_URL: "sixteen-git-branch-abc123.vercel.app",
    });
    expect(site.siteUrl).toBe("https://sixteen.vercel.app");
  });

  it("falls back to localhost when nothing is configured", async () => {
    const site = await loadSite({
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
    });
    expect(site.siteUrl).toBe("http://localhost:3000");
  });

  it("adds a scheme and drops a trailing slash", async () => {
    const site = await loadSite({ NEXT_PUBLIC_SITE_URL: "sixteen.rap/" });
    expect(site.siteUrl).toBe("https://sixteen.rap");
  });

  it("builds absolute URLs without doubling the slash", async () => {
    const site = await loadSite({ NEXT_PUBLIC_SITE_URL: "https://sixteen.rap" });
    expect(site.absoluteUrl("/")).toBe("https://sixteen.rap/");
    expect(site.absoluteUrl("/sitemap.xml")).toBe(
      "https://sixteen.rap/sitemap.xml",
    );
  });
});

describe("clampDescription", () => {
  it("leaves a short description alone", () => {
    expect(clampDescription("Sixteen bars a day.")).toBe("Sixteen bars a day.");
  });

  it("collapses whitespace", () => {
    expect(clampDescription("Sixteen\n  bars   a day.")).toBe(
      "Sixteen bars a day.",
    );
  });

  it("cuts on a word boundary and stays within the limit", () => {
    const long = `${"word ".repeat(60)}end`;
    const clamped = clampDescription(long);

    expect(clamped.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    expect(clamped.endsWith("…")).toBe(true);
    expect(clamped).not.toContain("wor…");
  });

  it("does not leave punctuation stranded before the ellipsis", () => {
    const clamped = clampDescription(`${"alpha, ".repeat(40)}omega`, 30);
    expect(clamped).not.toMatch(/[,\s]…$/);
  });

  it("honours a caller-supplied limit", () => {
    expect(clampDescription("one two three four five", 12).length).toBeLessThanOrEqual(12);
  });
});
