/**
 * Dewfall's clues, and the solver that works a trail out from them the way a player can.
 *
 * A puzzle shows how many trail squares lie in each row and column (some tallies may be hidden in
 * mist) and puts clues on some squares. Off the trail:
 *  - dew counts the trail squares among the eight around it;
 *  - a leaf counts the trail squares among the four beside it;
 *  - a scarecrow counts the trail squares it can see in the direction it faces, up to the edge.
 * On the trail:
 *  - a pebble: the trail runs straight over it;
 *  - an acorn: the trail turns on it;
 *  - a glint: just a square known to be trail.
 *
 * Every clue becomes rules of one shape, "exactly n of these squares are trail", so the solver needs
 * only that and the trail's own rules (each trail square has two trail neighbours, the ends one; the
 * trail never closes a loop; it is one piece). `deduce` applies them until nothing changes (depth 0),
 * and may also try a square each way and keep the side that doesn't break (depth 1). Every rule is
 * sound, so when `deduce` solves a puzzle its trail is the only one that fits. The generator only
 * keeps clue sets `deduce` solves: every trail can be reasoned out, and needs no guessing.
 */
import type { Rng } from '../rng';
import { type Board, DIRS, type Dir, boardOf } from './board';
import { drawTrail, straightAt } from './trail';

export const UNKNOWN = 0, TRAIL = 1, CLEAR = 2;
export type Mark = typeof UNKNOWN | typeof TRAIL | typeof CLEAR;

export type Clue =
  | { kind: 'dew'; cell: number; n: number }
  | { kind: 'leaf'; cell: number; n: number }
  | { kind: 'scarecrow'; cell: number; dir: Dir; n: number }
  | { kind: 'pebble'; cell: number }
  | { kind: 'acorn'; cell: number }
  | { kind: 'glint'; cell: number };
export type ClueKind = Clue['kind'];
export const CLUE_KINDS: readonly ClueKind[] = ['dew', 'leaf', 'scarecrow', 'pebble', 'acorn', 'glint'];
/** Clue kinds that sit on trail squares; the rest sit on squares off the trail. */
export const ON_TRAIL: ReadonlySet<ClueKind> = new Set(['pebble', 'acorn', 'glint']);

export interface Puzzle {
  width: number;
  height: number;
  /** The trail's first square (top row, under the gap in the hedge) and last (bottom row, above the bed). */
  entry: number;
  exit: number;
  /** Trail squares in each row, top first; null when that tally is hidden. */
  rows: (number | null)[];
  /** Trail squares in each column, left first; null when hidden. */
  cols: (number | null)[];
  clues: Clue[];
  /** The answer, in order from the gap to the bed. */
  trail: number[];
}

export const puzzleBoard = (p: Pick<Puzzle, 'width' | 'height'>): Board => boardOf(p.width, p.height);

/** A rule: exactly `n` of `cells` are trail. */
export interface Count { cells: readonly number[]; n: number }

/** The squares a numbered clue counts. */
export function countedBy(b: Board, clue: Clue): readonly number[] {
  if (clue.kind === 'dew') return b.around[clue.cell]!;
  if (clue.kind === 'leaf') return b.orth[clue.cell]!;
  if (clue.kind === 'scarecrow') return b.ray(clue.cell, clue.dir);
  return [];
}

/** The rules a clue makes. */
export function countsOfClue(b: Board, clue: Clue): Count[] {
  switch (clue.kind) {
    case 'dew': case 'leaf': case 'scarecrow': return [{ cells: countedBy(b, clue), n: clue.n }];
    case 'pebble': {
      // With two trail neighbours, going straight means each corner pair (N and E, N and W, S and
      // E, S and W) holds exactly one of them.
      const [n, e, s, w] = DIRS.map((d) => b.step(clue.cell, d));
      return [[n, e], [n, w], [s, e], [s, w]].map((pair) => ({ cells: pair.filter((x) => x! >= 0) as number[], n: 1 }));
    }
    case 'acorn': {
      // Turning means one neighbour above or below, and one to the side.
      const [n, e, s, w] = DIRS.map((d) => b.step(clue.cell, d));
      return [[n, s], [e, w]].map((pair) => ({ cells: pair.filter((x) => x! >= 0) as number[], n: 1 }));
    }
    case 'glint': return [];
  }
}

export const rowCells = (b: Board, r: number) => Array.from({ length: b.width }, (_, k) => b.cellAt(r, k));
export const colCells = (b: Board, k: number) => Array.from({ length: b.height }, (_, r) => b.cellAt(r, k));

/** What a puzzle shows about a square before any marking: trail, clear, or nothing. */
export function printedAt(p: Puzzle, cell: number): Mark {
  if (cell === p.entry || cell === p.exit) return TRAIL;
  const c = p.clues.find((x) => x.cell === cell);
  if (!c) return UNKNOWN;
  return ON_TRAIL.has(c.kind) ? TRAIL : CLEAR;
}

