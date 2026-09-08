import { describe, expect, it } from "vitest";

import { OfflineProvider } from "@/lib/ai/providers/offline";
import { generatedPromptSchema } from "@/lib/ai/types";

describe("OfflineProvider", () => {
  it("is deterministic for a given date", async () => {
    const provider = new OfflineProvider();

    const first = await provider.generate({ date: "2026-03-14", recentConcepts: [] });
    const second = await provider.generate({ date: "2026-03-14", recentConcepts: [] });

    expect(first).toEqual(second);
  });

  it("produces different prompts on different dates", async () => {
    const provider = new OfflineProvider();

    const a = await provider.generate({ date: "2026-01-01", recentConcepts: [] });
    const b = await provider.generate({ date: "2026-06-15", recentConcepts: [] });
    const c = await provider.generate({ date: "2026-11-30", recentConcepts: [] });

    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
    expect(a).not.toEqual(c);
  });

  it("always satisfies the generated prompt schema", async () => {
    const provider = new OfflineProvider();
    const dates = ["2026-01-01", "2026-04-20", "2026-09-08", "2026-12-25"];

    for (const date of dates) {
      const prompt = await provider.generate({ date, recentConcepts: [] });
      expect(generatedPromptSchema.safeParse(prompt).success).toBe(true);
    }
  });

  it("never needs a model id since it never calls one", async () => {
    const provider = new OfflineProvider();
    const prompt = await provider.generate({ date: "2026-09-08", recentConcepts: [] });

    expect(provider.id).toBe("offline");
    expect(provider.model).toBeUndefined();
    expect(prompt.constraints.length).toBeGreaterThanOrEqual(2);
    expect(prompt.wordBank.length).toBeGreaterThanOrEqual(4);
  });
});
