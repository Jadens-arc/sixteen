import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PromptCard } from "@/components/prompt-card";
import type { DailyPrompt } from "@/lib/db/schema";

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

describe("PromptCard", () => {
  it("renders the concept and scenario", () => {
    render(<PromptCard prompt={prompt} />);
    expect(screen.getByText(prompt.concept)).toBeInTheDocument();
    expect(screen.getByText(prompt.scenario)).toBeInTheDocument();
  });

  it("renders the rhyme scheme and pocket", () => {
    render(<PromptCard prompt={prompt} />);
    expect(screen.getByText(prompt.rhymeScheme)).toBeInTheDocument();
    expect(screen.getByText(prompt.pocket)).toBeInTheDocument();
  });

  it("keeps the rhyme scheme, pocket and constraints closed under hard mode", () => {
    const { container } = render(<PromptCard prompt={prompt} />);

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("Hard mode")).toBeInTheDocument();

    for (const text of [
      prompt.rhymeScheme,
      prompt.pocket,
      ...prompt.constraints,
    ]) {
      expect(details).toContainElement(screen.getByText(text));
    }
  });

  it("renders every constraint", () => {
    render(<PromptCard prompt={prompt} />);
    for (const constraint of prompt.constraints) {
      expect(screen.getByText(constraint)).toBeInTheDocument();
    }
  });

  it("renders every word bank term", () => {
    render(<PromptCard prompt={prompt} />);
    for (const word of prompt.wordBank) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }
  });
});