interface Compiled {
  b: Board;
  entry: number;
  exit: number;
  counts: Count[];
  /** Trail squares in all, when the tallies tell it. */
  total: number | null;
}

function compile(p: Puzzle): Compiled {
  const b = puzzleBoard(p);
  const counts: Count[] = [];
  p.rows.forEach((n, r) => { if (n !== null) counts.push({ cells: rowCells(b, r), n }); });
  p.cols.forEach((n, k) => { if (n !== null) counts.push({ cells: colCells(b, k), n }); });
  for (const c of p.clues) counts.push(...countsOfClue(b, c));
  const sum = (xs: (number | null)[]) => (xs.every((x) => x !== null) ? xs.reduce<number>((s, x) => s + x!, 0) : null);
  return { b, entry: p.entry, exit: p.exit, counts, total: sum(p.rows) ?? sum(p.cols) };
}

/**
 * Applies every rule until nothing changes. Returns the number of sweeps it took, or -1 when the
 * marks can't make a trail. `log` collects the squares it decides, in the order it decides them.
 */
function propagate(cp: Compiled, m: Mark[], log?: number[]): number {
  const { b, entry, exit, counts, total } = cp;
  const need = (c: number) => (c === entry || c === exit ? 1 : 2);
  let changed = true, sweeps = 0;
  const set = (c: number, v: Mark): boolean => {
    if (m[c] === v) return true;
    if (m[c] !== UNKNOWN) return false;
    m[c] = v; changed = true;
    log?.push(c);
    return true;
  };
  const exactly = (cells: readonly number[], want: number): boolean => {
    let t = 0, u = 0;
    for (const c of cells) if (m[c] === TRAIL) t++; else if (m[c] === UNKNOWN) u++;
    if (t > want || t + u < want) return false;
    if (u === 0) return true;
    if (t === want) { for (const c of cells) if (m[c] === UNKNOWN && !set(c, CLEAR)) return false; }
    else if (t + u === want) { for (const c of cells) if (m[c] === UNKNOWN && !set(c, TRAIL)) return false; }
    return true;
  };
  const piece = new Array<number>(b.cells);
  while (changed) {
    changed = false;
    sweeps++;
    for (const k of counts) if (!exactly(k.cells, k.n)) return -1;
    for (const c of b.all) {
      if (m[c] === TRAIL) {
        // A trail square has exactly two trail squares beside it (the ends, one).
        if (!exactly(b.orth[c]!, need(c))) return -1;
      } else if (m[c] === UNKNOWN) {
        let t = 0, open = 0;
        for (const n of b.orth[c]!) { if (m[n] === TRAIL) t++; if (m[n] !== CLEAR) open++; }
        // Three trail squares beside it, or a dead end: it can't be trail.
        if (t >= 3 || open < 2) { if (!set(c, CLEAR)) return -1; }
      }
    }
    // Pieces of trail found so far. A square touching one piece twice would close a loop.
    piece.fill(-1);
    let pieces = 0;
    for (const c of b.all) {
      if (m[c] !== TRAIL || piece[c]! >= 0) continue;
      const stack = [c];
      piece[c] = pieces;
      while (stack.length) {
        const x = stack.pop()!;
        for (const n of b.orth[x]!) if (m[n] === TRAIL && piece[n]! < 0) { piece[n] = pieces; stack.push(n); }
      }
      pieces++;
    }
    for (const c of b.all) {
      if (m[c] !== UNKNOWN) continue;
      let a = -1;
      for (const n of b.orth[c]!) {
        if (m[n] !== TRAIL) continue;
        if (piece[n] === a) { if (!set(c, CLEAR)) return -1; break; }
        if (a < 0) a = piece[n]!;
      }
    }
    if (piece[entry]! >= 0 && piece[entry] === piece[exit]) {
      const joined = b.all.filter((c) => m[c] === TRAIL && piece[c] === piece[entry]);
      if (joined.every((c) => b.orth[c]!.filter((n) => m[n] === TRAIL).length === need(c))) {
        // The gap and the bed are joined by a finished trail: nothing else can be trail.
        if (pieces > 1) return -1;
        for (const c of b.all) if (m[c] === UNKNOWN && !set(c, CLEAR)) return -1;
      }
    }
    if (total !== null) {
      let t = 0;
      for (const c of b.all) if (m[c] === TRAIL) t++;
      if (t > total) return -1;
      if (t === total) for (const c of b.all) if (m[c] === UNKNOWN && !set(c, CLEAR)) return -1;
    }
  }
  return sweeps;
}

