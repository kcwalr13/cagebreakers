/**
 * A Garden Siege field, built from a garden's map: squares or hexagons, what lies on each (lawn,
 * rock, pond, mud, rich soil, rabbit holes), the gaps pests come in by and the gates to the bed.
 * Also the way pests walk (a shortest way to the nearest gate around whatever is planted) and the
 * straight line pests fly.
 *
 * Positions are in tile widths: neighbouring tiles' middles are 1 apart. Square tile (r, k) has its
 * middle at (k + 0.5, r + 0.5). Hexagons point up, odd rows shifted right by half a tile ("odd-r"):
 * tile (r, k) has its middle at (k + 0.5 + (r odd ? 0.5 : 0), r × √3/2 + 1/√3).
 */
import { type MapDef, type MapShape, mapById } from '../../content/siege-maps';

export interface Pt { x: number; y: number }
export type Terrain = 'lawn' | 'rock' | 'pond' | 'mud' | 'rich' | 'hole';

export const HEX_ROW = Math.sqrt(3) / 2;
export const HEX_RADIUS = 1 / Math.sqrt(3);

export interface Field {
  map: MapDef;
  shape: MapShape;
  w: number;
  h: number;
  cells: number;
  terrain: readonly Terrain[];
  /** Tiles under the gaps in the hedge, in order: pests take turns coming in by them. */
  entries: readonly number[];
  /** Tiles above the gates to the bed. */
  exits: readonly number[];
  /** Each rabbit hole's other end, or -1. */
  holeTo: readonly number[];
  /** Neighbours along an edge. */
  nbrs: readonly (readonly number[])[];
  /** Every tile's middle. */
  mids: readonly Pt[];
  /** The drawing's size, in tile widths. */
  size: Pt;
  rowOf(c: number): number;
  colOf(c: number): number;
  cellAt(r: number, k: number): number;
  centre(c: number): Pt;
  walkable(c: number): boolean;
  /** Whether a bramble may be planted here. */
  plantable(c: number): boolean;
  /** Where pests coming in by an entry appear (above the hedge), and where they leave by an exit (below). */
  start(entry: number): Pt;
  end(exit: number): Pt;
}

const TERRAIN: Record<string, Terrain> = { '.': 'lawn', v: 'lawn', '^': 'lawn', '#': 'rock', '~': 'pond', ',': 'mud', '+': 'rich', '1': 'hole', '2': 'hole', '3': 'hole' };

const fields = new Map<string, Field>();

export function fieldOf(map: MapDef | string): Field {
  const m = typeof map === 'string' ? mapById(map) : map;
  let f = fields.get(m.id);
  if (f) return f;
  const h = m.rows.length, w = m.rows[0]!.length;
  const cells = w * h;
  const rowOf = (c: number) => Math.floor(c / w), colOf = (c: number) => c % w, cellAt = (r: number, k: number) => r * w + k;
  const chars = m.rows.join('');
  const terrain = [...chars].map((ch) => TERRAIN[ch] ?? 'lawn');
  const entries = [...m.rows[0]!].flatMap((ch, k) => (ch === 'v' ? [k] : []));
  const exits = [...m.rows[h - 1]!].flatMap((ch, k) => (ch === '^' ? [cellAt(h - 1, k)] : []));
  const holeTo = new Array<number>(cells).fill(-1);
  for (const digit of ['1', '2', '3']) {
    const ends = [...chars].flatMap((ch, c) => (ch === digit ? [c] : []));
    if (ends.length === 2) { holeTo[ends[0]!] = ends[1]!; holeTo[ends[1]!] = ends[0]!; }
  }
  const hex = m.shape === 'hex';
  const centre = (c: number): Pt => {
    const r = rowOf(c), k = colOf(c);
    return hex ? { x: k + 0.5 + (r % 2 ? 0.5 : 0), y: r * HEX_ROW + HEX_RADIUS } : { x: k + 0.5, y: r + 0.5 };
  };
  const nbrs = Array.from({ length: cells }, (_, c) => {
    const r = rowOf(c), k = colOf(c);
    const steps: [number, number][] = !hex ? [[1, 0], [0, -1], [0, 1], [-1, 0]]
      : r % 2 ? [[1, 0], [1, 1], [0, -1], [0, 1], [-1, 0], [-1, 1]] : [[1, -1], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 0]];
    return steps.map(([dr, dk]) => [r + dr, k + dk] as const).filter(([rr, kk]) => rr >= 0 && rr < h && kk >= 0 && kk < w).map(([rr, kk]) => cellAt(rr, kk));
  });
  const mids = Array.from({ length: cells }, (_, c) => centre(c));
  const walkable = (c: number) => terrain[c] !== 'rock' && terrain[c] !== 'pond';
  const entryCells = new Set(entries.map((k) => cellAt(0, k)));
  const exitCells = new Set(exits);
  const plantable = (c: number) => (terrain[c] === 'lawn' || terrain[c] === 'rich') && !entryCells.has(c) && !exitCells.has(c);
  const size: Pt = hex ? { x: w + 0.5, y: (h - 1) * HEX_ROW + 2 * HEX_RADIUS } : { x: w, y: h };
  f = {
    map: m, shape: m.shape, w, h, cells, terrain, entries: entries.map((k) => cellAt(0, k)), exits, holeTo, nbrs, mids, size,
    rowOf, colOf, cellAt, centre: (c) => mids[c]!, walkable, plantable,
    start: (e) => ({ x: mids[e]!.x, y: -0.6 }),
    end: (x) => ({ x: mids[x]!.x, y: size.y + 0.6 }),
  };
  fields.set(m.id, f);
  return f;
}

