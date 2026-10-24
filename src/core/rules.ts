import { CELLS, NUMBERS, PEERS } from './grid';
import { type Cage, type Page, evaluate } from './page';

/**
 * Board markers for Misprints that stand without a number. They are negative, so they never
 * match a number under the Latin rule, yet a cell holding one counts as filled.
 *  - BLANK counts as whatever number completes its cage, if the Latin rule allows one.
 *  - SMUDGE ignores the Latin rule, and no cage it stands in can seal.
 */
export const BLANK = -1;
export const SMUDGE = -2;

/**
 * A board is the numbers standing on the page: stones plus whatever the player has placed.
 * `placed` holds the player's numbers and markers (0 = empty); stones live on the page.
 */
export function boardValues(page: Page, placed: readonly number[]): number[] {
  const out = new Array<number>(CELLS);
  for (let i = 0; i < CELLS; i++) out[i] = page.stones[i] || placed[i] || 0;
  return out;
}

const clashes = (values: readonly number[], cell: number, n: number, ignore = -1) =>
  PEERS[cell]!.some((p) => p !== ignore && values[p] === n);

/**
 * The Latin rule: a number may stand in a cell only if no other number in its row or column
 * is the same. `ignore` is a cell to treat as empty (the origin of a number being moved).
 * Misprint markers (BLANK, SMUDGE) stand anywhere that isn't a stone.
 */
export function isLegal(page: Page, values: readonly number[], cell: number, n: number, ignore = -1): boolean {
  if (page.stones[cell]) return false;
  if (n < 0) return true;
  return !clashes(values, cell, n, ignore);
}

/** Assigns numbers to a cage's Blanks so the cage hits its target, or returns null. */
function resolveBlanks(cage: Cage, values: readonly number[]): number[] | null {
  const work = values.slice();
  const blanks = cage.cells.filter((c) => work[c] === BLANK);
  const walk = (k: number): boolean => {
    if (k === blanks.length) return evaluate(cage.op, cage.cells.map((c) => work[c]!)) === cage.target;
    const cell = blanks[k]!;
    for (const n of NUMBERS) {
      if (clashes(work, cell, n)) continue;
      work[cell] = n;
      if (walk(k + 1)) return true;
    }
    work[cell] = BLANK;
    return false;
  };
  return walk(0) ? cage.cells.map((c) => work[c]!) : null;
}

export function isSealed(cage: Cage, values: readonly number[]): boolean {
  let wild = false;
  for (const c of cage.cells) {
    const v = values[c]!;
    if (!v || v === SMUDGE) return false;
    if (v === BLANK) wild = true;
  }
  if (!wild) return evaluate(cage.op, cage.cells.map((c) => values[c]!)) === cage.target;
  return resolveBlanks(cage, values) !== null;
}

/** The numbers a sealed cage's Blanks stand for, keyed by cell. */
export function blankValues(cage: Cage, values: readonly number[]): Map<number, number> {
  const out = new Map<number, number>();
  if (!cage.cells.some((c) => values[c] === BLANK)) return out;
  const solved = resolveBlanks(cage, values);
  if (solved) cage.cells.forEach((c, i) => { if (values[c] === BLANK) out.set(c, solved[i]!); });
  return out;
}

/**
 * Every way to finish a cage from the current board: assignments to its empty cells (and its
 * Blanks) that keep the Latin rule (against the whole board and within the cage) and hit the
 * target. Each result lists the cage's values in the order of `cage.cells`. A cage holding a
 * Smudge has none.
 */
export function completions(page: Page, values: readonly number[], cage: Cage): number[][] {
  if (cage.cells.some((c) => values[c] === SMUDGE)) return [];
  const work = values.slice();
  const empties = cage.cells.filter((c) => !work[c] || work[c] === BLANK);
  const out: number[][] = [];
  const walk = (k: number) => {
    if (k === empties.length) {
      const nums = cage.cells.map((c) => work[c]!);
      if (evaluate(cage.op, nums) === cage.target) out.push(nums);
      return;
    }
    const cell = empties[k]!;
    const was = work[cell]!;
    work[cell] = 0;
    for (const n of NUMBERS) {
      if (!isLegal(page, work, cell, n)) continue;
      work[cell] = n;
      walk(k + 1);
      work[cell] = 0;
    }
    work[cell] = was;
  };
  walk(0);
  return out;
}

/** Distinct sets of numbers (sorted, repeats kept) that can still finish a cage. */
export function combinationSets(page: Page, values: readonly number[], cage: Cage): number[][] {
  const seen = new Map<string, number[]>();
  for (const c of completions(page, values, cage)) {
    const sorted = c.slice().sort((a, b) => a - b);
    seen.set(sorted.join(','), sorted);
  }
  return [...seen.values()].sort((a, b) => a.join(',').localeCompare(b.join(',')));
}

export type Hint = 'blocked' | 'open' | 'seals' | 'dead';

/**
 * What placing `n` (a number or a Misprint marker) in `cell` would do:
 *  - blocked: the Latin rule forbids it (or the cell is a stone)
 *  - seals:   it completes its cage correctly
 *  - dead:    it's legal, but its cage could no longer be completed
 *  - open:    legal, and the cage can still be finished
 */
export function hintFor(page: Page, values: readonly number[], cell: number, n: number, ignore = -1): Hint {
  if (!isLegal(page, values, cell, n, ignore)) return 'blocked';
  const next = values.slice();
  if (ignore >= 0) next[ignore] = 0;
  next[cell] = n;
  const cage = page.cages[page.cageOf[cell]!]!;
  if (isSealed(cage, next)) return 'seals';
  return completions(page, next, cage).length === 0 ? 'dead' : 'open';
}

export function sealedCages(page: Page, values: readonly number[]): Set<number> {
  const out = new Set<number>();
  for (const cage of page.cages) if (isSealed(cage, values)) out.add(cage.id);
  return out;
}

/** True when the Latin rule holds across every row and column of the board. Markers are exempt. */
export function boardIsLatin(values: readonly number[]): boolean {
  for (let i = 0; i < CELLS; i++) {
    const v = values[i]!;
    if (v <= 0) continue;
    for (const p of PEERS[i]!) if (values[p] === v) return false;
  }
  return true;
}
