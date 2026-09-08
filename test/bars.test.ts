import { describe, expect, it } from "vitest";

import { BAR_TARGET, countBars, splitQuatrains } from "@/lib/bars";

describe("countBars", () => {
  it("counts non-empty lines", () => {
    expect(countBars("one\ntwo\nthree")).toBe(3);
  });

  it("ignores blank lines", () => {
    expect(countBars("one\n\ntwo\n\nthree")).toBe(3);
  });

  it("ignores whitespace-only lines", () => {
    expect(countBars("one\n   \ntwo\n\t\nthree")).toBe(3);
  });

  it("returns zero for an empty body", () => {
    expect(countBars("")).toBe(0);
  });
});

describe("splitQuatrains", () => {
  it("groups non-empty lines into sets of four", () => {
    const body = Array.from({ length: BAR_TARGET }, (_, i) => `bar ${i + 1}`).join(
      "\n",
    );

    const quatrains = splitQuatrains(body);

    expect(quatrains).toHaveLength(4);
    quatrains.forEach((quatrain) => expect(quatrain).toHaveLength(4));
    expect(quatrains[0]).toEqual(["bar 1", "bar 2", "bar 3", "bar 4"]);
    expect(quatrains[3]).toEqual(["bar 13", "bar 14", "bar 15", "bar 16"]);
  });

  it("drops blank lines before grouping", () => {
    const quatrains = splitQuatrains("a\n\nb\nc\n   \nd\ne");

    expect(quatrains).toEqual([
      ["a", "b", "c", "d"],
      ["e"],
    ]);
  });

  it("returns an empty array for an empty body", () => {
    expect(splitQuatrains("")).toEqual([]);
  });
});
