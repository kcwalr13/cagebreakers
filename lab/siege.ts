/**
 * Garden Siege's balance lab: bots play whole seasons, and the report says how far each gets and
 * how many seedlings it keeps. Run: npx tsx lab/siege.ts [seasons]
 *
 *  - Mazer plants hedges in walls across the field so pests walk back and forth, puts its defenders
 *    in the walls where they reach the most of the route, matches defenders to the waves coming, and
 *    upgrades when the maze is done.
 *  - Plain plants the same defenders but no hedges: pests walk straight down.
 *  - Idle plants nothing.
 */
import { DEFENDERS, type DefenderId, PESTS, SIEGE, WAVES } from '../src/content/siege';
import { type Pt, ENTRY, EXIT, H, W, airRoute, cellAt, centre, pointAt } from '../src/core/siege/field';
import { type SiegeState, actSiege, buildBlocker, costOf, newSiege, walkNow } from '../src/core/siege/run';

const seasons = Number(process.argv[2] ?? 20);

/** The walls a mazer builds: every other row, with a gap at alternate ends, so pests walk back and forth. */
const WALL_ROWS: number[][] = [[2, W - 1], [4, 0], [6, W - 1], [8, 0], [10, W - 1]].map(([row, gap]) =>
  Array.from({ length: W }, (_, k) => k).filter((k) => k !== gap).map((k) => cellAt(row!, k)));
const WALLS: number[] = WALL_ROWS.flat();

const air = airRoute();
const airPts: Pt[] = Array.from({ length: 40 }, (_, i) => pointAt(air, (air.len * i) / 39));

/** How much of the pests' way a defender on `cell` would reach: route squares, and flying ones if it can. */
function coverage(s: SiegeState, kind: DefenderId, cell: number, level = 0): number {
  const def = DEFENDERS[kind], r = def.levels[level]!.range, at = centre(cell);
  const walk = walkNow(s);
  let n = 0;
  for (const c of walk) { const p = centre(c); if (Math.hypot(p.x - at.x, p.y - at.y) <= r) n++; }
  if (def.air !== 'no') for (const p of airPts) if (Math.hypot(p.x - at.x, p.y - at.y) <= r) n += def.air === 'double' ? 0.6 : 0.3;
  return n;
}

/** What the next wave calls for. */
function wanted(s: SiegeState): DefenderId {
  const kinds = new Set((WAVES[s.wave - 1] ?? []).map((g) => g.kind));
  const have = (k: DefenderId) => s.placed.filter((p) => p.kind === k).length;
  const hybrids = s.unlocked.filter((h) => s.coins >= costOf(h));
  if (hybrids.length && have(hybrids[0]!) < 3) return hybrids[0]!;
  if ([...kinds].some((k) => PESTS[k].flies) && have('thrush') < 3) return 'thrush';
  if ([...kinds].some((k) => PESTS[k].armour >= 2 || k === 'greatSnail') && have('hedgehog') < 4) return 'hedgehog';
  if (kinds.has('aphids') && have('marigold') < 2) return 'marigold';
  return have('frog') <= have('hedgehog') + 1 ? 'frog' : 'hedgehog';
}

type Bot = (s: SiegeState) => SiegeState;

/** The square where a defender would reach the most of the route as it would run with the defender there. */
function bestSpot(s: SiegeState, kind: DefenderId, spots: readonly number[]): number | null {
  let best: number | null = null, bestN = 0;
  for (const c of spots) {
    if (buildBlocker(s, kind, c)) continue;
    const after = { ...s, placed: [...s.placed, { id: -1, kind, cell: c, level: 0, spent: 0 }] };
    const n = coverage(after, kind, c);
    if (n > bestN) { bestN = n; best = c; }
  }
  return best;
}

/** The wall square where a hedge makes the route longest. */
function bestHedge(s: SiegeState): number | null {
  let best: number | null = null, bestLen = -1;
  for (const c of WALLS) {
    if (buildBlocker(s, 'hedge', c)) continue;
    const len = walkNow({ placed: [...s.placed, { id: -1, kind: 'hedge', cell: c, level: 0, spent: 0 }] }).length;
    if (len > bestLen) { bestLen = len; best = c; }
  }
  return best;
}

