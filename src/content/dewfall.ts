/**
 * Dewfall, Plot Twist's logic puzzle: a slug crossed the garden in the night, and the morning dew
 * gives its trail away. Find the one trail from the gap in the hedge to the bed. The rules live in
 * src/core/dewfall; the chapters, the daily puzzles and their shapes live here.
 */
import type { PuzzleShape } from '../core/dewfall/clues';

export interface Chapter {
  id: string;
  name: string;
  /** What the chapter brings in, for its card. */
  blurb: string;
  shape: PuzzleShape;
  /** Puzzles in the chapter. */
  count: number;
}

const base = { minFeature: 0, hideTallies: 0, depth: 0, spare: 0 } as const;

export const CHAPTERS: readonly Chapter[] = [
  {
    id: 'first-light', name: 'First Light', count: 8,
    blurb: 'Only the counts. Each row and column says how many of its squares the trail crosses.',
    shape: { ...base, width: 5, height: 6, trail: [11, 15], kinds: [], feature: [], minEffort: 3 },
  },
  {
    id: 'dew', name: 'Dew', count: 8,
    blurb: 'Dew never sits on the trail. Its number counts the trail squares among the eight around it.',
    shape: { ...base, width: 6, height: 6, trail: [13, 18], kinds: ['dew'], feature: ['dew'], minFeature: 3, hideTallies: 4, spare: 1, minEffort: 3 },
  },
  {
    id: 'mist', name: 'Mist', count: 8,
    blurb: 'Mist hides some of the counts. Read more of the dew.',
    shape: { ...base, width: 6, height: 7, trail: [15, 21], kinds: ['dew'], feature: ['dew'], minFeature: 4, hideTallies: 99, spare: 1, minEffort: 4 },
  },
  {
    id: 'leaves', name: 'Leaves', count: 8,
    blurb: 'A fallen leaf counts only the four squares beside it, not the corners.',
    shape: { ...base, width: 6, height: 7, trail: [15, 21], kinds: ['dew', 'leaf'], feature: ['leaf'], minFeature: 3, hideTallies: 6, minEffort: 4 },
  },
  {
    id: 'pebbles', name: 'Pebbles and Acorns', count: 8,
    blurb: 'Both lie on the trail. It runs straight over a pebble, and turns on an acorn.',
    shape: { ...base, width: 6, height: 8, trail: [17, 24], kinds: ['pebble', 'acorn', 'dew'], feature: ['pebble', 'acorn'], minFeature: 2, hideTallies: 8, minEffort: 4 },
  },
  {
    id: 'scarecrows', name: 'Scarecrows', count: 8,
    blurb: 'A scarecrow looks one way, and counts the trail squares it can see from there to the edge.',
    shape: { ...base, width: 6, height: 8, trail: [17, 24], kinds: ['scarecrow', 'leaf', 'acorn'], feature: ['scarecrow'], minFeature: 4, hideTallies: 10, minEffort: 4 },
  },
  {
    id: 'big-garden', name: 'The Big Garden', count: 8,
    blurb: 'Every clue at once, in a bigger garden. Some squares are found only by trying them each way.',
    shape: { ...base, width: 7, height: 9, trail: [22, 32], kinds: ['dew', 'leaf', 'scarecrow', 'pebble', 'acorn'], feature: [], hideTallies: 12, depth: 1, minTries: 1, maxTries: 3, minEffort: 6 },
  },
];

/** A chapter opens once this many puzzles of the one before it are solved. */
export const UNLOCK_AFTER = 3;

export type DailySize = 'small' | 'medium' | 'large';
export interface DailyShape { size: DailySize; name: string; shape: PuzzleShape }

/** Three new puzzles every day, the same for everyone. */
export const DAILY: readonly DailyShape[] = [
  { size: 'small', name: 'Small', shape: { ...base, width: 5, height: 6, trail: [11, 15], kinds: ['dew', 'leaf'], feature: [], hideTallies: 6, spare: 1, minEffort: 3 } },
  { size: 'medium', name: 'Medium', shape: { ...base, width: 6, height: 8, trail: [17, 24], kinds: ['dew', 'leaf', 'pebble', 'acorn'], feature: [], hideTallies: 10, minEffort: 4 } },
  { size: 'large', name: 'Large', shape: { ...base, width: 7, height: 9, trail: [22, 32], kinds: ['dew', 'leaf', 'scarecrow', 'pebble', 'acorn'], feature: [], hideTallies: 12, depth: 1, minTries: 1, maxTries: 2, minEffort: 5 } },
];
