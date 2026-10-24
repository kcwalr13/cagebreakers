import { SEED_ALPHABET } from '../src/core/seed';

/** The same spread of run seeds every time, so reports compare like with like. */
export function labSeeds(n: number, offset = 0): string[] {
  return Array.from({ length: n }, (_, k) => {
    const i = k + offset;
    let s = '', x = i * 104729 + 7;
    for (let j = 0; j < 6; j++) { s += SEED_ALPHABET[x % SEED_ALPHABET.length]; x = Math.floor(x / SEED_ALPHABET.length) + 17 * j; }
    return s;
  });
}