const act = (s: SiegeState, a: Parameters<typeof actSiege>[1]) => { const r = actSiege(s, a); return r.ok ? r.state : s; };

const dps = (kind: DefenderId, level: number) => { const lv = DEFENDERS[kind].levels[level]!; return (lv.damage * Math.min(lv.targets ?? 1, 3)) / lv.every; };

/** How much harm the defenders could do to a pest walking the route: each one's harm a second, times the route squares it reaches. */
function potential(s: SiegeState): number {
  const walk = walkNow(s).map(centre);
  let sum = 0;
  for (const p of s.placed) {
    if (p.kind === 'hedge') continue;
    const def = DEFENDERS[p.kind], r = def.levels[p.level]!.range, at = centre(p.cell);
    let n = 0;
    for (const q of walk) if (Math.hypot(q.x - at.x, q.y - at.y) <= r) n++;
    if (def.air !== 'no') for (const q of airPts) if (Math.hypot(q.x - at.x, q.y - at.y) <= r) n += def.air === 'double' ? 0.5 : 0.25;
    sum += dps(p.kind, p.level) * n;
  }
  return sum + walk.length * 0.01;
}

/** Greedy: the purchase that adds the most potential for its price, until nothing is worth buying. */
function spend(s: SiegeState, maze: boolean): SiegeState {
  if (s.phase === 'pick') s = act(s, { type: 'pick', kind: s.offer[0]! });
  const cells = Array.from({ length: W * H }, (_, c) => c).filter((c) => c !== ENTRY && c !== EXIT);
  for (let guard = 0; guard < 300; guard++) {
    const want = wanted(s);
    const base = potential(s);
    let best: { a: Parameters<typeof actSiege>[1]; gain: number; then?: SiegeState } | null = null as { a: Parameters<typeof actSiege>[1]; gain: number; then?: SiegeState } | null;
    const consider = (a: Parameters<typeof actSiege>[1], cost: number) => {
      const r = actSiege(s, a);
      if (!r.ok) return;
      const gain = (potential(r.state) - base) / cost;
      if (gain > 0 && (!best || gain > best.gain)) best = { a, gain };
    };
    if (s.coins >= costOf(want)) for (const c of cells) if (!s.placed.some((p) => p.cell === c)) consider({ type: 'build', kind: want, cell: c }, costOf(want));
    if (maze) {
      // A whole wall at once: a wall turns the pests only when it's whole.
      for (const wall of WALL_ROWS) {
        const empty = wall.filter((c) => !s.placed.some((p) => p.cell === c));
        if (!empty.length || s.coins < empty.length * SIEGE.hedge) continue;
        let t = s;
        for (const c of empty) t = act(t, { type: 'build', kind: 'hedge', cell: c });
        const gain = (potential(t) - base) / (empty.length * SIEGE.hedge);
        if (gain > 0 && (!best || gain > best.gain)) best = { a: { type: 'wave' }, gain, then: t };
      }
    }
    for (const p of s.placed) if (p.kind !== 'hedge' && p.level < 2 && s.coins >= costOf(p.kind, p.level + 1)) consider({ type: 'upgrade', id: p.id }, costOf(p.kind, p.level + 1));
    if (!best) break;
    const pick = best as { a: Parameters<typeof actSiege>[1]; then?: SiegeState };
    s = pick.then ?? act(s, pick.a);
  }
  return s;
}

