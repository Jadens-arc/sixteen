// Shared instructions for the API-backed providers (Anthropic, OpenAI and
// OpenAI-compatible endpoints). Keeping this in one place means a prompt
// tweak doesn't have to be made twice, and both providers stay aligned on
// exactly what shape of JSON they're asking for.

const RESPONSE_SHAPE = `Respond with a single JSON object and nothing else - no prose before or after it, no markdown code fence. It must have exactly these keys:
{
  "concept": string,       // the angle or idea behind the verse, one sentence
  "scenario": string,      // a vivid, concrete setup to write from, one to two sentences
  "rhymeScheme": string,   // e.g. "AABB", "ABAB", or "internal multis landing on beat 3"
  "pocket": string,        // flow and tempo guidance, e.g. "boom-bap, 88 BPM, behind the beat"
  "constraints": string[], // 2 to 4 concrete writing constraints
  "wordBank": string[]     // 4 to 6 words or short phrases to work into the verse
}`;

const SYSTEM_PROMPT = `You write daily writing prompts for a rapper practicing 16-bar verses. You know the craft: pocket, multis, internal rhyme, flipping a word bank without forcing it. Every prompt centers on one concrete, specific image or situation - never an abstract theme like "your journey" or "chasing your dreams". The scenario should put the writer somewhere real enough to see, smell, hear. Constraints should sharpen the verse, not just add trivia. The word bank should be words worth flipping, not just related nouns. No filler, no cliches, no exclamation marks, no phrases like "unleash your potential".

${RESPONSE_SHAPE}`;

export function buildPromptMessages(input: {
  date: string;
  recentConcepts: string[];
}): { system: string; user: string } {
  const { date, recentConcepts } = input;

  const avoidance =
    recentConcepts.length > 0
      ? ` Do not repeat or closely rework any of these recent concepts: ${recentConcepts.join("; ")}.`
      : "";

  return {
    system: SYSTEM_PROMPT,
    user: `Write today's prompt, dated ${date}.${avoidance}`,
  };
}
