/**
 * The page's rules beyond rows, columns and plots, compiled once per page so placement, the
 * solver and the generator all check them the same way. Every twist is drawn from the hidden
 * solution and is a rule about one square or a pair of squares, so any subset of the solution
 * keeps every twist: the planner's layouts (and proofs) stay legal on twisted pages.
 *
 *  - Crossed paths (`diagonal`): no number repeats on either long diagonal.
 *  - Elbow room (`elbow`): no number touches the same number, not even at a corner.
 *  - Tidy plots (`tidy`): no number repeats inside a plot.
 *  - Fences (`fences`): the number on the open side of a < or > is the bigger.
 *  - Bean poles (`poles`): numbers climb each pole from its root to its tip.
 *  - Runners (`runners`): two squares joined by a runner hold numbers one apart.
 *  - Shade (`shade`): shady squares take even numbers.
 */
import { gridOf } from './grid';
import type { Page } from './page';

/** Why a cell must differ from, or stand in order with, another. */
export type PeerWhy = 'row' | 'col' | 'diagonal' | 'corner' | 'plot';

export interface Constraints {
  /** Cells that may not share a number with each cell. */
  peers: readonly (readonly number[])[];
  /** Pairs that must stand in order, per cell: the other cell, whether this one must be the bigger, and what says so. */
  order: readonly (readonly (readonly [other: number, greater: boolean, by: 'fence' | 'pole'])[])[];
  /** Cells whose number must be one more or one less than each cell's: runners. */
  near: readonly (readonly number[])[];
  /** The numbers each cell may hold, as a bit mask with bit n for number n. */
  allow: readonly number[];
}

type Shape = Pick<Page, 'size' | 'diagonal' | 'elbow' | 'tidy' | 'cages' | 'cageOf' | 'fences' | 'poles' | 'runners' | 'shade'>;

/** Cells that may not share a number, before plots exist: rows, columns, and the diagonal twists. */
export function latinPeers(size: number, diagonal = false, elbow = false): readonly (readonly number[])[] {
  const g = gridOf(size);
  if (!elbow) return diagonal ? g.crossPeers : g.peers;
  const base = diagonal ? g.crossPeers : g.peers;
  return g.all.map((c) => {
    const out = new Set(base[c]);
    for (const dr of [-1, 1]) for (const dc of [-1, 1]) {
      const r = g.rowOf(c) + dr, k = g.colOf(c) + dc;
      if (r >= 0 && r < size && k >= 0 && k < size) out.add(g.cellAt(r, k));
    }
    return [...out];
  });
}

const cache = new WeakMap<object, Constraints>();

/** The page's constraints, compiled once per page object. */
export function constraintsOf(page: Shape): Constraints {
  let k = cache.get(page);
  if (k) return k;
  const g = gridOf(page.size);
  const base = latinPeers(page.size, page.diagonal, page.elbow);
  const peers = page.tidy
    ? g.all.map((c) => [...new Set([...base[c]!, ...page.cages[page.cageOf[c]!]!.cells.filter((x) => x !== c)])])
    : base;
  const order: [number, boolean, 'fence' | 'pole'][][] = g.all.map(() => []);
  for (const f of page.fences ?? []) { order[f.a]!.push([f.b, true, 'fence']); order[f.b]!.push([f.a, false, 'fence']); }
  for (const pole of page.poles ?? []) {
    for (let i = 0; i < pole.length; i++) for (let j = i + 1; j < pole.length; j++) {
      order[pole[i]!]!.push([pole[j]!, false, 'pole']); order[pole[j]!]!.push([pole[i]!, true, 'pole']);
    }
  }
  const near: number[][] = g.all.map(() => []);
  for (const r of page.runners ?? []) { near[r.a]!.push(r.b); near[r.b]!.push(r.a); }
  const every = (1 << (page.size + 1)) - 2;
  let even = 0;
  for (let n = 2; n <= page.size; n += 2) even |= 1 << n;
  const allow = g.all.map(() => every);
  for (const c of page.shade ?? []) allow[c] = even;
  k = { peers, order, near, allow };
  cache.set(page, k);
  return k;
}

/** Why a number can't stand in a cell, against the numbers around it, or null when it can. `ignore` is a cell to treat as empty. */
export type Broken =
  | { by: 'peer'; why: PeerWhy; other: number }
  | { by: 'fence' | 'pole'; other: number; greater: boolean }
  | { by: 'runner'; other: number }
  | { by: 'shade' };

export function brokenBy(page: Shape, values: readonly number[], cell: number, n: number, ignore = -1): Broken | null {
  const k = constraintsOf(page);
  if (!(k.allow[cell]! & (1 << n))) return { by: 'shade' };
  const g = gridOf(page.size);
  for (const p of k.peers[cell]!) {
    if (p === ignore || values[p] !== n) continue;
    const why: PeerWhy = g.rowOf(p) === g.rowOf(cell) ? 'row' : g.colOf(p) === g.colOf(cell) ? 'col'
      : page.tidy && page.cageOf[p] === page.cageOf[cell] ? 'plot'
        : Math.abs(g.rowOf(p) - g.rowOf(cell)) === 1 && Math.abs(g.colOf(p) - g.colOf(cell)) === 1 && page.elbow ? 'corner' : 'diagonal';
    return { by: 'peer', why, other: p };
  }
  for (const [o, greater, by] of k.order[cell]!) {
    const v = o === ignore ? 0 : values[o]!;
    if (v && (greater ? n <= v : n >= v)) return { by, other: o, greater };
  }
  for (const o of k.near[cell]!) {
    const v = o === ignore ? 0 : values[o]!;
    if (v && Math.abs(v - n) !== 1) return { by: 'runner', other: o };
  }
  return null;
}

/** True when every twist holds between the filled squares of a board (rows and columns aside). */
export function twistsKept(page: Shape, values: readonly number[]): boolean {
  for (let c = 0; c < values.length; c++) {
    const v = values[c]!;
    if (v && brokenBy(page, values, c, v, c)) return false;
  }
  return true;
}