/** Builds the walls one at a time, keeping two defenders in the walls for each wall built (and two more), upgrading with the rest. */
function plan(s: SiegeState): SiegeState {
  if (s.phase === 'pick') s = act(s, { type: 'pick', kind: s.offer[0]! });
  for (let guard = 0; guard < 300; guard++) {
    const want = wanted(s);
    const towers = s.placed.filter((p) => p.kind !== 'hedge').length;
    const built = WALL_ROWS.filter((wall) => wall.every((c) => s.placed.some((p) => p.cell === c))).length;
    if (towers < 2 * built + 2) {
      if (s.coins < costOf(want)) break;
      const spot = bestSpot(s, want, WALLS);
      if (spot !== null) { s = act(s, { type: 'build', kind: want, cell: spot }); continue; }
      const swapped = swapIn(s, want);
      if (swapped) { s = swapped; continue; }
    }
    const next = WALLS.find((c) => !s.placed.some((p) => p.cell === c) && !buildBlocker(s, 'hedge', c));
    if (next !== undefined) {
      if (s.coins < SIEGE.hedge) break;
      s = act(s, { type: 'build', kind: 'hedge', cell: next });
      continue;
    }
    // The maze is whole: more defenders in it, then upgrades, whichever reaches the most.
    if (s.coins >= costOf(want)) { const swapped = swapIn(s, want); if (swapped) { s = swapped; continue; } }
    const ups = s.placed.filter((p) => p.kind !== 'hedge' && p.level < 2 && s.coins >= costOf(p.kind, p.level + 1))
      .sort((a, b) => coverage(s, b.kind as DefenderId, b.cell, b.level) - coverage(s, a.kind as DefenderId, a.cell, a.level));
    if (ups.length) { s = act(s, { type: 'upgrade', id: ups[0]!.id }); continue; }
    break;
  }
  return s;
}

/** Swaps the hedge where a defender would reach the most for that defender. */
function swapIn(s: SiegeState, want: DefenderId): SiegeState | null {
  if (s.coins < costOf(want)) return null;
  let best: { id: number; cell: number; n: number } | null = null;
  for (const h of s.placed.filter((p) => p.kind === 'hedge')) {
    const without = { ...s, placed: s.placed.filter((p) => p.id !== h.id) };
    if (buildBlocker(without, want, h.cell)) continue;
    const n = coverage(without, want, h.cell);
    if (!best || n > best.n) best = { id: h.id, cell: h.cell, n };
  }
  if (!best) return null;
  return act(act(s, { type: 'sell', id: best.id }), { type: 'build', kind: want, cell: best.cell });
}

export const BOTS: Record<string, Bot> = {
  Mazer: plan,
  Greedy: (s) => spend(s, true),
  Plain: (s) => spend(s, false),
  Idle: (s) => (s.phase === 'pick' ? act(s, { type: 'pick', kind: s.offer[0]! }) : s),
};

if (process.argv[1]?.endsWith('siege.ts')) for (const [name, bot] of Object.entries(BOTS)) {
  let won = 0, seedlings = 0, reached = 0, coins = 0;
  const lostAt: number[] = [];
  const t0 = performance.now();
  const eatenBy = new Array<number>(WAVES.length).fill(0);
  for (let i = 0; i < seasons; i++) {
    let s = newSiege(`LAB${i}`);
    while (s.phase === 'build' || s.phase === 'pick') {
      s = bot(s);
      const r = actSiege(s, { type: 'wave' });
      if (r.record) eatenBy[r.record.wave - 1]! += r.record.eaten;
      s = r.state;
    }
    if (s.phase === 'won') { won++; seedlings += s.seedlings; coins += s.coins; } else lostAt.push(s.wave);
    reached += s.wave;
  }
  const ms = (performance.now() - t0) / seasons;
  console.log(`${name.padEnd(6)} won ${won}/${seasons}${won ? `, ${(seedlings / won).toFixed(1)} seedlings and ${(coins / won).toFixed(0)} coins left` : ''}`
    + `${lostAt.length ? `; lost at wave ${Math.min(...lostAt)}–${Math.max(...lostAt)} (mean ${(lostAt.reduce((a, b) => a + b, 0) / lostAt.length).toFixed(1)})` : ''}`
    + `; ${ms.toFixed(0)} ms a season`);
  console.log(`       eaten per wave: ${eatenBy.map((e) => (e / seasons).toFixed(1)).join(' ')}`);
}
