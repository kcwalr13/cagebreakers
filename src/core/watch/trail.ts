/**
 * The hidden trail and the clues that give it away. A trail is a path of squares from the hedge
 * gap (a square on the top row) to the bed (a square on the bottom row) that never touches itself
 * along an edge: two trail squares side by side are always steps of the trail. Clues:
 *  - tallies: how many trail squares lie in each row and column (some may be hidden);
 *  - dew: a lit square, never on the trail, showing how many of the eight squares around it are;
 *  - glints: squares known to be on the trail.
 * `deduce` works the trail out the way a player can, by rules alone (depth 0) or with one step of
 * "if this were trail, something breaks" (depth 1). The generator only keeps clue sets that `deduce`
 * solves, so every trail can be reasoned out and is the only one that fits.
 */
import type { Rng } from '../rng';
import type { Board } from './board';

export interface Dew { cell: number; n: number }

export interface Clues {
  /** Trail squares in each row, top first; null when that tally is hidden. */
  rows: (number | null)[];
  /** Trail squares in each column, left first; null when hidden. */
  cols: (number | null)[];
  /** Lit squares (never trail) and how many of the squares around them are trail. */
  dew: Dew[];
  /** Squares known to be trail, besides the gap and the bed's square. */
  glints: number[];
  /** The trail's first square (top row, under the gap in the hedge) and last (bottom row, above the bed). */
  entry: number;
  exit: number;
}

export const UNKNOWN = 0, TRAIL = 1, CLEAR = 2;
export type Mark = typeof UNKNOWN | typeof TRAIL | typeof CLEAR;

/** Draws a trail from a square on the top row to one on the bottom row, `minLen` to `maxLen` squares long. */
export function drawTrail(rng: Rng, b: Board, minLen: number, maxLen: number): number[] {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const path = [b.cellAt(0, rng.int(0, b.width - 1))];
    const on = new Set(path);
    for (;;) {
      const tail = path[path.length - 1]!;
      const r = b.rowOf(tail);
      if (r === b.height - 1 && path.length >= minLen && (path.length >= maxLen - 2 || rng.next() < 0.5)) return path;
      const room = maxLen - path.length;
      const next = b.orth[tail]!.filter((n) => !on.has(n)
        && b.orth[n]!.every((m) => m === tail || !on.has(m))
        && b.height - 1 - b.rowOf(n) < room);
      if (!next.length) break;
      const prev = path.length > 1 ? path[path.length - 2]! : tail - b.width;
      const weigh = (n: number) => {
        const dr = b.rowOf(n) - r;
        const late = path.length / maxLen;
        // Drift down, wander sideways (towards the middle more than the edges), and now and then
        // double back up; long straight runs are rarer.
        let w = dr > 0 ? 1.4 + 2.5 * late : dr < 0 ? (r > 1 ? 0.9 : 0.1) : 2.4;
        if (n - tail === tail - prev) w *= 0.55;
        const edge = Math.min(b.colOf(n), b.width - 1 - b.colOf(n));
        if (edge === 0) w *= 0.6;
        return w;
      };
      const pick = rng.weighted(next.map((n) => [n, weigh(n)] as const));
      path.push(pick);
      on.add(pick);
      if (path.length > maxLen) break;
    }
  }
  throw new Error('could not draw a trail');
}

/** The full clue set for a trail: every tally, and dew on every square off the trail. */
export function allClues(b: Board, trail: readonly number[]): Clues {
  const on = new Set(trail);
  const rows = Array.from({ length: b.height }, (_, r) => trail.filter((c) => b.rowOf(c) === r).length);
  const cols = Array.from({ length: b.width }, (_, k) => trail.filter((c) => b.colOf(c) === k).length);
  const dew = b.all.filter((c) => !on.has(c)).map((cell) => ({ cell, n: b.around[cell]!.filter((x) => on.has(x)).length }));
  return { rows, cols, dew, glints: [], entry: trail[0]!, exit: trail[trail.length - 1]! };
}

export interface Deduction {
  marks: Mark[];
  /** The marks admit no trail at all. */
  stuck: boolean;
  /** Every square is decided and they make one trail. */
  solved: boolean;
  /** Squares decided by trying one and finding it breaks something (depth 1). */
  tries: number;
}

