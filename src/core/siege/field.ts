/**
 * Garden Siege's field: squares, the route pests walk (the shortest way from the gap in the hedge to
 * the bed around whatever is planted), and the straight line pests fly. Positions are in squares,
 * (0, 0) being the top-left corner of the field.
 */
import { SIEGE } from '../../content/siege';

export interface Pt { x: number; y: number }

export const W = SIEGE.width, H = SIEGE.height;
export const CELLS = W * H;
export const rowOf = (c: number) => Math.floor(c / W);
export const colOf = (c: number) => c % W;
export const cellAt = (r: number, k: number) => r * W + k;
export const centre = (c: number): Pt => ({ x: colOf(c) + 0.5, y: rowOf(c) + 0.5 });
/** The square under the gap, and the one above the bed's gate: never planted. */
export const ENTRY = cellAt(0, SIEGE.entryCol);
export const EXIT = cellAt(H - 1, SIEGE.exitCol);

/** Neighbours along an edge, in the order the route prefers them: down, then sideways, then up. */
const NEIGHBOURS: readonly (readonly number[])[] = Array.from({ length: CELLS }, (_, c) => {
  const r = rowOf(c), k = colOf(c), out: number[] = [];
  if (r + 1 < H) out.push(c + W);
  if (k > 0) out.push(c - 1);
  if (k + 1 < W) out.push(c + 1);
  if (r > 0) out.push(c - W);
  return out;
});

/** Steps from each square to the bed's square, walking around `blocked`; -1 where it can't be reached. */
function distances(blocked: ReadonlySet<number>): number[] {
  const dist = new Array<number>(CELLS).fill(-1);
  if (blocked.has(EXIT)) return dist;
  dist[EXIT] = 0;
  const queue = [EXIT];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]!;
    for (const n of NEIGHBOURS[c]!) {
      if (dist[n]! >= 0 || blocked.has(n)) continue;
      dist[n] = dist[c]! + 1;
      queue.push(n);
    }
  }
  return dist;
}

/**
 * The squares pests walk, from the gap to the bed: a shortest way around what's planted, keeping
 * straight where it can. Null when what's planted closes the way.
 */
export function walkOf(blocked: ReadonlySet<number>): number[] | null {
  if (blocked.has(ENTRY)) return null;
  const dist = distances(blocked);
  if (dist[ENTRY]! < 0) return null;
  const path = [ENTRY];
  let c = ENTRY, dir = W;
  while (c !== EXIT) {
    const steps = NEIGHBOURS[c]!.filter((n) => dist[n] === dist[c]! - 1);
    const next = steps.find((n) => n - c === dir) ?? steps[0]!;
    dir = next - c;
    path.push(next);
    c = next;
  }
  return path;
}

/** A route as a line: points, and the distance along it to each. */
export interface Route { pts: Pt[]; cum: number[]; len: number }

function routeOf(pts: Pt[]): Route {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  return { pts, cum, len: cum[cum.length - 1]! };
}

const START: Pt = { x: SIEGE.entryCol + 0.5, y: -0.6 };
const END: Pt = { x: SIEGE.exitCol + 0.5, y: H + 0.6 };

/** The line walking pests follow: in at the gap, square to square, out to the bed. */
export const groundRoute = (walk: readonly number[]): Route => routeOf([START, ...walk.map(centre), END]);
/** The line flying pests follow: straight from the gap to the bed. */
export const airRoute = (): Route => routeOf([START, END]);

/** The point `d` along a route. */
export function pointAt(r: Route, d: number): Pt {
  if (d <= 0) return r.pts[0]!;
  if (d >= r.len) return r.pts[r.pts.length - 1]!;
  let lo = 0, hi = r.cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (r.cum[mid]! <= d) lo = mid; else hi = mid; }
  const a = r.pts[lo]!, b = r.pts[hi]!, t = (d - r.cum[lo]!) / (r.cum[hi]! - r.cum[lo]!);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
