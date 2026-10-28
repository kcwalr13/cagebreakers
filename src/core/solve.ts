/**
 * A KenKen solver for whole pages: every solution that agrees with the stones, up to a limit.
 * Used to make generated pages have exactly one solution. Depth-first search, always filling the
 * square with the fewest numbers left, where a square's numbers are those that some way of
 * finishing its cage still allows. It knows every twist (src/core/twists.ts): hidden operations,
 * crossed paths, elbow room, tidy plots, fences, bean poles, runners and shade.
 */
import { gridOf } from './grid';
import { type Cage, type Page, makes } from './page';
import { type Constraints, constraintsOf } from './twists';

/**
 * Every way to fill a cage that hits its target, keeps every rule between its own squares, and
 * agrees with the stones.
 */
function cageTuples(page: Page, k: Constraints, cage: Cage, stones: readonly number[]): number[][] {
  const cells = cage.cells;
  const n = cells.length;
  const out: number[][] = [];
  const t = new Array<number>(n).fill(0);
  const at = (c: number) => cells.indexOf(c);
  const walk = (i: number) => {
    if (i === n) { if (makes(cage, t, page.hidden)) out.push(t.slice()); return; }
    const c = cells[i]!;
    for (let v = 1; v <= page.size; v++) {
      if (stones[c] && stones[c] !== v) continue;
      if (!(k.allow[c]! & (1 << v))) continue;
      let ok = true;
      for (let j = 0; j < i && ok; j++) if (t[j] === v && k.peers[c]!.includes(cells[j]!)) ok = false;
      for (const [o, greater] of k.order[c]!) {
        const j = at(o);
        if (j >= 0 && j < i && (greater ? v <= t[j]! : v >= t[j]!)) ok = false;
      }
      for (const o of k.near[c]!) {
        const j = at(o);
        if (j >= 0 && j < i && Math.abs(v - t[j]!) !== 1) ok = false;
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
  const n = page.size;
  const k = constraintsOf(page);
  const values = page.stones.slice();
  // Numbers used in each row, column and (on a page of crossed paths) long diagonal, as bit masks.
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
  // Peers the masks don't cover: corner neighbours (elbow room) and plot-mates (tidy plots).
  const extra = g.all.map((c) => k.peers[c]!.filter((p) => g.rowOf(p) !== g.rowOf(c) && g.colOf(p) !== g.colOf(c)
    && !(onDown(c) && onDown(p)) && !(onUp(c) && onUp(p))));
  const fits = (c: number, v: number) => {
    for (const p of extra[c]!) if (values[p] === v) return false;
    for (const [o, greater] of k.order[c]!) { const w = values[o]!; if (w && (greater ? v <= w : v >= w)) return false; }
    for (const o of k.near[c]!) { const w = values[o]!; if (w && Math.abs(v - w) !== 1) return false; }
    return true;
  };
  const tuples = page.cages.map((cage) => cageTuples(page, k, cage, page.stones));
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
          else if (used(c) & (1 << v) || !fits(c, v)) { ok = false; break; }
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
