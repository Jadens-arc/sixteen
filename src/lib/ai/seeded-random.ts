// A small deterministic PRNG so the offline provider can turn a date string
// into always-the-same sequence of picks. Not cryptographic - it doesn't
// need to be, it just needs to be stable and reasonably well distributed.

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRandom {
  private readonly next: () => number;

  constructor(seed: string) {
    this.next = mulberry32(hashString(seed));
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  pickN<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const result: T[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const index = this.int(pool.length);
      result.push(pool[index]);
      pool.splice(index, 1);
    }
    return result;
  }
}
