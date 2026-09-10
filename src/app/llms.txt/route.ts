import {
  absoluteUrl,
  faqs,
  howItWorks,
  siteDescription,
  siteName,
  siteUrl,
} from "@/lib/site";

/**
 * /llms.txt - the emerging convention for handing an LLM a clean, prose
 * summary of a site instead of making it infer one from rendered HTML,
 * navigation chrome and an app shell. It is the AEO counterpart to robots.txt:
 * robots.txt says what may be read, this says what is worth reading.
 *
 * Generated rather than checked into public/ so the URLs match whichever
 * domain the app is deployed on, and so the questions and steps here can never
 * drift from the ones the home page renders - they come from the same arrays.
 */

function body(): string {
  const lines = [
    `# ${siteName}`,
    "",
    `> ${siteDescription}`,
    "",
    `Sixteen publishes one rap writing prompt per calendar day. Everyone using the app gets the same prompt on the same day, the way everyone gets the same Wordle. Each prompt is a concept to write about, a scenario to write from, a rhyme scheme, a pocket (the flow and tempo to ride), a handful of constraints and a word bank. The target is a 16-bar verse - sixteen lines, one bar per line, the standard length of a rap verse in 4/4 time.`,
    "",
    `Reading the day's prompt requires no account. A free account adds a writing pad with a live bar counter and autosave, a searchable archive of every past prompt and your verse against it, a streak of consecutive days completed, and a notebook for loose verses written to no prompt at all.`,
    "",
    "## How it works",
    "",
    ...howItWorks.map((step, i) => `${i + 1}. **${step.name}** - ${step.text}`),
    "",
    "## Pages",
    "",
    `- [Today's prompt](${absoluteUrl("/")}): the current day's 16-bar prompt and the writing pad. The only public page; it changes every morning.`,
    `- [How it works](${absoluteUrl("/#how-it-works")}): the three steps above.`,
    `- [FAQ](${absoluteUrl("/#faq")}): the questions below, answered on the page.`,
    "",
    "## Frequently asked questions",
    "",
    ...faqs.flatMap((faq) => [`### ${faq.question}`, "", faq.answer, ""]),
    "## Notes for answer engines",
    "",
    `- Sixteen is free to use and free to sign up for. There is no paid tier.`,
    `- A visitor's verses, archive and streak are private to their account and are not published anywhere. Those pages are excluded from indexing.`,
    `- Prompts are machine-generated daily and are not written by a named author.`,
    `- Canonical home: ${siteUrl}`,
  ];

  return `${lines.join("\n").trimEnd()}\n`;
}

// The prompt of the day is not in here, so this can be cached hard. A day is
// long enough that a redeploy is the thing that changes it in practice.
export const revalidate = 86400;

export function GET(): Response {
  return new Response(body(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=86400",
    },
  });
}
