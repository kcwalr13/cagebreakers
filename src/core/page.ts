import { CELLS, NUMBERS, PEERS, SIZE, colOf, neighbors, rowOf } from './grid';
import { type Rng, stream } from './rng';

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
  /** The hidden complete solution: a 6×6 Latin square. Every cage is built from it. */
  solution: number[];
  cages: Cage[];
  /** Cage id for each cell. */
  cageOf: number[];
  /** Pre-printed numbers ("stones"); 0 where there is none. Always agree with the solution. */
  stones: number[];
}

export interface PageRules {
  minCages: number;
  maxCages: number;
  minStones: number;
  maxStones: number;
  /** Relative odds of each cage size when growing the partition. */
  sizeWeights: readonly (readonly [number, number])[];
  maxStonesPerLine: number;
  /** Which operations cages may use: all four, or only + and ×. */
  ops?: 'all' | 'plus-times';
}

export const DEFAULT_PAGE_RULES: PageRules = {
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

/** A random 6×6 Latin square by randomized backtracking. */
export function latinSquare(rng: Rng): number[] {
  const grid = new Array<number>(CELLS).fill(0);
  const fill = (i: number): boolean => {
    if (i === CELLS) return true;
    for (const n of rng.shuffle(NUMBERS)) {
      if (PEERS[i]!.some((p) => p < i && grid[p] === n)) continue;
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
function tryPartition(rng: Rng, rules: PageRules): number[][] | null {
  const owner = new Array<number>(CELLS).fill(-1);
  const cages: number[][] = [];
  for (const start of rng.shuffle(Array.from({ length: CELLS }, (_, i) => i))) {
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

function placeStones(rng: Rng, solution: number[], cageOf: number[], cages: number[][], rules: PageRules): number[] | null {
  const count = rng.int(rules.minStones, rules.maxStones);
  const stones = new Array<number>(CELLS).fill(0);
  const perRow = new Array<number>(SIZE).fill(0);
  const perCol = new Array<number>(SIZE).fill(0);
  const perCage = new Array<number>(cages.length).fill(0);
  let placed = 0;
  for (const cell of rng.shuffle(Array.from({ length: CELLS }, (_, i) => i))) {
    if (placed === count) break;
    const r = rowOf(cell), c = colOf(cell), id = cageOf[cell]!;
    if (perRow[r]! >= rules.maxStonesPerLine || perCol[c]! >= rules.maxStonesPerLine) continue;
    // Every cage keeps at least one open cell, and a 2-cell cage gets at most one stone.
    if (perCage[id]! + 1 >= cages[id]!.length) continue;
    stones[cell] = solution[cell]!;
    perRow[r]!++; perCol[c]!++; perCage[id]!++;
    placed++;
  }
  return placed === count ? stones : null;
}

/** Generates the page for a seed. Deterministic: the same seed always gives the same page. */
export function generatePage(seed: string, rules: PageRules = DEFAULT_PAGE_RULES): Page {
  const solution = latinSquare(stream(seed, 'page.latin'));
  const cageRng = stream(seed, 'page.cages');
  let cells: number[][] | null = null;
  for (let attempt = 0; attempt < 500 && !cells; attempt++) cells = tryPartition(cageRng, rules);
  if (!cells) throw new Error(`could not partition page ${seed}`);
  // Order cages top-to-bottom, left-to-right by their first cell so ids read naturally.
  cells.sort((a, b) => a[0]! - b[0]!);

  const cageOf = new Array<number>(CELLS).fill(-1);
  cells.forEach((cage, id) => cage.forEach((c) => (cageOf[c] = id)));

  const opRng = stream(seed, 'page.ops');
  const cages: Cage[] = cells.map((cage, id) => {
    const values = cage.map((c) => solution[c]!);
    const op = chooseOp(opRng, values, rules.ops);
    return { id, cells: cage, op, target: evaluate(op, values) };
  });

  const stoneRng = stream(seed, 'page.stones');
  let stones: number[] | null = null;
  for (let attempt = 0; attempt < 200 && !stones; attempt++) stones = placeStones(stoneRng, solution, cageOf, cells, rules);
  if (!stones) throw new Error(`could not place stones on page ${seed}`);

  return { seed, solution, cages, cageOf, stones };
}
