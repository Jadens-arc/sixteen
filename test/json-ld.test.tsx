import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JsonLd } from "@/components/json-ld";

function scriptContent(data: Record<string, unknown>): string {
  const { container } = render(<JsonLd data={data} />);
  return (
    container.querySelector('script[type="application/ld+json"]')
      ?.textContent ?? ""
  );
}

describe("JsonLd", () => {
  it("emits the payload as parseable JSON", () => {
    const data = { "@type": "WebSite", name: "Sixteen" };
    expect(JSON.parse(scriptContent(data))).toEqual(data);
  });

  it("escapes a '<' so a value can never close the script element early", () => {
    const content = scriptContent({ text: "</script><img onerror=alert(1)>" });

    expect(content).not.toContain("</script>");
    expect(content).toContain("\\u003c");
    // Still valid JSON, and still the original string once parsed.
    expect(JSON.parse(content)).toEqual({
      text: "</script><img onerror=alert(1)>",
    });
  });
});
