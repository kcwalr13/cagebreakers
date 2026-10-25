import { CELLS, NUMBERS, PEERS } from './grid';
import { type Cage, type Page, evaluate } from './page';

/**
 * A board is the numbers standing on the page: stones plus whatever the player has placed.
 * `placed` holds the player's numbers (0 = empty); stones live on the page.
 */
export function boardValues(page: Page, placed: readonly number[]): number[] {
  const out = new Array<number>(CELLS);
  for (let i = 0; i < CELLS; i++) out[i] = page.stones[i] || placed[i] || 0;
  return out;
}

/**
 * The Latin rule: a number may stand in a cell only if no other number in its row or column
 * is the same. `ignore` is a cell to treat as empty (the origin of a number being moved).
 */
export function isLegal(page: Page, values: readonly number[], cell: number, n: number, ignore = -1): boolean {
  if (page.stones[cell]) return false;
  for (const p of PEERS[cell]!) if (p !== ignore && values[p] === n) return false;
  return true;
}

export function isSealed(cage: Cage, values: readonly number[]): boolean {
  const nums = cage.cells.map((c) => values[c]!);
  if (nums.some((n) => !n)) return false;
  return evaluate(cage.op, nums) === cage.target;
}

/**
 * Every way to finish a cage from the current board: assignments to its empty cells that keep
 * the Latin rule (against the whole board and within the cage) and hit the target.
 * Each result lists the cage's values in the order of `cage.cells`.
 */
export function completions(page: Page, values: readonly number[], cage: Cage): number[][] {
  const work = values.slice();
  const empties = cage.cells.filter((c) => !work[c]);
  const out: number[][] = [];
  const walk = (k: number) => {
    if (k === empties.length) {
      const nums = cage.cells.map((c) => work[c]!);
      if (evaluate(cage.op, nums) === cage.target) out.push(nums);
      return;
    }
    const cell = empties[k]!;
    for (const n of NUMBERS) {
      if (!isLegal(page, work, cell, n)) continue;
      work[cell] = n;
      walk(k + 1);
      work[cell] = 0;
    }
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
 * What placing `n` in `cell` would do:
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

/** True when the Latin rule holds across every row and column of the board. */
export function boardIsLatin(values: readonly number[]): boolean {
  for (let i = 0; i < CELLS; i++) {
    const v = values[i];
    if (!v) continue;
    for (const p of PEERS[i]!) if (values[p] === v) return false;
  }
  return true;
}
