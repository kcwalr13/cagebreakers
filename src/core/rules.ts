import { gridOf, gridOfValues } from './grid';
import { type Cage, type Fence, type Page, makes } from './page';

/** The cells that may not share a number with each cell: its row and column, and the long diagonals on a diagonal page. */
export const peersOf = (page: Pick<Page, 'size' | 'diagonal'>) => (page.diagonal ? gridOf(page.size).crossPeers : gridOf(page.size).peers);

const fencesAt = new WeakMap<readonly Fence[], Map<number, Fence[]>>();
/** The fences touching each cell. */
export function fencesOf(page: Pick<Page, 'fences'>, cell: number): readonly Fence[] {
  if (!page.fences?.length) return [];
  let by = fencesAt.get(page.fences);
  if (!by) {
    by = new Map();
    for (const f of page.fences) for (const c of [f.a, f.b]) by.set(c, [...(by.get(c) ?? []), f]);
    fencesAt.set(page.fences, by);
  }
  return by.get(cell) ?? [];
}

/** A fence `n` at `cell` would break, against the numbers around it, or null. `ignore` is a cell to treat as empty. */
export function brokenFence(page: Page, values: readonly number[], cell: number, n: number, ignore = -1): { fence: Fence; other: number } | null {
  for (const f of fencesOf(page, cell)) {
    const other = f.a === cell ? f.b : f.a;
    const v = other === ignore ? 0 : values[other]!;
    if (!v) continue;
    if (f.a === cell ? n <= v : n >= v) return { fence: f, other };
  }
  return null;
}

/**
 * A board is the numbers standing on the page: stones plus whatever the player has placed.
 * `placed` holds the player's numbers (0 = empty); stones live on the page.
 */
export function boardValues(page: Page, placed: readonly number[]): number[] {
  const out = new Array<number>(page.stones.length);
  for (let i = 0; i < out.length; i++) out[i] = page.stones[i] || placed[i] || 0;
  return out;
}

/**
 * The Latin rule: a number may stand in a cell only if no other number in its row or column
 * is the same (or on a long diagonal through it, when the page counts them), and it keeps every
 * fence beside it. `ignore` is a cell to treat as empty (the origin of a number being moved).
 */
export function isLegal(page: Page, values: readonly number[], cell: number, n: number, ignore = -1): boolean {
  if (page.stones[cell]) return false;
  for (const p of peersOf(page)[cell]!) if (p !== ignore && values[p] === n) return false;
  return !brokenFence(page, values, cell, n, ignore);
}

/** Whether a plot is in bloom: every square filled, and its numbers make the target (by any operation when the page hides them). */
export function isSealed(cage: Cage, values: readonly number[], hidden = false): boolean {
  const nums = cage.cells.map((c) => values[c]!);
  if (nums.some((n) => !n)) return false;
  return makes(cage, nums, hidden);
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
      if (makes(cage, nums, page.hidden)) out.push(nums);
      return;
    }
    const cell = empties[k]!;
    for (const n of gridOf(page.size).numbers) {
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
  if (isSealed(cage, next, page.hidden)) return 'seals';
  return completions(page, next, cage).length === 0 ? 'dead' : 'open';
}

export function sealedCages(page: Page, values: readonly number[]): Set<number> {
  const out = new Set<number>();
  for (const cage of page.cages) if (isSealed(cage, values, page.hidden)) out.add(cage.id);
  return out;
}

/** True when the Latin rule holds across every row and column of the board (and both long diagonals, with `diagonal`). */
export function boardIsLatin(values: readonly number[], diagonal = false): boolean {
  const g = gridOfValues(values);
  const peers = diagonal ? g.crossPeers : g.peers;
  for (let i = 0; i < g.cells; i++) {
    const v = values[i];
    if (!v) continue;
    for (const p of peers[i]!) if (values[p] === v) return false;
  }
  return true;
}

/** True when every fence holds between the filled squares on either side of it. */
export function fencesKept(page: Pick<Page, 'fences'>, values: readonly number[]): boolean {
  return (page.fences ?? []).every((f) => !values[f.a] || !values[f.b] || values[f.a]! > values[f.b]!);
}
