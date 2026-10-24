/**
 * Seeded randomness. Every random choice in the game comes from a named stream derived
 * from the run seed, so the same seed always produces the same page, shops and enemies.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [lo, hi], inclusive. */
  int(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
  /** Shuffles a copy; the input is untouched. */
  shuffle<T>(items: readonly T[]): T[];
  weighted<T>(items: readonly (readonly [T, number])[]): T;
}

/** cyrb128: a small, well-mixed 128-bit string hash. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** sfc32: fast, small-state PRNG with good statistical quality. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): Rng {
  const [a, b, c, d] = cyrb128(seed);
  const next = sfc32(a, b, c, d);
  for (let i = 0; i < 12; i++) next(); // warm up
  const rng: Rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from empty list');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    weighted: (items) => {
      const total = items.reduce((s, [, w]) => s + w, 0);
      let roll = next() * total;
      for (const [item, w] of items) {
        roll -= w;
        if (roll < 0) return item;
      }
      return items[items.length - 1]![0];
    },
  };
  return rng;
}

/** A named, independent stream of randomness for one purpose within a run. */
export function stream(seed: string, name: string): Rng {
  return createRng(`${seed}#${name}`);
}
