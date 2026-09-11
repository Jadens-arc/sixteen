import { faqs, howItWorks, siteDescription } from "@/lib/site";

/**
 * The prose around the pad. It exists for two audiences at once: someone who
 * landed here from a search and needs to know what this is before they write
 * anything, and the crawlers and answer engines that can only rank or quote a
 * page that actually says what it does. Every answer leads with the answer -
 * the first sentence has to stand alone, because a snippet or an AI summary
 * usually takes nothing else.
 *
 * Neither audience is a signed-in visitor: they already know what the app is
 * and came back to write, so the home page renders all of this only while
 * signed out. A crawler is always signed out, so nothing here is ever hidden
 * from one.
 */

/** The sentence under the <h1> that says what the app is. */
export function SiteIntro() {
  return (
    <p className="text-muted-foreground text-sm leading-relaxed">
      {siteDescription} A new prompt lands every morning and everyone writes to
      the same one.
    </p>
  );
}

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="flex flex-col gap-4 scroll-mt-20"
    >
      <h2 id="how-it-works-heading" className="font-mono text-lg font-semibold">
        How Sixteen works
      </h2>
      <ol className="flex flex-col gap-4">
        {howItWorks.map((step, index) => (
          <li key={step.name} className="flex gap-3">
            <span
              aria-hidden
              className="text-primary font-mono text-sm font-semibold tabular-nums"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{step.name}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {step.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="flex flex-col gap-4 scroll-mt-20"
    >
      <h2 id="faq-heading" className="font-mono text-lg font-semibold">
        Questions about writing 16 bars a day
      </h2>
      <div className="flex flex-col divide-y border-y">
        {faqs.map((faq) => (
          // <details> keeps the page short without hiding anything: the answer
          // is in the HTML either way, which is all a crawler or an answer
          // engine reads.
          <details key={faq.question} className="group py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
              <h3 className="inline text-sm font-medium">{faq.question}</h3>
              <span
                aria-hidden
                className="text-muted-foreground shrink-0 font-mono text-xs transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {faq.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
