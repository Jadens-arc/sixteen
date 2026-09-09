// Shared instructions for the API-backed providers (Anthropic, OpenAI and
// OpenAI-compatible endpoints). Keeping this in one place means a prompt
// tweak doesn't have to be made twice, and both providers stay aligned on
// exactly what shape of JSON they're asking for.

// The key comments below describe the shape of each value and deliberately
// give no sample content. An earlier version showed specimens - "boom-bap,
// 88 BPM, behind the beat" for pocket, "internal multis landing on beat 3"
// for rhymeScheme - and every model read them as content rather than format:
// four different models came back at 84-88 BPM behind the beat, one of them
// echoing "landing on beat two". Describe the field, don't fill it in.
const RESPONSE_SHAPE = `Respond with a single JSON object and nothing else - no prose before or after it, no markdown code fence. Escape any quotation marks that appear inside a string value. It must have exactly these keys:
{
  "concept": string,       // the angle or idea behind the verse, one sentence
  "scenario": string,      // a vivid, concrete setup to write from, one to two sentences
  "rhymeScheme": string,   // any scheme, named however is clearest
  "pocket": string,        // flow and tempo guidance: genre, BPM, and where to sit against the beat
  "constraints": string[], // 2 to 4 concrete writing constraints
  "wordBank": string[]     // 4 to 6 words or short phrases to work into the verse
}`;

// The "avoid the default" paragraph is load-bearing. Banning abstraction and
// uplift without naming what's left over funnels every model into the same
// corner - a fluorescent interior at 3am where money quietly changes hands -
// so the attractor gets named explicitly and ruled out.
const SYSTEM_PROMPT = `You write daily writing prompts for a rapper practicing 16-bar verses. You know the craft: pocket, multis, internal rhyme, flipping a word bank without forcing it.

Every prompt centers on one concrete, specific image or situation - never an abstract theme like "your journey" or "chasing your dreams". The scenario should put the writer somewhere real enough to see, smell, hear. Constraints should sharpen the verse, not just add trivia. The word bank should be words worth flipping, not just related nouns. No filler, no cliches, no exclamation marks.

Range is the point. Rap covers the whole emotional register - comedy, tenderness, pettiness, awe, boredom, lust, grief, triumph, absurdity, joy - and a prompt that only ever asks for menace teaches one trick. Vary the mood, the hour, the stakes and the tempo. Small and funny is as legitimate as heavy and dark: an argument over a parking space, a crush, a bad haircut, a dog that hates you, a group chat gone wrong, a genuinely good day.

Avoid the default. If your first instinct is a late-night interior under fluorescent light where money quietly changes hands, at 84-88 BPM behind the beat, that is the average of every prompt ever written - go somewhere else. Daylight is allowed. So is being happy.

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
