import { describe, expect, it } from "vitest";

import { buildPromptMessages } from "@/lib/ai/prompt-request";

const REQUIRED_KEYS = [
  "concept",
  "scenario",
  "rhymeScheme",
  "pocket",
  "constraints",
  "wordBank",
];

describe("buildPromptMessages", () => {
  it("asks for every key the schema requires", () => {
    const { system } = buildPromptMessages({ date: "2026-09-10", recentConcepts: [] });

    for (const key of REQUIRED_KEYS) {
      expect(system).toContain(`"${key}"`);
    }
  });

  it("states the count bounds the schema enforces", () => {
    const { system } = buildPromptMessages({ date: "2026-09-10", recentConcepts: [] });

    expect(system).toContain("2 to 4 concrete writing constraints");
    expect(system).toContain("4 to 6 words or short phrases");
  });

  it("tells the model to escape quotes inside string values", () => {
    // A model that writes 'Do not use the word "cash"' unescaped produces
    // JSON that JSON.parse rejects, dropping the day to the offline provider.
    const { system } = buildPromptMessages({ date: "2026-09-10", recentConcepts: [] });

    expect(system).toMatch(/escape any quotation marks/i);
  });

  // The format comments used to carry sample values, and models copied them
  // instead of treating them as illustrations - every provider came back in
  // the same narrow tempo band. Keep the field descriptions specimen-free.
  it("gives no sample tempo or rhyme scheme the model can copy", () => {
    const { system } = buildPromptMessages({ date: "2026-09-10", recentConcepts: [] });
    const shape = system.slice(system.indexOf("{"));

    expect(shape).not.toMatch(/\d{2,3}\s*BPM/i);
    expect(shape).not.toMatch(/\bA[AB]{3}\b/);
  });

  it("dates the user message and leaves it bare with no history", () => {
    const { user } = buildPromptMessages({ date: "2026-09-10", recentConcepts: [] });

    expect(user).toBe("Write today's prompt, dated 2026-09-10.");
  });

  it("lists recent concepts to avoid when there are some", () => {
    const { user } = buildPromptMessages({
      date: "2026-09-10",
      recentConcepts: ["a pawn shop ticket", "a tow truck at dawn"],
    });

    expect(user).toContain("dated 2026-09-10.");
    expect(user).toContain("a pawn shop ticket; a tow truck at dawn.");
  });
});
