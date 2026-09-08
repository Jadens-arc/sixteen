import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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

export function PromptCard({ prompt }: { prompt: DailyPrompt }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono">
          {formatPromptDate(prompt.promptDate)}
        </CardDescription>
        <CardTitle className="text-xl leading-snug font-semibold">
          {prompt.concept}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-sm leading-relaxed">{prompt.scenario}</p>

        <div className="grid grid-cols-2 gap-4">
          <Meta label="Rhyme scheme" value={prompt.rhymeScheme} />
          <Meta label="Pocket" value={prompt.pocket} />
        </div>

        <Separator />

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

        <Section label="Word bank">
          <div className="flex flex-wrap gap-2">
            {prompt.wordBank.map((word, i) => (
              <Badge key={i} variant="secondary" className="font-mono">
                {word}
              </Badge>
            ))}
          </div>
        </Section>
      </CardContent>
    </Card>
  );
}
