import { describe, expect, it } from "vitest";

import type { DailyPrompt } from "@/lib/db/schema";
import { faqs, howItWorks } from "@/lib/site";
import {
  dailyPromptGraph,
  faqGraph,
  howToGraph,
  siteGraph,
} from "@/lib/structured-data";

const prompt: DailyPrompt = {
  id: "prompt-1",
  promptDate: "2026-09-08",
  concept: "Write about outgrowing your block",
  scenario:
    "You go back to the corner store and none of the old heads recognize you anymore.",
  rhymeScheme: "AABB",
  pocket: "boom-bap, 88 BPM",
  constraints: ["No cursing", "Every bar starts with a different letter"],
  wordBank: ["concrete", "static", "lineage", "receipts"],
  source: "offline",
  model: null,
  createdAt: new Date("2026-09-08T00:00:00Z"),
};

function types(graph: Record<string, unknown>): string[] {
  const nodes = graph["@graph"] as Array<{ "@type": string }>;
  return nodes.map((node) => node["@type"]);
}

describe("siteGraph", () => {
  it("describes the site, the publisher and the app", () => {
    expect(types(siteGraph())).toEqual([
      "Organization",
      "WebSite",
      "WebApplication",
    ]);
  });

  it("states that the app is free, which is what a rich result reads", () => {
    const app = (siteGraph()["@graph"] as Array<Record<string, unknown>>)[2];
    expect(app.isAccessibleForFree).toBe(true);
    expect(app.offers).toMatchObject({ price: "0", priceCurrency: "USD" });
  });
});

describe("faqGraph", () => {
  it("carries every question the page renders, and nothing else", () => {
    const graph = faqGraph();
    const questions = graph.mainEntity as Array<Record<string, unknown>>;

    expect(graph["@type"]).toBe("FAQPage");
    expect(questions).toHaveLength(faqs.length);
    expect(questions.map((q) => q.name)).toEqual(faqs.map((f) => f.question));
  });

  it("pairs each question with its answer", () => {
    const questions = faqGraph().mainEntity as Array<Record<string, unknown>>;

    for (const [index, question] of questions.entries()) {
      expect(question["@type"]).toBe("Question");
      expect(question.acceptedAnswer).toEqual({
        "@type": "Answer",
        text: faqs[index].answer,
      });
    }
  });
});

describe("howToGraph", () => {
  it("numbers the steps in the order they are rendered", () => {
    const steps = howToGraph().step as Array<Record<string, unknown>>;

    expect(steps).toHaveLength(howItWorks.length);
    expect(steps.map((step) => step.position)).toEqual([1, 2, 3]);
    expect(steps.map((step) => step.name)).toEqual(
      howItWorks.map((step) => step.name),
    );
  });
});

describe("dailyPromptGraph", () => {
  it("dates the prompt so a crawler sees the page change daily", () => {
    const graph = dailyPromptGraph(prompt);

    expect(graph["@type"]).toBe("CreativeWork");
    expect(graph.datePublished).toBe("2026-09-08");
    expect(graph["@id"]).toContain("prompt-2026-09-08");
  });

  it("describes only what the card also shows", () => {
    const graph = dailyPromptGraph(prompt);

    expect(graph.headline).toBe(prompt.concept);
    expect(graph.abstract).toBe(prompt.scenario);
    for (const word of prompt.wordBank) {
      expect(graph.keywords).toContain(word);
    }
    for (const constraint of prompt.constraints) {
      expect(graph.text).toContain(constraint);
    }
  });
});
