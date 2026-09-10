import { describe, expect, it } from "vitest";

import { addDays, formatPromptDate, isPromptDate } from "@/lib/date";

describe("isPromptDate", () => {
  it("accepts a calendar date in the stored format", () => {
    expect(isPromptDate("2026-03-04")).toBe(true);
    expect(isPromptDate("2024-02-29")).toBe(true);
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    expect(isPromptDate("yesterday")).toBe(false);
    expect(isPromptDate("2026-3-4")).toBe(false);
    expect(isPromptDate("2026-03-04'; drop table verses--")).toBe(false);
    expect(isPromptDate("")).toBe(false);
  });

  it("rejects a date the calendar does not have", () => {
    expect(isPromptDate("2026-02-31")).toBe(false);
    expect(isPromptDate("2026-13-01")).toBe(false);
    expect(isPromptDate("2025-02-29")).toBe(false);
  });
});

describe("addDays", () => {
  it("walks back across a month boundary", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("formatPromptDate", () => {
  it("reads the stored date without shifting it into another day", () => {
    expect(formatPromptDate("2026-03-04")).toBe("Wednesday, March 4");
  });
});
