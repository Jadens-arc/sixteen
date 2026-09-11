import type { MetadataRoute } from "next";

import { siteDescription, siteName, siteTagline } from "@/lib/site";

// A manifest is what lets someone keep a daily habit on their home screen
// rather than in a tab, which for a write-every-morning app is the difference
// between coming back and not.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteName} - ${siteTagline}`,
    short_name: siteName,
    description: siteDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d0d0d",
    theme_color: "#0d0d0d",
    categories: ["education", "productivity", "music"],
    lang: "en-US",
    icons: [
      {
        src: "/icon.svg",
        // An SVG scales to every launcher size, so one entry replaces the
        // usual pile of PNGs. "maskable" lets Android crop it to the platform
        // shape without a white halo; the artwork keeps clear of the edges.
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
