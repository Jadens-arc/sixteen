import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Faq, HowItWorks } from "@/components/site-copy";
import { faqs, howItWorks } from "@/lib/site";

describe("HowItWorks", () => {
  it("renders every step under a heading", () => {
    render(<HowItWorks />);

    expect(
      screen.getByRole("heading", { name: /how sixteen works/i }),
    ).toBeInTheDocument();
    for (const step of howItWorks) {
      expect(screen.getByRole("heading", { name: step.name })).toBeInTheDocument();
      expect(screen.getByText(step.text)).toBeInTheDocument();
    }
  });
});

describe("Faq", () => {
  it("renders every question as a heading", () => {
    render(<Faq />);

    for (const faq of faqs) {
      expect(
        screen.getByRole("heading", { name: faq.question }),
      ).toBeInTheDocument();
    }
  });

  it("puts every answer in the markup even while collapsed", () => {
    // A collapsed <details> still holds its answer in the DOM, which is the
    // whole reason it is safe to use here: a crawler and an answer engine read
    // the markup, not the open state.
    render(<Faq />);

    for (const faq of faqs) {
      expect(screen.getByText(faq.answer)).toBeInTheDocument();
    }
  });
});
