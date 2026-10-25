/**
 * A KenKen solver for whole pages: every solution that agrees with the stones, up to a limit.
 * Used to make generated pages have exactly one solution. Depth-first search, always filling the
 * square with the fewest numbers left, where a square's numbers are those that some way of
 * finishing its cage still allows.
 */
import { gridOf } from './grid';
import { type Cage, type Page, evaluate } from './page';

/** Every way to fill a cage that hits its target, keeps the Latin rule inside it, and agrees with the stones. */
function cageTuples(cage: Cage, size: number, stones: readonly number[]): number[][] {
  const g = gridOf(size);
  const k = cage.cells.length;
  const out: number[][] = [];
  const t = new Array<number>(k).fill(0);
  const walk = (i: number) => {
    if (i === k) { if (evaluate(cage.op, t) === cage.target) out.push(t.slice()); return; }
    const c = cage.cells[i]!;
    for (let v = 1; v <= size; v++) {
      if (stones[c] && stones[c] !== v) continue;
      let ok = true;
      for (let j = 0; j < i; j++) {
        const d = cage.cells[j]!;
        if (t[j] === v && (g.rowOf(c) === g.rowOf(d) || g.colOf(c) === g.colOf(d))) { ok = false; break; }
      }
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
  const values = page.stones.slice();
  const rowMask = new Array<number>(g.size).fill(0), colMask = new Array<number>(g.size).fill(0);
  for (let c = 0; c < g.cells; c++) if (values[c]) { rowMask[g.rowOf(c)]! |= 1 << values[c]!; colMask[g.colOf(c)]! |= 1 << values[c]!; }
  const tuples = page.cages.map((cage) => cageTuples(cage, page.size, page.stones));
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
          else if ((rowMask[g.rowOf(c)]! | colMask[g.colOf(c)]!) & (1 << v)) { ok = false; break; }
        }
        if (!ok) continue;
        for (let i = 0; i < cells.length; i++) if (!values[cells[i]!]) allow[i]! |= 1 << t[i]!;
      }
      for (let i = 0; i < cells.length; i++) {
        if (values[cells[i]!]) continue;
        const n = popcount(allow[i]!);
        if (n === 0) return;
        if (n < bestCount) { bestCount = n; best = cells[i]!; bestMask = allow[i]!; }
      }
    }
    if (best < 0) { out.push(values.slice()); return; }
    const r = g.rowOf(best), k = g.colOf(best);
    for (let v = 1; v <= g.size; v++) {
      if (!(bestMask & (1 << v))) continue;
      values[best] = v; rowMask[r]! |= 1 << v; colMask[k]! |= 1 << v;
      dfs();
      values[best] = 0; rowMask[r]! &= ~(1 << v); colMask[k]! &= ~(1 << v);
      if (out.length >= limit || budget < 0) return;
    }
  };
  dfs();
  return { found: out, settled: out.length >= limit || budget >= 0 };
}
