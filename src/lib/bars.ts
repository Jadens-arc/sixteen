export const BAR_TARGET = 16;

// Ceiling on a stored verse body. Sixteen bars of rap is a few thousand
// characters; this leaves room to draft well past that while keeping a single
// row - and the archive query that reads it back - a bounded size.
export const MAX_VERSE_LENGTH = 20_000;

function nonEmptyLines(body: string): string[] {
  return body.split("\n").filter((line) => line.trim().length > 0);
}

export function countBars(body: string): number {
  return nonEmptyLines(body).length;
}

export function splitQuatrains(body: string): string[][] {
  const lines = nonEmptyLines(body);
  const quatrains: string[][] = [];

  for (let i = 0; i < lines.length; i += 4) {
    quatrains.push(lines.slice(i, i + 4));
  }

  return quatrains;
}

// What a loose verse gets called in a list: its opening bar. A verse with no
// prompt behind it has no other name, and asking someone to title a jotting
// is asking them to stop writing.
export function firstBar(body: string): string {
  return nonEmptyLines(body)[0]?.trim() ?? "";
}