/** True when every square is decided and the trail squares make one trail from the gap to the bed. */
function isTrail(cp: Compiled, m: readonly Mark[]): boolean {
  const { b, entry, exit } = cp;
  if (m.includes(UNKNOWN) || m[entry] !== TRAIL || m[exit] !== TRAIL) return false;
  let on = 0;
  for (const c of b.all) {
    if (m[c] !== TRAIL) continue;
    on++;
    if (b.orth[c]!.filter((n) => m[n] === TRAIL).length !== (c === entry || c === exit ? 1 : 2)) return false;
  }
  const seen = new Set([entry]);
  const stack = [entry];
  while (stack.length) { const x = stack.pop()!; for (const n of b.orth[x]!) if (m[n] === TRAIL && !seen.has(n)) { seen.add(n); stack.push(n); } }
  return seen.size === on;
}

export interface Deduction {
  marks: Mark[];
  /** The marks admit no trail at all. */
  stuck: boolean;
  /** Every square is decided and they make one trail. */
  solved: boolean;
  /** Squares decided by trying one each way (depth 1). */
  tries: number;
  /** How long the chain of reasoning ran: sweeps of the rules, plus a weight for each try. */
  effort: number;
  /** The squares decided, in order. */
  order: number[];
}

/** The marks a puzzle's clues force, from `start` (default: only what's printed). */
export function deduce(p: Puzzle, depth: 0 | 1, start?: readonly Mark[]): Deduction {
  const cp = compile(p);
  const { b } = cp;
  const m: Mark[] = start ? start.slice() : new Array<Mark>(b.cells).fill(UNKNOWN);
  const order: number[] = [];
  let ok = true;
  for (const c of b.all) {
    const v = printedAt(p, c);
    if (v === UNKNOWN) continue;
    if (m[c] === UNKNOWN) m[c] = v; else if (m[c] !== v) ok = false;
  }
  const first = ok ? propagate(cp, m, order) : -1;
  if (first < 0) return { marks: m, stuck: true, solved: false, tries: 0, effort: 0, order };
  let tries = 0, effort = first;
  const breaks = (c: number, v: Mark): boolean => {
    const t = m.slice();
    t[c] = v;
    if (propagate(cp, t) < 0) return true;
    return !t.includes(UNKNOWN) && !isTrail(cp, t);
  };
  if (depth === 1) {
    for (let progress = true; progress && m.includes(UNKNOWN);) {
      progress = false;
      for (const c of b.all) {
        if (m[c] !== UNKNOWN) continue;
        const v: Mark | null = breaks(c, TRAIL) ? CLEAR : breaks(c, CLEAR) ? TRAIL : null;
        if (v === null) continue;
        m[c] = v; tries++; progress = true; order.push(c);
        const sweeps = propagate(cp, m, order);
        if (sweeps < 0) return { marks: m, stuck: true, solved: false, tries, effort, order };
        effort += sweeps + 4;
      }
    }
  }
  return { marks: m, stuck: false, solved: isTrail(cp, m), tries, effort, order };
}

/** Whether a numbered clue or tally is met by these trail squares, broken, or still open. */
export function countState(cells: readonly number[], want: number, trail: ReadonlySet<number>, open: (c: number) => boolean): 'met' | 'over' | '' {
  let t = 0, u = 0;
  for (const c of cells) if (trail.has(c)) t++; else if (open(c)) u++;
  if (t > want || t + u < want) return 'over';
  if (t === want && u === 0) return 'met';
  return '';
}

/** How a puzzle is made: its size, its trail, and which clues it shows. */
export interface PuzzleShape {
  width: number;
  height: number;
  /** Trail length, fewest to most squares. */
  trail: readonly [number, number];
  /** Clue kinds that may sit on squares. Glints are added only when nothing else works. */
  kinds: readonly ClueKind[];
  /** Of those, the ones the puzzle is about: kept in preference to the others. */
  feature: readonly ClueKind[];
  /** At least this many of each featured kind in the finished puzzle. */
  minFeature: number;
  /** How many tallies may be hidden in mist. */
  hideTallies: number;
  /** Whether solving may take trying a square each way (1) or rules alone (0). */
  depth: 0 | 1;
  /** Clues to give back beyond the fewest that work, to make a puzzle gentler. */
  spare: number;
  /** The fewest sweeps of reasoning a puzzle may take, so it isn't over at a glance. */
  minEffort?: number;
  /** Puzzles at depth 1 must need at least this many tries, and at most `maxTries`. */
  minTries?: number;
  maxTries?: number;
}

