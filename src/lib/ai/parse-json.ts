// Models routinely wrap a JSON reply in a ```json ... ``` fence even when told
// not to. Stripping it here means every provider gets the same forgiving
// parse instead of each reimplementing it.
const FENCED_BLOCK = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(FENCED_BLOCK);
  return match ? match[1].trim() : trimmed;
}

export function parseModelJson(text: string): unknown {
  return JSON.parse(stripCodeFence(text));
}