/** Steps from each tile to the nearest gate, walking around `blocked`; -1 where no gate can be reached. */
export function distances(f: Field, blocked: ReadonlySet<number>): number[] {
  const dist = new Array<number>(f.cells).fill(-1);
  const queue: number[] = [];
  for (const x of f.exits) if (!blocked.has(x)) { dist[x] = 0; queue.push(x); }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]!;
    for (const n of f.nbrs[c]!) {
      if (dist[n]! >= 0 || blocked.has(n) || !f.walkable(n)) continue;
      dist[n] = dist[c]! + 1;
      queue.push(n);
    }
  }
  return dist;
}

/**
 * A shortest way from a tile to the nearest gate. On squares it keeps straight where it can, else heads
 * down, else the leftmost. Hexagons have no straight down, so going down it zigzags about the nearest
 * gate's line instead of running off at a slant (keeping straight only along a row).
 */
function pathFrom(f: Field, from: number, dist: readonly number[], dir0: Pt): number[] {
  const path = [from];
  let c = from, dir = dir0;
  const hex = f.shape === 'hex';
  while (dist[c] !== 0) {
    const options = f.nbrs[c]!.filter((n) => dist[n] === dist[c]! - 1);
    const vec = (n: number) => { const a = f.mids[c]!, b = f.mids[n]!; return { x: b.x - a.x, y: b.y - a.y }; };
    const goal = hex ? f.mids[f.exits.reduce((best, x) => (Math.abs(f.mids[x]!.x - f.mids[c]!.x) < Math.abs(f.mids[best]!.x - f.mids[c]!.x) ? x : best))]!.x : 0;
    const score = (n: number) => {
      const v = vec(n), straight = Math.abs(v.x - dir.x) < 1e-6 && Math.abs(v.y - dir.y) < 1e-6;
      return hex ? (straight && Math.abs(v.y) < 1e-6 ? 10 : 0) + v.y * 2 - Math.abs(f.mids[n]!.x - goal)
        : (straight ? 10 : 0) + v.y * 2 - Math.abs(v.x) * 0.1;
    };
    const next = options.reduce((best, n) => (score(n) > score(best) || (score(n) === score(best) && n < best) ? n : best));
    dir = vec(next);
    path.push(next);
    c = next;
  }
  return path;
}

/**
 * The tiles a pest coming in by entry `e` walks: a shortest way to the nearest gate around what's
 * planted. Pests don't know about rabbit holes: one that steps on a hole drops in and comes up out of
 * the other end, once for each pair, and walks on from there. So a way over a hole near the bed can
 * send pests back up the garden, and one over a hole near the gap sends them ahead. Null when the way
 * is closed.
 */