/** Applies every rule until nothing changes. Returns false when the marks can't make a trail. */
function propagate(b: Board, clues: Clues, m: Mark[]): boolean {
  const need = (c: number) => (c === clues.entry || c === clues.exit ? 1 : 2);
  const rowCells = Array.from({ length: b.height }, (_, r) => Array.from({ length: b.width }, (_, k) => b.cellAt(r, k)));
  const colCells = Array.from({ length: b.width }, (_, k) => Array.from({ length: b.height }, (_, r) => b.cellAt(r, k)));
  const total = clues.rows.every((x) => x !== null) ? clues.rows.reduce<number>((s, x) => s + x!, 0) : null;
  let changed = true;
  const set = (c: number, v: Mark): boolean => {
    if (m[c] === v) return true;
    if (m[c] !== UNKNOWN) return false;
    m[c] = v; changed = true;
    return true;
  };
  /** A count rule: exactly `want` of `cells` are trail. */
  const exactly = (cells: readonly number[], want: number): boolean => {
    let t = 0, u = 0;
    for (const c of cells) if (m[c] === TRAIL) t++; else if (m[c] === UNKNOWN) u++;
    if (t > want || t + u < want) return false;
    if (u === 0) return true;
    if (t === want) { for (const c of cells) if (m[c] === UNKNOWN && !set(c, CLEAR)) return false; }
    else if (t + u === want) { for (const c of cells) if (m[c] === UNKNOWN && !set(c, TRAIL)) return false; }
    return true;
  };
  while (changed) {
    changed = false;
    for (let r = 0; r < b.height; r++) if (clues.rows[r] !== null && !exactly(rowCells[r]!, clues.rows[r]!)) return false;
    for (let k = 0; k < b.width; k++) if (clues.cols[k] !== null && !exactly(colCells[k]!, clues.cols[k]!)) return false;
    for (const d of clues.dew) if (!exactly(b.around[d.cell]!, d.n)) return false;
    for (const c of b.all) {
      if (m[c] === TRAIL) {
        // A trail square has exactly two trail squares beside it (one at either end of the trail).
        if (!exactly(b.orth[c]!, need(c))) return false;
      } else if (m[c] === UNKNOWN) {
        let t = 0, open = 0;
        for (const n of b.orth[c]!) { if (m[n] === TRAIL) t++; if (m[n] !== CLEAR) open++; }
        // Three trail squares beside it, or a dead end: it can't be trail.
        if (t >= 3 || open < 2) { if (!set(c, CLEAR)) return false; }
      }
    }
    // Pieces of trail found so far. A square touching one piece twice would close a loop.
    const piece = new Array<number>(b.cells).fill(-1);
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
      const seen = new Set<number>();
      for (const n of b.orth[c]!) if (m[n] === TRAIL) { if (seen.has(piece[n]!)) { if (!set(c, CLEAR)) return false; break; } seen.add(piece[n]!); }
    }
    // The whole trail joined up: nothing else can be trail.
    if (pieces === 1 && piece[clues.entry] === piece[clues.exit] && b.all.every((c) => m[c] !== TRAIL || b.orth[c]!.filter((n) => m[n] === TRAIL).length === need(c))) {
      for (const c of b.all) if (m[c] === UNKNOWN && !set(c, CLEAR)) return false;
    }
    if (pieces > 1 && piece[clues.entry] === piece[clues.exit] && piece[clues.entry]! >= 0) {
      // The gap and the bed are joined, yet trail lies elsewhere: no single trail.
      const joined = b.all.filter((c) => m[c] === TRAIL && piece[c] === piece[clues.entry]);
      if (joined.every((c) => b.orth[c]!.filter((n) => m[n] === TRAIL).length === need(c))) return false;
    }
    if (total !== null) {
      const t = b.all.filter((c) => m[c] === TRAIL).length;
      if (t > total) return false;
      if (t === total) for (const c of b.all) if (m[c] === UNKNOWN && !set(c, CLEAR)) return false;
    }
  }
  return true;
}

/** True when every square is decided and the trail squares make one trail from the gap to the bed. */
function isTrail(b: Board, clues: Clues, m: readonly Mark[]): boolean {
  if (m.some((x) => x === UNKNOWN)) return false;
  const on = b.all.filter((c) => m[c] === TRAIL);
  if (m[clues.entry] !== TRAIL || m[clues.exit] !== TRAIL) return false;
  for (const c of on) {
    const deg = b.orth[c]!.filter((n) => m[n] === TRAIL).length;
    if (deg !== (c === clues.entry || c === clues.exit ? 1 : 2)) return false;
  }
  const seen = new Set([clues.entry]);
  const stack = [clues.entry];
  while (stack.length) { const x = stack.pop()!; for (const n of b.orth[x]!) if (m[n] === TRAIL && !seen.has(n)) { seen.add(n); stack.push(n); } }
  return seen.size === on.length;
}

