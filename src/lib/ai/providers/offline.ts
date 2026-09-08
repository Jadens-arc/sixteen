import {
  CONCEPTS,
  CONSTRAINTS,
  POCKETS,
  RHYME_SCHEMES,
  SCENARIOS,
  WORD_BANK,
} from "../offline-data";
import { SeededRandom } from "../seeded-random";
import type { GeneratedPrompt, PromptProvider } from "../types";

const CONSTRAINT_COUNT = 3;
const WORD_BANK_COUNT = 5;

// Zero network, seeded by the date string alone so the same day always
// produces the same prompt. This is the guaranteed fallback: it must never
// throw and never need configuration.
export class OfflineProvider implements PromptProvider {
  readonly id = "offline";
  readonly model?: string;

  async generate(input: {
    date: string;
    recentConcepts: string[];
  }): Promise<GeneratedPrompt> {
    const random = new SeededRandom(input.date);

    return {
      concept: random.pick(CONCEPTS),
      scenario: random.pick(SCENARIOS),
      rhymeScheme: random.pick(RHYME_SCHEMES),
      pocket: random.pick(POCKETS),
      constraints: random.pickN(CONSTRAINTS, CONSTRAINT_COUNT),
      wordBank: random.pickN(WORD_BANK, WORD_BANK_COUNT),
    };
  }
}
