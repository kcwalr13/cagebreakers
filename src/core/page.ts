import { type Grid, gridOf } from './grid';
import { type Rng, stream } from './rng';
import { solve } from './solve';

export type Op = '+' | '×' | '−' | '÷';

export interface Cage {
  id: number;
  /** Cell indices, sorted ascending; cells[0] is the top-left cell, where the target is printed. */
  cells: number[];
  op: Op;
  target: number;
}

/** A generated page. Plain data, safe to serialize. */
export interface Page {
  seed: string;
  /** Rows and columns: 5 to 8. Numbers run from 1 to size. */
  size: number;
  /** The hidden complete solution: a size × size Latin square. Every cage is built from it. */
  solution: number[];
  cages: Cage[];
  /** Cage id for each cell. */
  cageOf: number[];
  /** Pre-printed numbers ("stones"); 0 where there is none. Always agree with the solution. */
  stones: number[];
}

export interface PageRules {
  /** Rows and columns, 5 to 8. */
  size: number;
  minCages: number;
  maxCages: number;
  minStones: number;
  maxStones: number;
  /** Relative odds of each cage size when growing the partition. */
  sizeWeights: readonly (readonly [number, number])[];
  maxStonesPerLine: number;
  /** Which operations cages may use: all four, or only + and ×. */
  ops?: 'all' | 'plus-times';
  /**
   * Add stones until the hidden solution is the only one, so every square can be worked out. At
   * most this many stones beyond maxStones; past that the page is drawn again. Off for the 6×6
   * pages that existed before, so their seeds keep their pages.
   */
  unique?: number;
}

export const DEFAULT_PAGE_RULES: PageRules = {
  size: 6,
  minCages: 12,
  maxCages: 14,
  minStones: 8,
  maxStones: 10,
  sizeWeights: [[2, 42], [3, 42], [4, 16]],
  maxStonesPerLine: 2,
};

export function evaluate(op: Op, values: readonly number[]): number {
  switch (op) {
    case '+': return values.reduce((a, b) => a + b, 0);
    case '×': return values.reduce((a, b) => a * b, 1);
    case '−': return Math.abs(values[0]! - values[1]!);
    case '÷': {
      const hi = Math.max(values[0]!, values[1]!), lo = Math.min(values[0]!, values[1]!);
      return hi % lo === 0 ? hi / lo : Number.NaN;
    }
  }
}

/** A random Latin square of the grid's size by randomized backtracking. */
export function latinSquare(rng: Rng, g: Grid = gridOf(6)): number[] {
  const grid = new Array<number>(g.cells).fill(0);
  const fill = (i: number): boolean => {
    if (i === g.cells) return true;
    for (const n of rng.shuffle(g.numbers)) {
      if (g.peers[i]!.some((p) => p < i && grid[p] === n)) continue;
      grid[i] = n;
      if (fill(i + 1)) return true;
    }
    grid[i] = 0;
    return false;
  };
  if (!fill(0)) throw new Error('no Latin square found');
  return grid;
}

/** Splits the page into connected cages of 2–4 cells. Returns null when an attempt fails. */
function tryPartition(rng: Rng, rules: PageRules, g: Grid): number[][] | null {
  const neighbors = (c: number) => g.neighbors[c]!;
  const owner = new Array<number>(g.cells).fill(-1);
  const cages: number[][] = [];
  for (const start of rng.shuffle(Array.from({ length: g.cells }, (_, i) => i))) {
    if (owner[start] !== -1) continue;
    const want = rng.weighted(rules.sizeWeights);
    const id = cages.length;
    const cage = [start];
    owner[start] = id;
    while (cage.length < want) {
      const frontier = [...new Set(cage.flatMap(neighbors))].filter((c) => owner[c] === -1);
      if (frontier.length === 0) break;
      const next = rng.pick(frontier);
      owner[next] = id;
      cage.push(next);
    }
    cages.push(cage);
  }
  // Fold singletons into a neighboring cage that still has room.
  for (let id = 0; id < cages.length; id++) {
    const cage = cages[id]!;
    if (cage.length !== 1) continue;
    const cell = cage[0]!;
    const hosts = [...new Set(neighbors(cell).map((n) => owner[n]!))].filter(
      (h) => h !== id && cages[h]!.length >= 2 && cages[h]!.length < 4,
    );
    if (hosts.length === 0) return null;
    const host = rng.pick(hosts);
    cages[host]!.push(cell);
    owner[cell] = host;
    cages[id] = [];
  }
  const result = cages.filter((c) => c.length > 0).map((c) => c.slice().sort((a, b) => a - b));
  if (result.length < rules.minCages || result.length > rules.maxCages) return null;
  return result;
}