/** True when the squares make one trail from `entry` to `exit` that never touches itself along an edge. */
export function isPath(b: Board, cells: readonly number[], entry: number, exit: number): boolean {
  const on = new Set(cells);
  if (!on.has(entry) || !on.has(exit)) return false;
  for (const c of on) {
    const deg = b.orth[c]!.filter((n) => on.has(n)).length;
    if (deg !== (c === entry || c === exit ? 1 : 2)) return false;
  }
  const seen = new Set([entry]);
  const stack = [entry];
  while (stack.length) { const x = stack.pop()!; for (const n of b.orth[x]!) if (on.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); } }
  return seen.size === on.size;
}

/** The marks the clues force on a board, from `start` (default: nothing marked). */
export function deduce(b: Board, clues: Clues, depth: 0 | 1, start?: readonly Mark[]): Deduction {
  const m: Mark[] = start ? start.slice() : new Array<Mark>(b.cells).fill(UNKNOWN);
  const fixed = (c: number, v: Mark) => (m[c] === UNKNOWN ? ((m[c] = v), true) : m[c] === v);
  const ok = fixed(clues.entry, TRAIL) && fixed(clues.exit, TRAIL)
    && clues.glints.every((c) => fixed(c, TRAIL)) && clues.dew.every((d) => fixed(d.cell, CLEAR));
  if (!ok || !propagate(b, clues, m)) return { marks: m, stuck: true, solved: false, tries: 0 };
  let tries = 0;
  const breaks = (c: number, v: Mark): boolean => {
    const t = m.slice();
    t[c] = v;
    if (!propagate(b, clues, t)) return true;
    return !t.includes(UNKNOWN) && !isTrail(b, clues, t);
  };
  if (depth === 1) {
    for (let progress = true; progress && m.includes(UNKNOWN);) {
      progress = false;
      for (const c of b.all) {
        if (m[c] !== UNKNOWN) continue;
        const v: Mark | null = breaks(c, TRAIL) ? CLEAR : breaks(c, CLEAR) ? TRAIL : null;
        if (v === null) continue;
        m[c] = v; tries++; progress = true;
        if (!propagate(b, clues, m)) return { marks: m, stuck: true, solved: false, tries };
      }
    }
  }
  return { marks: m, stuck: false, solved: isTrail(b, clues, m), tries };
}

export interface ClueOptions {
  /** How many tallies may be hidden. */
  hideTallies: number;
  /** Whether solving may take one step of trying a square (depth 1) or rules alone (depth 0). */
  depth: 0 | 1;
  /** Dew squares to keep beyond the fewest that work, to make a night gentler. */
  spareDew: number;
}

/**
 * A clue set for the trail that `deduce` solves: start from every clue, then take clues away in a
 * random order while the trail can still be worked out, then give back `spareDew` dew squares.
 */
export function makeClues(rng: Rng, b: Board, trail: readonly number[], opts: ClueOptions): Clues {
  const full = allClues(b, trail);
  const solves = (c: Clues) => deduce(b, c, opts.depth).solved;
  let clues: Clues = { ...full, rows: full.rows.slice(), cols: full.cols.slice(), dew: full.dew.slice() };
  // Rarely even every clue leaves a choice: then show some of the trail.
  for (const c of rng.shuffle(trail.slice(1, -1))) {
    if (solves(clues)) break;
    clues = { ...clues, glints: [...clues.glints, c] };
  }
  if (!solves(clues)) throw new Error('trail cannot be worked out');
  // Hide tallies first, while every dew square still shows, so the dew has work to do.
  let hidden = 0;
  for (const [axis, i] of rng.shuffle([...clues.rows.map((_, r) => ['rows', r] as const), ...clues.cols.map((_, k) => ['cols', k] as const)])) {
    if (hidden >= opts.hideTallies) break;
    const line = clues[axis].slice();
    line[i] = null;
    const without = { ...clues, [axis]: line };
    if (solves(without)) { clues = without; hidden++; }
  }
  const removed: Dew[] = [];
  for (const d of rng.shuffle(clues.dew)) {
    const without = { ...clues, dew: clues.dew.filter((x) => x !== d) };
    if (solves(without)) { clues = without; removed.push(d); }
  }
  // Glints that turned out not to be needed go too.
  for (const g of clues.glints.slice()) {
    const without = { ...clues, glints: clues.glints.filter((x) => x !== g) };
    if (solves(without)) clues = without;
  }
  const spare = rng.shuffle(removed).slice(0, opts.spareDew);
  clues = { ...clues, dew: [...clues.dew, ...spare].sort((p, q) => p.cell - q.cell) };
  return clues;
}
