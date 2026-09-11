import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatPromptDate } from "@/lib/date";
import type { DailyPrompt } from "@/lib/db/schema";

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

// The extra rules are opt-in: the concept and scenario are enough to write to,
// and someone who wants the harder version opens this. A native <details>
// keeps the card a server component and leaves the content in the page for
// find-in-page and search engines even while it's closed.
function HardMode({ prompt }: { prompt: DailyPrompt }) {
  return (
    <details className="group flex flex-col gap-2">
      <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer list-none items-center gap-1.5 text-xs tracking-wide uppercase transition-colors [&::-webkit-details-marker]:hidden">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5 transition-transform group-open:rotate-90"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        Hard mode
      </summary>

      <div className="flex flex-col gap-5 pt-4">
        <div className="grid grid-cols-2 gap-4">
          <Meta label="Rhyme scheme" value={prompt.rhymeScheme} />
          <Meta label="Pocket" value={prompt.pocket} />
        </div>

        <Section label="Constraints">
          <ul className="flex flex-col gap-1.5 text-sm">
            {prompt.constraints.map((constraint, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-muted-foreground">
                  -
                </span>
                {constraint}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </details>
  );
}

export function PromptCard({ prompt }: { prompt: DailyPrompt }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono">
          {formatPromptDate(prompt.promptDate)}
        </CardDescription>
        {/* The concept is the heading of this card in every sense, so it is
            an <h2> rather than the styled div <CardTitle> would render.
            Carrying the same data-slot keeps the card's grid styling; being a
            real heading is what gives the page an outline a crawler, a screen
            reader and an answer engine can all follow. */}
        <h2
          data-slot="card-title"
          className="text-xl leading-snug font-semibold"
        >
          {prompt.concept}
        </h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-sm leading-relaxed">{prompt.scenario}</p>

        <Section label="Word bank">
          <div className="flex flex-wrap gap-2">
            {prompt.wordBank.map((word, i) => (
              <Badge key={i} variant="secondary" className="font-mono">
                {word}
              </Badge>
            ))}
          </div>
        </Section>

        <Separator />

        <HardMode prompt={prompt} />
      </CardContent>
    </Card>
  );
}
