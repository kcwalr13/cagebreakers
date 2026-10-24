import { createRng } from './rng';

/** Seeds are short codes a person can read aloud or type: no 0/O, 1/I/L. */
export const SEED_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const SEED_LENGTH = 6;

/** Uppercases and validates a typed seed. Returns null when it isn't a usable code. */
export function normalizeSeed(input: string): string | null {
  const s = input.trim().toUpperCase();
  if (s.length < 4 || s.length > 12) return null;
  for (const ch of s) if (!SEED_ALPHABET.includes(ch)) return null;
  return s;
}

/** Builds a seed from raw random integers (the app passes crypto values; core never draws its own). */
export function seedFromInts(ints: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < SEED_LENGTH; i++) out += SEED_ALPHABET[(ints[i] ?? 0) % SEED_ALPHABET.length];
  return out;
}

/**
 * The Daily Page's seed for a calendar day, written '2026-10-24'. Every phone derives the same
 * seed for the same day, so everyone plays the same page and shops with no server involved.
 */
export function dailySeed(day: string): string {
  const rng = createRng(`daily:${day}`);
  return seedFromInts(Array.from({ length: SEED_LENGTH }, () => rng.int(0, 1 << 30)));
}