export function walkOf(f: Field, blocked: ReadonlySet<number>, e = 0, dist = distances(f, blocked)): number[] | null {
  const entry = f.entries[e]!;
  if (blocked.has(entry) || dist[entry]! < 0) return null;
  const used = new Set<number>();
  const out: number[] = [];
  let leg = pathFrom(f, entry, dist, { x: 0, y: 1 });
  for (;;) {
    const at = leg.findIndex((c) => f.holeTo[c]! >= 0 && !used.has(c) && dist[f.holeTo[c]!]! >= 0);
    if (at < 0) { out.push(...leg); return out; }
    const hole = leg[at]!, to = f.holeTo[hole]!;
    used.add(hole); used.add(to);
    out.push(...leg.slice(0, at + 1));
    leg = pathFrom(f, to, dist, { x: 0, y: 1 });
  }
}

/** Every entry's way. Null when any entry's way is closed. */
export function walksOf(f: Field, blocked: ReadonlySet<number>): number[][] | null {
  const dist = distances(f, blocked);
  const out: number[][] = [];
  for (let e = 0; e < f.entries.length; e++) {
    const walk = walkOf(f, blocked, e, dist);
    if (!walk) return null;
    out.push(walk);
  }
  return out;
}

/**
 * A route as a line: points, the tile each stands for (-1 above the hedge and below the bed), the
 * distance along the line to each, and which stretches run underground (rabbit holes).
 */
export interface Route { pts: Pt[]; cells: number[]; cum: number[]; len: number; under: boolean[] }

/** A rabbit hole's stretch underground counts as this many tiles of walking. */
const TUNNEL = 1.5;

/** The line walking pests follow: in at the gap, tile to tile (or under, by a rabbit hole), out to the bed. */
export function groundRoute(f: Field, walk: readonly number[]): Route {
  const pts = [f.start(walk[0]!), ...walk.map((c) => f.mids[c]!), f.end(walk[walk.length - 1]!)];
  const cells = [-1, ...walk, -1];
  const cum = [0], under: boolean[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = cells[i - 1]!, b = cells[i]!;
    const tunnel = a >= 0 && b >= 0 && f.holeTo[a] === b && !f.nbrs[a]!.includes(b);
    under.push(tunnel);
    cum.push(cum[i - 1]! + (tunnel ? TUNNEL : Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)));
  }
  return { pts, cells, cum, len: cum[cum.length - 1]!, under };
}

/** The line flying pests from an entry follow: straight to the nearest gate. */
export function airRoute(f: Field, e = 0): Route {
  const from = f.start(f.entries[e]!);
  const exit = f.exits.reduce((best, x) => (Math.abs(f.mids[x]!.x - from.x) < Math.abs(f.mids[best]!.x - from.x) ? x : best));
  const to = f.end(exit);
  return { pts: [from, to], cells: [-1, -1], cum: [0, Math.hypot(to.x - from.x, to.y - from.y)], len: Math.hypot(to.x - from.x, to.y - from.y), under: [false] };
}

/** Which stretch of a route `d` falls on, and how far along it (0 to 1). */
function segmentAt(r: Route, d: number): { i: number; t: number } {
  if (d <= 0) return { i: 0, t: 0 };
  if (d >= r.len) return { i: r.pts.length - 2, t: 1 };
  let lo = 0, hi = r.cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (r.cum[mid]! <= d) lo = mid; else hi = mid; }
  return { i: lo, t: (d - r.cum[lo]!) / (r.cum[hi]! - r.cum[lo]!) };
}

/** The point `d` along a route. */
export function pointAt(r: Route, d: number): Pt {
  const { i, t } = segmentAt(r, d);
  const a = r.pts[i]!, b = r.pts[i + 1]!;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Whether `d` along a route is underground. */
export const underAt = (r: Route, d: number): boolean => { const { i } = segmentAt(r, d); return r.under[i]!; };

/** The tile `d` along a route is on (the nearer end of its stretch), or -1. */
export function cellOn(r: Route, d: number): number {
  const { i, t } = segmentAt(r, d);
  return t < 0.5 ? r.cells[i]! : r.cells[i + 1]!;
}

/** The tile whose middle is nearest a point, if the point lies within it. */
export function cellNear(f: Field, p: Pt): number | null {
  let best = -1, bestD = Infinity;
  for (let c = 0; c < f.cells; c++) {
    const m = f.mids[c]!, d = (m.x - p.x) ** 2 + (m.y - p.y) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best < 0) return null;
  const m = f.mids[best]!;
  const inside = f.shape === 'hex' ? Math.sqrt(bestD) <= HEX_RADIUS * 1.05 : Math.abs(m.x - p.x) <= 0.5 && Math.abs(m.y - p.y) <= 0.5;
  return inside ? best : null;
}
