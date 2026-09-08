export const BAR_TARGET = 16;

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
