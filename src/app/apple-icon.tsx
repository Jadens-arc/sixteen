import { ImageResponse } from "next/og";

// Safari refuses SVG for the home-screen icon, so the one PNG that has to
// exist is generated rather than checked in as a binary.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BAR_HEIGHTS = [26, 44, 68, 92, 74, 108, 60, 34];

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 8,
          paddingBottom: 40,
          background: "#0d0d0d",
        }}
      >
        {BAR_HEIGHTS.map((height, i) => (
          <div
            key={i}
            style={{ width: 10, height, borderRadius: 5, background: "#f5a524" }}
          />
        ))}
      </div>
    ),
    size,
  );
}
