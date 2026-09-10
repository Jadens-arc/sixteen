import { highlightSegments } from "@/lib/search";

// Shows a searcher what a row matched on, without the highlight leaking into
// the text itself - the segments are the same string, split.
export function Highlighted({
  text,
  query,
}: {
  text: string;
  query: string | null;
}) {
  return (
    <>
      {highlightSegments(text, query).map((segment, i) =>
        segment.match ? (
          <mark key={i} className="bg-primary/20 text-foreground rounded-sm">
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}