function chooseOp(rng: Rng, values: number[], ops: PageRules['ops'] = 'all'): Op {
  if (ops === 'plus-times') return rng.weighted([['+', 1], ['×', 1]]);
  if (values.length === 2) {
    const [a, b] = values as [number, number];
    const hi = Math.max(a, b), lo = Math.min(a, b);
    const options: [Op, number][] = [['−', 3], ['×', 2], ['+', 2]];
    if (hi % lo === 0) options.push(['÷', 3]);
    return rng.weighted(options);
  }
  return rng.weighted([['+', 5], ['×', 4]]);
}

function placeStones(rng: Rng, solution: number[], cageOf: number[], cages: number[][], rules: PageRules, g: Grid): number[] | null {
  const count = rng.int(rules.minStones, rules.maxStones);
  const stones = new Array<number>(g.cells).fill(0);
  const perRow = new Array<number>(g.size).fill(0);
  const perCol = new Array<number>(g.size).fill(0);
  const perCage = new Array<number>(cages.length).fill(0);
  let placed = 0;
  for (const cell of rng.shuffle(Array.from({ length: g.cells }, (_, i) => i))) {
    if (placed === count) break;
    const r = g.rowOf(cell), c = g.colOf(cell), id = cageOf[cell]!;
    if (perRow[r]! >= rules.maxStonesPerLine || perCol[c]! >= rules.maxStonesPerLine) continue;
    // Every cage keeps at least one open cell, and a 2-cell cage gets at most one stone.
    if (perCage[id]! + 1 >= cages[id]!.length) continue;
    stones[cell] = solution[cell]!;
    perRow[r]!++; perCol[c]!++; perCage[id]!++;
    placed++;
  }
  return placed === count ? stones : null;
}

/**
 * Adds stones (true to the solution) until no other solution exists: each round finds two
 * solutions and prints the hidden solution's number in a square where they differ. Returns null
 * when that would take more than `budget` stones or leave a cage with no open square.
 */
function makeUnique(page: Page, rng: Rng, budget: number): number[] | null {
  const stones = page.stones.slice();
  const open = page.cages.map((cage) => cage.cells.filter((c) => !stones[c]).length);
  for (let added = 0; ; added++) {
    const { found, settled } = solve({ ...page, stones }, 2);
    if (!settled) return null;
    if (found.length < 2) return stones;
    if (added === budget) return null;
    const differ = page.solution.map((_, c) => c).filter((c) => !stones[c] && found[0]![c] !== found[1]![c] && open[page.cageOf[c]!]! > 1);
    if (!differ.length) return null;
    const cell = rng.pick(differ);
    stones[cell] = page.solution[cell]!;
    open[page.cageOf[cell]!]!--;
  }
}

/** Generates the page for a seed. Deterministic: the same seed always gives the same page. */
export function generatePage(seed: string, rules: PageRules = DEFAULT_PAGE_RULES): Page {
  const g = gridOf(rules.size);
  const solution = latinSquare(stream(seed, 'page.latin'), g);
  const cageRng = stream(seed, 'page.cages');
  const opRng = stream(seed, 'page.ops');
  const stoneRng = stream(seed, 'page.stones');
  // A page that must have one solution gets fresh cages when stones alone can't settle it.
  const tries = rules.unique === undefined ? 1 : 200;
  for (let attempt = 0; attempt < tries; attempt++) {
    let cells: number[][] | null = null;
    for (let i = 0; i < 500 && !cells; i++) cells = tryPartition(cageRng, rules, g);
    if (!cells) throw new Error(`could not partition page ${seed}`);
    // Order cages top-to-bottom, left-to-right by their first cell so ids read naturally.
    cells.sort((a, b) => a[0]! - b[0]!);

    const cageOf = new Array<number>(g.cells).fill(-1);
    cells.forEach((cage, id) => cage.forEach((c) => (cageOf[c] = id)));

    const cages: Cage[] = cells.map((cage, id) => {
      const values = cage.map((c) => solution[c]!);
      const op = chooseOp(opRng, values, rules.ops);
      return { id, cells: cage, op, target: evaluate(op, values) };
    });

    let stones: number[] | null = null;
    for (let i = 0; i < 200 && !stones; i++) {
      stones = placeStones(stoneRng, solution, cageOf, cells, rules, g);
      if (stones && rules.unique !== undefined) {
        stones = makeUnique({ seed, size: g.size, solution, cages, cageOf, stones }, stoneRng, rules.unique);
        if (!stones) break;
      }
    }
    if (stones) return { seed, size: g.size, solution, cages, cageOf, stones };
    if (rules.unique === undefined) throw new Error(`could not place stones on page ${seed}`);
  }
  throw new Error(`could not make page ${seed} unique`);
}
