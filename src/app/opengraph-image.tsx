import { ImageResponse } from "next/og";

import { formatPromptDate } from "@/lib/date";
import { getOrCreateTodayPrompt } from "@/lib/db/queries";
import { siteName, siteTagline } from "@/lib/site";

export const alt = `${siteName} - ${siteTagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The card shows the day's actual concept, so a link shared in a group chat
// carries the prompt rather than a logo. That means a database read, which
// rules out generating this at build time.
export const dynamic = "force-dynamic";

const AMBER = "#f5a524";
const BACKGROUND = "#0d0d0d";

// Whatever the meter looks like, it reads as sixteen of something.
const BAR_HEIGHTS = [
  38, 62, 96, 128, 84, 150, 110, 172, 140, 190, 120, 96, 154, 78, 112, 56,
];

export default async function Image() {
  let concept: string | null = null;
  let dateLabel: string | null = null;

  // A share card is not worth a 500. If the database is unreachable - or has
  // no prompt yet on a fresh deploy - fall back to the plain brand card.
  try {
    const prompt = await getOrCreateTodayPrompt();
    concept = prompt.concept;
    dateLabel = formatPromptDate(prompt.promptDate);
  } catch {
    concept = null;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BACKGROUND,
          padding: "72px 80px",
          color: "#f2f2f2",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              letterSpacing: 14,
              textTransform: "uppercase",
              color: AMBER,
              fontWeight: 700,
            }}
          >
            Sixteen
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#a3a3a3" }}>
            {dateLabel ?? "A free daily rap writing prompt"}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: concept && concept.length > 46 ? 62 : 76,
              fontWeight: 700,
              lineHeight: 1.15,
              maxWidth: 1000,
            }}
          >
            {concept ?? siteTagline}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 190 }}>
            {BAR_HEIGHTS.map((height, i) => (
              <div
                key={i}
                style={{
                  width: 30,
                  height,
                  borderRadius: 15,
                  background: AMBER,
                  opacity: 0.35 + (i % 4) * 0.2,
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#a3a3a3" }}>
            16 bars. One prompt a day. Free, no account needed to read it.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
