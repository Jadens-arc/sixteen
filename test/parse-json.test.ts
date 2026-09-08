import { describe, expect, it } from "vitest";

import { parseModelJson, stripCodeFence } from "@/lib/ai/parse-json";

describe("stripCodeFence", () => {
  it("removes a json-tagged fence", () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("removes a bare fence", () => {
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("leaves unfenced text untouched", () => {
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}');
  });

  it("trims surrounding whitespace either way", () => {
    expect(stripCodeFence('  \n```json\n{"a":1}\n```\n  ')).toBe('{"a":1}');
  });
});

describe("parseModelJson", () => {
  it("parses a fenced JSON object", () => {
    expect(parseModelJson('```json\n{"a":1,"b":[2,3]}\n```')).toEqual({
      a: 1,
      b: [2, 3],
    });
  });

  it("parses plain JSON", () => {
    expect(parseModelJson('{"ok":true}')).toEqual({ ok: true });
  });

  it("throws on genuinely invalid JSON", () => {
    expect(() => parseModelJson("not json at all")).toThrow();
  });
});
