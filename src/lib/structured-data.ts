import { formatPromptDate } from "@/lib/date";
import type { DailyPrompt } from "@/lib/db/schema";
import {
  absoluteUrl,
  faqs,
  howItWorks,
  siteDescription,
  siteName,
  siteUrl,
} from "@/lib/site";

// Stable @id values let the separate graphs on different pages refer to the
// same site and the same app rather than each declaring a new one.
const websiteId = `${siteUrl}/#website`;
const appId = `${siteUrl}/#app`;
const organizationId = `${siteUrl}/#organization`;

type Graph = Record<string, unknown>;

/**
 * The site itself, emitted on every page: who publishes it, what the software
 * is, and that it costs nothing. The price of 0 is the part that earns the
 * "Free" treatment in a rich result, and it is the fact an answer engine
 * needs to answer "is it free" without guessing.
 */
export function siteGraph(): Graph {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: siteName,
        url: siteUrl,
        logo: absoluteUrl("/icon.svg"),
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: siteUrl,
        name: siteName,
        description: siteDescription,
        inLanguage: "en-US",
        publisher: { "@id": organizationId },
      },
      {
        "@type": "WebApplication",
        "@id": appId,
        name: siteName,
        url: siteUrl,
        description: siteDescription,
        applicationCategory: "https://schema.org/EducationalApplication",
        applicationSubCategory: "Writing practice",
        operatingSystem: "Any modern web browser",
        browserRequirements: "Requires JavaScript.",
        isAccessibleForFree: true,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
        featureList: [
          "A new 16-bar rap writing prompt every day",
          "Concept, scenario, rhyme scheme, pocket, constraints and word bank",
          "Writing pad with a live bar counter and autosave",
          "Searchable archive of past prompts and verses",
          "Streak of consecutive days completed",
          "Notebook for loose verses written without a prompt",
        ],
        publisher: { "@id": organizationId },
      },
    ],
  };
}

/**
 * The questions the home page answers in prose, restated for the machines
 * that quote answers rather than rank pages.
 */
export function faqGraph(): Graph {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${siteUrl}/#faq`,
    inLanguage: "en-US",
    isPartOf: { "@id": websiteId },
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

/** The three steps rendered under "How it works", as a HowTo. */
export function howToGraph(): Graph {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${siteUrl}/#how-it-works`,
    name: "How to write a 16-bar verse every day",
    description:
      "Read the day's prompt, write sixteen bars against its constraints, and come back tomorrow to keep the streak.",
    totalTime: "PT30M",
    step: howItWorks.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

/**
 * Today's prompt as a thing in its own right, so a search engine indexing the
 * home page sees dated, changing content instead of one static page - which
 * is what earns a daily crawl.
 */
export function dailyPromptGraph(prompt: DailyPrompt): Graph {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${siteUrl}/#prompt-${prompt.promptDate}`,
    name: `${formatPromptDate(prompt.promptDate)}: ${prompt.concept}`,
    headline: prompt.concept,
    abstract: prompt.scenario,
    datePublished: prompt.promptDate,
    genre: "Rap writing prompt",
    inLanguage: "en-US",
    isPartOf: { "@id": websiteId },
    publisher: { "@id": organizationId },
    keywords: [
      prompt.concept,
      `rhyme scheme: ${prompt.rhymeScheme}`,
      `pocket: ${prompt.pocket}`,
      ...prompt.wordBank,
    ].join(", "),
    text: [prompt.scenario, ...prompt.constraints].join(" "),
  };
}
