/**
 * One source of truth for everything a crawler, a social card or an answer
 * engine reads about this app. Metadata, JSON-LD, the sitemap, robots.txt and
 * the visible copy on the home page all pull from here, so a description is
 * never phrased two different ways in two different places.
 */

// Absolute URLs are not optional for SEO: canonical tags, Open Graph images,
// the sitemap and JSON-LD @id values all have to be fully qualified.
// NEXT_PUBLIC_SITE_URL wins because it is the only value that can name a
// custom domain. Vercel's project production URL comes next - it is the
// stable domain of the production deployment. VERCEL_URL is deliberately not
// used: on a preview build it is a per-deployment hostname, and pointing
// canonicals at one of those is how preview deploys end up in the index.
function resolveSiteUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);

  if (!configured) return "http://localhost:3000";

  const withScheme = /^https?:\/\//.test(configured)
    ? configured
    : `https://${configured}`;

  // A trailing slash here would double up in every URL built from it.
  return withScheme.replace(/\/+$/, "");
}

export const siteUrl = resolveSiteUrl();

export function absoluteUrl(path: string): string {
  return new URL(path, `${siteUrl}/`).toString();
}

export const siteName = "Sixteen";

export const siteTagline = "One prompt a day. Sixteen bars against the clock.";

// The description search engines show under the title, and the one an answer
// engine is most likely to quote back. It leads with what the thing is in
// plain words ("free daily rap writing prompt") because that is what people
// type, then says what you get, in under 160 characters of visible text.
export const siteDescription =
  "A free daily rap writing prompt: one 16-bar challenge every morning with a concept, a rhyme scheme, a pocket, constraints and a word bank. Write, count your bars, keep the streak.";

// Deliberately short. Keywords carry almost no ranking weight anymore, but the
// field is still read by some crawlers and costs nothing when it is honest
// about the page instead of stuffed.
export const siteKeywords = [
  "rap writing prompt",
  "daily rap prompt",
  "16 bar challenge",
  "rap prompt generator",
  "songwriting prompts",
  "freestyle practice",
  "hip hop writing exercise",
  "rhyme scheme practice",
  "lyric writing app",
];

export const twitterHandle: string | undefined =
  process.env.NEXT_PUBLIC_TWITTER_HANDLE;

/**
 * How the app works, in the order someone does it. Rendered on the home page
 * and emitted as HowTo structured data from the same array, so the steps a
 * crawler reads are the steps a visitor sees.
 */
export const howItWorks = [
  {
    name: "Read the day's prompt",
    text: "Every morning one prompt lands for everybody at once: a concept to write about, a scenario to write from, a rhyme scheme, a pocket to ride, a few constraints and a word bank. No account needed to read it.",
  },
  {
    name: "Write sixteen bars",
    text: "Write straight into the pad, one bar per line. The bar counter tracks your sixteen as you go and every keystroke autosaves, so nothing is lost if you close the tab mid-verse.",
  },
  {
    name: "Come back tomorrow",
    text: "Finishing a verse marks the day done and extends your streak. Old prompts stay in a searchable archive you can reopen and rewrite at any time - editing an old verse never costs you the day it earned.",
  },
] as const;

/**
 * Questions this app should be the answer to. These are written as real
 * questions people ask - out loud, to a search box or to an assistant - and
 * answered in the first sentence, because that first sentence is what gets
 * pulled into a featured snippet or an AI answer. The same array renders the
 * visible FAQ and the FAQPage structured data.
 */
export const faqs = [
  {
    question: "What is a 16-bar rap challenge?",
    answer:
      "A 16-bar challenge is writing one full verse - sixteen lines, where each line is one bar - against a fixed set of constraints. Sixteen bars is the standard length of a rap verse in 4/4 time, which is why it is the unit rappers practice in. Sixteen gives you a new one every day: a concept, a scenario, a rhyme scheme, a pocket, constraints and a word bank.",
  },
  {
    question: "How do I get better at writing rap verses?",
    answer:
      "Write one verse a day against constraints you did not choose. Constraints are what force new patterns - a rhyme scheme you avoid, a pocket you do not usually ride, words you would never reach for - and daily repetition is what turns them into instinct. A short verse finished every day beats a long one you rewrite for a month.",
  },
  {
    question: "Is Sixteen free?",
    answer:
      "Yes. Reading the day's prompt needs no account at all. Signing up is free and only exists so your verses, your archive and your streak have somewhere to live.",
  },
  {
    question: "Does everyone get the same rap prompt?",
    answer:
      "Yes. One prompt goes out per calendar day and everyone using Sixteen writes to it, the way everyone gets the same Wordle. Your verse against it is private to you.",
  },
  {
    question: "What is a rhyme scheme and a pocket?",
    answer:
      "A rhyme scheme is the pattern of which line endings rhyme with which - AABB means bars one and two rhyme and bars three and four rhyme; ABAB alternates. A pocket is where your syllables sit against the drums: the flow and tempo you ride, like a laid-back triplet at 78 BPM or a straight double-time. Every Sixteen prompt names both so you practise a specific one instead of defaulting to your habit.",
  },
  {
    question: "Can I write verses that are not from a prompt?",
    answer:
      "Yes. The notebook holds loose verses that answer to no prompt - nothing to finish, nothing counted toward a streak, just somewhere to put a verse that showed up on its own schedule.",
  },
  {
    question: "What happens if I miss a day?",
    answer:
      "Your streak of consecutive completed days resets, but nothing else does. Every past prompt stays in your archive and you can open any of them and write the verse late - the prompt itself never expires.",
  },
] as const;

// Google shows roughly 155 characters of a description and drops the rest
// mid-word. Cutting on a word boundary ourselves means the tail of the
// sentence is a decision rather than an accident.
export const MAX_DESCRIPTION_LENGTH = 155;

export function clampDescription(
  text: string,
  limit: number = MAX_DESCRIPTION_LENGTH,
): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= limit) return collapsed;

  // Leave room for the ellipsis so the result never exceeds the limit.
  const head = collapsed.slice(0, limit - 1);
  const lastSpace = head.lastIndexOf(" ");
  const cut = lastSpace > limit / 2 ? head.slice(0, lastSpace) : head;

  return `${cut.replace(/[\s,;:.-]+$/, "")}…`;
}