/** Every clue the trail could have, one per square, the kind picked at random among those allowed. */
function cluePool(rng: Rng, b: Board, trail: readonly number[], shape: PuzzleShape): Clue[] {
  const on = new Set(trail);
  const allowed = new Set(shape.kinds);
  const feature = new Set(shape.feature);
  const pool: Clue[] = [];
  trail.forEach((cell, i) => {
    if (i === 0 || i === trail.length - 1) return;
    const kind = straightAt(trail, i) ? 'pebble' : 'acorn';
    if (allowed.has(kind)) pool.push({ kind, cell });
  });
  const off = (['dew', 'leaf', 'scarecrow'] as const).filter((k) => allowed.has(k));
  if (off.length) {
    for (const cell of b.all) {
      if (on.has(cell)) continue;
      const kind = rng.weighted(off.map((k) => [k, feature.has(k) ? 3 : 1] as const));
      if (kind === 'scarecrow') {
        const dirs = DIRS.filter((d) => b.ray(cell, d).length >= 2);
        const dir = rng.weighted(dirs.map((d) => [d, b.ray(cell, d).length] as const));
        pool.push({ kind, cell, dir, n: b.ray(cell, dir).filter((x) => on.has(x)).length });
      } else {
        const counted = kind === 'dew' ? b.around[cell]! : b.orth[cell]!;
        pool.push({ kind, cell, n: counted.filter((x) => on.has(x)).length });
      }
    }
  }
  return pool;
}

/**
 * Makes a puzzle for a trail: start from every tally and a clue on every square, show glints if even
 * that leaves a choice, hide tallies, then take clues away (the featured kinds last) while `deduce`
 * still solves it, and give back `spare` of them. Null when the shape's demands can't be met.
 */
export function makePuzzle(rng: Rng, trail: readonly number[], shape: PuzzleShape): Puzzle | null {
  const b = boardOf(shape.width, shape.height);
  const rows = Array.from({ length: b.height }, (_, r) => trail.filter((c) => b.rowOf(c) === r).length);
  const cols = Array.from({ length: b.width }, (_, k) => trail.filter((c) => b.colOf(c) === k).length);
  let p: Puzzle = { width: b.width, height: b.height, entry: trail[0]!, exit: trail[trail.length - 1]!, rows, cols, clues: cluePool(rng, b, trail, shape), trail: trail.slice() };
  const solves = (q: Puzzle) => { const d = deduce(q, shape.depth); return d.solved && d.tries <= (shape.maxTries ?? Infinity); };
  const taken = new Set(p.clues.map((c) => c.cell));
  for (const cell of rng.shuffle(trail.slice(1, -1).filter((c) => !taken.has(c)))) {
    if (solves(p)) break;
    p = { ...p, clues: [...p.clues, { kind: 'glint', cell }] };
  }
  if (!solves(p)) return null;
  let hidden = 0;
  for (const [axis, i] of rng.shuffle([...rows.map((_, r) => ['rows', r] as const), ...cols.map((_, k) => ['cols', k] as const)])) {
    if (hidden >= shape.hideTallies) break;
    const line = p[axis].slice();
    line[i] = null;
    const without = { ...p, [axis]: line };
    if (solves(without)) { p = without; hidden++; }
  }
  const feature = new Set(shape.feature);
  const glints = p.clues.filter((c) => c.kind === 'glint');
  const plain = rng.shuffle(p.clues.filter((c) => c.kind !== 'glint' && !feature.has(c.kind)));
  const featured = rng.shuffle(p.clues.filter((c) => feature.has(c.kind)));
  const removed: Clue[] = [];
  // Glints go first (they're the least interesting), then plain clues, then featured ones.
  for (const c of [...glints, ...plain, ...featured]) {
    const without = { ...p, clues: p.clues.filter((x) => x !== c) };
    if (solves(without)) { p = without; if (c.kind !== 'glint') removed.push(c); }
  }
  const back = [...rng.shuffle(removed.filter((c) => feature.has(c.kind))), ...rng.shuffle(removed.filter((c) => !feature.has(c.kind)))].slice(0, shape.spare);
  p = { ...p, clues: [...p.clues, ...back].sort((x, y) => x.cell - y.cell) };
  if (shape.feature.some((k) => p.clues.filter((c) => c.kind === k).length < shape.minFeature)) return null;
  const d = deduce(p, shape.depth);
  if (!d.solved) return null;
  if (shape.minEffort && d.effort < shape.minEffort) return null;
  if (shape.depth === 1 && shape.minTries && d.tries < shape.minTries) return null;
  return p;
}

/** Draws trails until one makes a puzzle of this shape. */
export function puzzleOf(rng: Rng, shape: PuzzleShape, attempts = 60): Puzzle {
  const b = boardOf(shape.width, shape.height);
  for (let i = 0; i < attempts; i++) {
    const p = makePuzzle(rng, drawTrail(rng, b, shape.trail[0], shape.trail[1]), shape);
    if (p) return p;
  }
  throw new Error(`no ${shape.width}×${shape.height} puzzle after ${attempts} trails`);
}
