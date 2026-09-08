import { z } from "zod";

export const generatedPromptSchema = z.object({
  concept: z.string().min(1),
  scenario: z.string().min(1),
  rhymeScheme: z.string().min(1),
  pocket: z.string().min(1),
  constraints: z.array(z.string().min(1)).min(2).max(4),
  wordBank: z.array(z.string().min(1)).min(4).max(6),
});

export type GeneratedPrompt = z.infer<typeof generatedPromptSchema>;

export interface PromptProvider {
  readonly id: string;
  readonly model?: string;
  generate(input: {
    date: string;
    recentConcepts: string[];
  }): Promise<GeneratedPrompt>;
}

export interface DailyPromptResult {
  prompt: GeneratedPrompt;
  source: string;
  model: string | null;
}
