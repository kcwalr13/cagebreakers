import { type Grid, gridOf } from './grid';
import { type Rng, stream } from './rng';
import { solve } from './solve';
import { latinPeers } from './twists';

export type Op = '+' | '×' | '−' | '÷';

export interface Cage {
  id: number;
  /** Cell indices, sorted ascending; cells[0] is the top-left cell, where the target is printed. */
  cells: number[];
  op: Op;
  target: number;
}

/**
 * A greater-than fence between two neighbouring squares: the number at `a` is greater than the
 * number at `b`. Fences are drawn from the hidden solution, so it keeps every one.
 */
export interface Fence { a: number; b: number }

/** Two neighbouring squares joined by a runner: their numbers are one apart. */
export interface Runner { a: number; b: number }

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
  /**
   * Twists (absent on a plain page). `hidden`: plots show only their target, and a plot blooms when
   * its numbers make the target by adding, subtracting, multiplying or dividing (the last two only
   * in two-square plots). `fences`: greater-than signs between neighbouring squares, kept by every
   * placement. `diagonal`: no number repeats on either long diagonal either.
   */
  hidden?: boolean;
  fences?: Fence[];
  diagonal?: boolean;
  /** More twists (see src/core/twists.ts): no number touches the same number at a corner; no number repeats in a plot. */
  elbow?: boolean;
  tidy?: boolean;
  /** Bean poles, each a path of neighbouring squares from root to tip whose numbers climb. */
  poles?: number[][];
  /** Runners joining neighbouring squares whose numbers are one apart. */
  runners?: Runner[];
  /** Shady squares, which take even numbers. */
  shade?: number[];
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
  /** Twists: plots show only their target; how many greater-than fences to draw; the long diagonals count too. */
  hidden?: boolean;
  fences?: readonly [number, number];
  diagonal?: boolean;
  /** More twists: elbow room, tidy plots, and how many bean poles, runners and shady squares to draw. */
  elbow?: boolean;
  tidy?: boolean;
  poles?: readonly [number, number];
  runners?: readonly [number, number];
  shade?: readonly [number, number];
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

/**
 * What a plot's numbers can make when its operation is hidden: the target counts if adding,
 * multiplying, or (for two squares) subtracting or dividing gives it.
 */
export function makesAny(values: readonly number[], target: number): boolean {
  if (values.reduce((a, b) => a + b, 0) === target || values.reduce((a, b) => a * b, 1) === target) return true;
  if (values.length !== 2) return false;
  const hi = Math.max(values[0]!, values[1]!), lo = Math.min(values[0]!, values[1]!);
  return hi - lo === target || (hi % lo === 0 && hi / lo === target);
}

/** Whether a plot's numbers make its target: by its own operation, or by any when the page hides them. */
export function makes(cage: Cage, values: readonly number[], hidden = false): boolean {
  return hidden ? makesAny(values, cage.target) : evaluate(cage.op, values) === cage.target;
}

/**
 * A random Latin square of the grid's size by randomized backtracking; with `diagonal`, both long
 * diagonals hold every number once too, and with `elbow`, no number touches itself at a corner.
 */
export function latinSquare(rng: Rng, g: Grid = gridOf(6), diagonal = false, elbow = false): number[] {
  const grid = new Array<number>(g.cells).fill(0);
  const peers = latinPeers(g.size, diagonal, elbow);
  // Only a twisted search gets a budget: plain squares fill quickly, and keep the pages they always made.
  const BUDGET = diagonal || elbow ? 200_000 : Infinity;
  let budget = BUDGET;
  const fill = (i: number): boolean => {
    if (i === g.cells) return true;
    if (--budget < 0) return false;
    for (const n of rng.shuffle(g.numbers)) {
      if (peers[i]!.some((p) => p < i && grid[p] === n)) continue;
      grid[i] = n;
      if (fill(i + 1)) return true;
    }
    grid[i] = 0;
    return false;
  };
  // A diagonal search can wander; start it again with fresh choices until one fills.
  for (let attempt = 0; attempt < 50; attempt++) {
    if (fill(0)) return grid;
    grid.fill(0);
    budget = BUDGET;
  }
  throw new Error('no Latin square found');
}

