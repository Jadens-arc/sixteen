// Structured data is the one part of a page written for machines only: it is
// what lets a search engine show a rich result and what an answer engine
// reads when it wants facts rather than prose. Everything emitted here
// restates something a visitor can also see on the page - describing content
// that isn't rendered is what gets a site's rich results pulled.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON is embedded in HTML here, so a "<" inside any string value would
      // end the script element early. Escaping it keeps the payload valid
      // JSON (< parses back to "<") while making that impossible.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
