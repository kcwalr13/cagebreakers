/**
 * The hidden trail. A trail is a path of squares from the gap in the hedge (a square on the top row)
 * to the bed (a square on the bottom row) that never touches itself along an edge: two trail squares
 * side by side are always steps of the trail. It may touch itself at a corner.
 */
import type { Rng } from '../rng';
import type { Board } from './board';

/** Draws a trail from a square on the top row to one on the bottom row, `minLen` to `maxLen` squares long. */
export function drawTrail(rng: Rng, b: Board, minLen: number, maxLen: number): number[] {
  for (let attempt = 0; attempt < 4000; attempt++) {
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

/** True when the squares make one trail from `entry` to `exit` that never touches itself along an edge. */
export function isPath(b: Board, cells: Iterable<number>, entry: number, exit: number): boolean {
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

/** Whether the trail goes straight through its `i`th square (false at either end). */
export function straightAt(trail: readonly number[], i: number): boolean {
  if (i <= 0 || i >= trail.length - 1) return false;
  return trail[i + 1]! - trail[i]! === trail[i]! - trail[i - 1]!;
}