/** Draws `count` fences between neighbouring squares, each pointing the way the solution goes. */
function drawFences(rng: Rng, solution: readonly number[], g: Grid, count: number): Fence[] {
  const pairs: [number, number][] = [];
  for (const c of g.all) for (const n of g.neighbors[c]!) if (n > c) pairs.push([c, n]);
  // No square carries more than two fences, so they spread across the garden.
  const load = new Array<number>(g.cells).fill(0);
  const out: Fence[] = [];
  for (const [x, y] of rng.shuffle(pairs)) {
    if (out.length === count) break;
    if (load[x]! >= 2 || load[y]! >= 2) continue;
    load[x]!++; load[y]!++;
    out.push(solution[x]! > solution[y]! ? { a: x, b: y } : { a: y, b: x });
  }
  return out.sort((p, q) => Math.min(p.a, p.b) - Math.min(q.a, q.b) || Math.max(p.a, p.b) - Math.max(q.a, q.b));
}

/** Draws runners between neighbouring squares whose numbers are one apart. */
function drawRunners(rng: Rng, solution: readonly number[], g: Grid, count: number): Runner[] {
  const pairs: [number, number][] = [];
  for (const c of g.all) for (const n of g.neighbors[c]!) if (n > c && Math.abs(solution[c]! - solution[n]!) === 1) pairs.push([c, n]);
  const load = new Array<number>(g.cells).fill(0);
  const out: Runner[] = [];
  for (const [a, b] of rng.shuffle(pairs)) {
    if (out.length === count) break;
    if (load[a]! >= 2 || load[b]! >= 2) continue;
    load[a]!++; load[b]!++;
    out.push({ a, b });
  }
  return out.sort((p, q) => p.a - q.a || p.b - q.b);
}

/** Draws bean poles: paths of 3 or 4 neighbouring squares whose numbers climb from root to tip, never sharing a square. */
function drawPoles(rng: Rng, solution: readonly number[], g: Grid, count: number): number[][] {
  const used = new Set<number>();
  const out: number[][] = [];
  for (let attempt = 0; attempt < 400 && out.length < count; attempt++) {
    const start = rng.pick(g.all.filter((c) => !used.has(c)));
    const want = rng.int(3, 4);
    const path = [start];
    while (path.length < want) {
      const tip = path[path.length - 1]!;
      const up = g.neighbors[tip]!.filter((n) => !used.has(n) && !path.includes(n) && solution[n]! > solution[tip]!);
      if (!up.length) break;
      path.push(rng.pick(up));
    }
    if (path.length < 3) continue;
    for (const c of path) used.add(c);
    out.push(path);
  }
  return out;
}

