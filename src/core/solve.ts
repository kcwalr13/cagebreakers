/**
 * A KenKen solver for whole pages: every solution that agrees with the stones, up to a limit.
 * Used to make generated pages have exactly one solution. Depth-first search, always filling the
 * square with the fewest numbers left, where a square's numbers are those that some way of
 * finishing its cage still allows. It knows the twists: hidden operations (any of the four makes
 * a plot bloom), greater-than fences, and pages where the long diagonals count too.
 */
import { gridOf } from './grid';
import { type Cage, type Page, makes } from './page';

/**
 * Every way to fill a cage that hits its target, keeps the Latin rule (and any fence) inside it,
 * and agrees with the stones.
 */
function cageTuples(page: Page, cage: Cage, stones: readonly number[]): number[][] {
  const peers = page.diagonal ? gridOf(page.size).crossPeers : gridOf(page.size).peers;
  const k = cage.cells.length;
  const out: number[][] = [];
  const t = new Array<number>(k).fill(0);
  const inner = (page.fences ?? []).filter((f) => cage.cells.includes(f.a) && cage.cells.includes(f.b));
  const walk = (i: number) => {
    if (i === k) {
      if (!makes(cage, t, page.hidden)) return;
      for (const f of inner) if (t[cage.cells.indexOf(f.a)]! <= t[cage.cells.indexOf(f.b)]!) return;
      out.push(t.slice());
      return;
    }
    const c = cage.cells[i]!;
    for (let v = 1; v <= page.size; v++) {
      if (stones[c] && stones[c] !== v) continue;
      let ok = true;
      for (let j = 0; j < i; j++) if (t[j] === v && peers[c]!.includes(cage.cells[j]!)) { ok = false; break; }
      if (!ok) continue;
      t[i] = v;
      walk(i + 1);
    }
    t[i] = 0;
  };
  walk(0);
  return out;
}

const popcount = (m: number) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };

/**
 * Up to `limit` complete solutions of the page (stones included), as value arrays. `settled` is
 * false when the search gave up before it could say there are no more.
 */
export function solve(page: Page, limit = 2): { found: number[][]; settled: boolean } {
  const g = gridOf(page.size);
  const n = page.size;
  const values = page.stones.slice();
  // Numbers used in each row, column and (on a diagonal page) long diagonal, as bit masks.
  const rowMask = new Array<number>(n).fill(0), colMask = new Array<number>(n).fill(0), diagMask = [0, 0];
  const onDown = (c: number) => page.diagonal && g.rowOf(c) === g.colOf(c);
  const onUp = (c: number) => page.diagonal && g.rowOf(c) + g.colOf(c) === n - 1;
  const used = (c: number) => rowMask[g.rowOf(c)]! | colMask[g.colOf(c)]! | (onDown(c) ? diagMask[0]! : 0) | (onUp(c) ? diagMask[1]! : 0);
  const mark = (c: number, v: number, on: boolean) => {
    const bit = 1 << v;
    const set = (m: number) => (on ? m | bit : m & ~bit);
    rowMask[g.rowOf(c)] = set(rowMask[g.rowOf(c)]!); colMask[g.colOf(c)] = set(colMask[g.colOf(c)]!);
    if (onDown(c)) diagMask[0] = set(diagMask[0]!);
    if (onUp(c)) diagMask[1] = set(diagMask[1]!);
  };
  for (let c = 0; c < g.cells; c++) if (values[c]) mark(c, values[c]!, true);
  // For each cell, the fences beside it as [other cell, true when this cell must be the greater].
  const fenceAt: [number, boolean][][] = g.all.map(() => []);
  for (const f of page.fences ?? []) { fenceAt[f.a]!.push([f.b, true]); fenceAt[f.b]!.push([f.a, false]); }
  const fenceOk = (c: number, v: number) => {
    for (const [o, greater] of fenceAt[c]!) {
      const w = values[o]!;
      if (w && (greater ? v <= w : v >= w)) return false;
    }
    return true;
  };
  const tuples = page.cages.map((cage) => cageTuples(page, cage, page.stones));
  const out: number[][] = [];
  let budget = 2_000_000;

  const dfs = (): void => {
    if (out.length >= limit || --budget < 0) return;
    let best = -1, bestMask = 0, bestCount = 99;
    for (let id = 0; id < page.cages.length; id++) {
      const cells = page.cages[id]!.cells;
      let anyEmpty = false;
      for (const c of cells) if (!values[c]) { anyEmpty = true; break; }
      if (!anyEmpty) continue;
      const allow = new Array<number>(cells.length).fill(0);
      for (const t of tuples[id]!) {
        let ok = true;
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i]!, v = t[i]!;
          if (values[c]) { if (values[c] !== v) { ok = false; break; } }
          else if (used(c) & (1 << v) || !fenceOk(c, v)) { ok = false; break; }
        }
        if (!ok) continue;
        for (let i = 0; i < cells.length; i++) if (!values[cells[i]!]) allow[i]! |= 1 << t[i]!;
      }
      for (let i = 0; i < cells.length; i++) {
        if (values[cells[i]!]) continue;
        const count = popcount(allow[i]!);
        if (count === 0) return;
        if (count < bestCount) { bestCount = count; best = cells[i]!; bestMask = allow[i]!; }
      }
    }
    if (best < 0) { out.push(values.slice()); return; }
    for (let v = 1; v <= n; v++) {
      if (!(bestMask & (1 << v))) continue;
      values[best] = v; mark(best, v, true);
      dfs();
      values[best] = 0; mark(best, v, false);
      if (out.length >= limit || budget < 0) return;
    }
  };
  dfs();
  return { found: out, settled: out.length >= limit || budget >= 0 };
}