/** Picks shady squares among those the solution fills with even numbers, at most two in a row or column. */
function drawShade(rng: Rng, solution: readonly number[], g: Grid, count: number): number[] {
  const perRow = new Array<number>(g.size).fill(0), perCol = new Array<number>(g.size).fill(0);
  const out: number[] = [];
  for (const c of rng.shuffle(g.all.filter((x) => solution[x]! % 2 === 0))) {
    if (out.length === count) break;
    if (perRow[g.rowOf(c)]! >= 2 || perCol[g.colOf(c)]! >= 2) continue;
    perRow[g.rowOf(c)]!++; perCol[g.colOf(c)]!++;
    out.push(c);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Splits the page into connected cages of 2–4 cells. Returns null when an attempt fails. With
 * `tidy` (the hidden solution), a cage never takes in a square whose number it already holds.
 */
function tryPartition(rng: Rng, rules: PageRules, g: Grid, tidy?: readonly number[]): number[][] | null {
  const neighbors = (c: number) => g.neighbors[c]!;
  const owner = new Array<number>(g.cells).fill(-1);
  const cages: number[][] = [];
  const fits = (cage: readonly number[], c: number) => !tidy || !cage.some((x) => tidy[x] === tidy[c]);
  for (const start of rng.shuffle(Array.from({ length: g.cells }, (_, i) => i))) {
    if (owner[start] !== -1) continue;
    const want = rng.weighted(rules.sizeWeights);
    const id = cages.length;
    const cage = [start];
    owner[start] = id;
    while (cage.length < want) {
      const frontier = [...new Set(cage.flatMap(neighbors))].filter((c) => owner[c] === -1 && fits(cage, c));
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
      (h) => h !== id && cages[h]!.length >= 2 && cages[h]!.length < 4 && fits(cages[h]!, cell),
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
  const cageRng = stream(seed, 'page.cages');
  const opRng = stream(seed, 'page.ops');
  const stoneRng = stream(seed, 'page.stones');
  const fenceRng = stream(seed, 'page.fences');
  const twistRng = stream(seed, 'page.twists');
  /** The twists a page of these rules carries, besides those drawn from its solution. */
  const twists = {
    ...(rules.hidden ? { hidden: true } : {}), ...(rules.diagonal ? { diagonal: true } : {}),
    ...(rules.elbow ? { elbow: true } : {}), ...(rules.tidy ? { tidy: true } : {}),
  };

  /** Cages and stones over one solution, `tries` times; null if none of them has only that solution. */
  const build = (solution: number[], tries: number): Page | null => {
    for (let attempt = 0; attempt < tries; attempt++) {
      let cells: number[][] | null = null;
      for (let i = 0; i < 500 && !cells; i++) cells = tryPartition(cageRng, rules, g, rules.tidy ? solution : undefined);
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

      const fenced = rules.fences ? { fences: drawFences(fenceRng, solution, g, fenceRng.int(rules.fences[0], rules.fences[1])) } : {};
      const drawn = {
        ...(rules.poles ? { poles: drawPoles(twistRng, solution, g, twistRng.int(rules.poles[0], rules.poles[1])) } : {}),
        ...(rules.runners ? { runners: drawRunners(twistRng, solution, g, twistRng.int(rules.runners[0], rules.runners[1])) } : {}),
        ...(rules.shade ? { shade: drawShade(twistRng, solution, g, twistRng.int(rules.shade[0], rules.shade[1])) } : {}),
      };
      // A rare solution can't carry enough of a twist (one with no three neighbours that climb has no
      // bean poles): then the hidden solution is drawn again.
      const short = (rules.poles && drawn.poles!.length < rules.poles[0]) || (rules.runners && drawn.runners!.length < rules.runners[0])
        || (rules.shade && drawn.shade!.length < rules.shade[0]);
      if (short) return null;
      const shape = { seed, size: g.size, solution, cages, cageOf, ...twists, ...fenced, ...drawn };
      let stones: number[] | null = null;
      for (let i = 0; i < 200 && !stones; i++) {
        stones = placeStones(stoneRng, solution, cageOf, cells, rules, g);
        if (stones && rules.unique !== undefined) {
          stones = makeUnique({ ...shape, stones }, stoneRng, rules.unique);
          if (!stones) break;
        }
      }
      if (stones) return { ...shape, stones };
      if (rules.unique === undefined) throw new Error(`could not place stones on page ${seed}`);
    }
    return null;
  };

  // A page that must have one solution gets fresh cages when stones alone can't settle it.
  const first = build(latinSquare(stream(seed, 'page.latin'), g, rules.diagonal, rules.elbow), rules.unique === undefined ? 1 : 200);
  if (first) return first;
  // Some solutions almost never come out unique without stones (a stoneless Fallow Field page, say):
  // then the hidden solution itself is drawn again, as many times as it takes.
  const more = stream(seed, 'page.latin.more');
  for (let round = 0; round < 500; round++) {
    const page = build(latinSquare(more, g, rules.diagonal, rules.elbow), 40);
    if (page) return page;
  }
  throw new Error(`could not make page ${seed} unique`);
}
