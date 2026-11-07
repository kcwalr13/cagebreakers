/**
 * Garden Siege's balance lab: bots play whole seasons, and the report says how far each gets and
 * how many seedlings it keeps. Run: npx tsx lab/siege.ts [seasons]
 *
 *  - Mazer plants walls of brambles across every other row, the gap at alternate ends, so pests walk
 *    back and forth; it unlocks the elements the coming waves call for, grows the brambles that reach
 *    most of the way into defenders, upgrades them, and grows the best into hybrids.
 *  - Brambles builds the same maze and never grows anything.
 *  - Plain grows the same defenders, from brambles beside the straight way down: no maze.
 *  - Idle plants nothing.
 */
import { DEFENDERS, type DefenderId, type Element, ELEMENTS, ELEMENT_IDS, PESTS, SIEGE, WAVES } from '../src/content/siege';
import { type Pt, ENTRY, EXIT, H, W, airRoute, cellAt, centre, pointAt } from '../src/core/siege/field';
import { type SiegeAction, type SiegeState, actSiege, costOf, growthsOf, maxLevel, newSiege, plantBlocker, unlockPrice, walkNow } from '../src/core/siege/run';

const seasons = Number(process.argv[2] ?? 4);

/** The walls a mazer builds: every other row, with a gap at alternate ends. */
const WALL_ROWS: number[][] = [2, 4, 6, 8, 10, 12].map((row, i) => {
  const gap = i % 2 ? 0 : W - 1;
  return Array.from({ length: W }, (_, k) => k).filter((k) => k !== gap).map((k) => cellAt(row, k));
});
const WALLS = WALL_ROWS.flat();
/** Beside the straight way down, for a garden with no maze. */
const BESIDE: number[] = [];
for (let r = 1; r < H - 1; r++) BESIDE.push(cellAt(r, SIEGE.entryCol - 1), cellAt(r, SIEGE.entryCol + 1));

const air = airRoute();
const airPts: Pt[] = Array.from({ length: 40 }, (_, i) => pointAt(air, (air.len * i) / 39));

/** How much of the pests' way a defender of this kind on `cell` would reach. */
function coverage(s: SiegeState, kind: DefenderId, cell: number, level = 0): number {
  const def = DEFENDERS[kind], r = def.levels[level]!.range, at = centre(cell);
  let n = 0;
  for (const c of walkNow(s)) { const p = centre(c); if (Math.hypot(p.x - at.x, p.y - at.y) <= r) n++; }
  if (def.air !== 'no') for (const p of airPts) if (Math.hypot(p.x - at.x, p.y - at.y) <= r) n += def.air === 'double' ? 0.6 : 0.3;
  return n;
}

const act = (s: SiegeState, a: SiegeAction) => { const r = actSiege(s, a); return r.ok ? r.state : s; };

/** The elements a wave calls for. */
function elementsFor(s: SiegeState, wave: number): Element[] {
  const kinds = (WAVES[wave - 1] ?? []).map((g) => g.kind);
  // Each season starts from a different element (LAB0 water, LAB1 earth, ...).
  const out: Element[] = [ELEMENT_IDS[Number(s.seed.slice(3)) % 4]!];
  if (kinds.some((k) => PESTS[k].flies) && !s.elements.some((e) => e === 'air' || e === 'sun')) out.push('air');
  if (kinds.some((k) => PESTS[k].armour >= 2 || k === 'greatSnail') && !s.elements.includes('earth')) out.push('earth');
  // Later, a third element, for hybrids.
  if (wave >= 12 && s.elements.length < 3) out.push(...ELEMENT_IDS.filter((e) => !s.elements.includes(e)).slice(0, 1));
  return [...new Set(out)];
}

/** Pieces that can harm a pest of the wave's toughest kinds: flyers, armour. */
function counters(s: SiegeState, wave: number): { need: DefenderId | null } {
  const kinds = (WAVES[wave - 1] ?? []).map((g) => g.kind);
  const count = (ok: (k: DefenderId) => boolean) => s.placed.filter((p) => ok(p.kind)).reduce((n, p) => n + 1 + p.level, 0);
  if (kinds.some((k) => PESTS[k].flies) && count((k) => DEFENDERS[k].air !== 'no') < 3 + wave / 2) {
    if (s.elements.includes('air')) return { need: 'thrush' };
    if (s.elements.includes('sun')) return { need: 'marigold' };
  }
  if (kinds.some((k) => PESTS[k].armour >= 2 || k === 'greatSnail') && count((k) => DEFENDERS[k].pierce) < 3 + wave / 2) {
    if (s.elements.includes('earth')) return { need: 'hedgehog' };
  }
  return { need: null };
}

/** The defender to grow for the maze in general: the element with the fewest. */
function wanted(s: SiegeState): DefenderId | null {
  const have = (k: DefenderId) => s.placed.filter((p) => DEFENDERS[p.kind].elements.includes(DEFENDERS[k].elements[0]!)).length;
  return s.elements.map((e) => ELEMENTS[e].defender).sort((a, b) => have(a) - have(b))[0] ?? null;
}

/** The bramble where a defender of this kind would reach the most of the way. */
function bestBramble(s: SiegeState, kind: DefenderId): number | null {
  let best: number | null = null, bestN = -1;
  for (const p of s.placed) {
    if (p.kind !== 'bramble') continue;
    const n = coverage(s, kind, p.cell);
    if (n > bestN) { bestN = n; best = p.id; }
  }
  return best;
}

function build(s: SiegeState, spots: readonly number[], grows: boolean): SiegeState {
  const maze = spots === WALLS;
  for (let guard = 0; guard < 400; guard++) {
    const price = unlockPrice(s);
    if (grows && price !== null) {
      // What the next wave needs, at once if there are coins for it.
      const now = elementsFor(s, s.wave).find((e) => !s.elements.includes(e));
      if (now && s.coins >= price) { s = act(s, { type: 'unlock', element: now }); continue; }
    }
    // Counters for the next wave's flyers and armour.
    const need = grows ? counters(s, s.wave).need : null;
    if (need) {
      if (s.coins < costOf(need)) break;
      const id = bestBramble(s, need);
      if (id !== null) { s = act(s, { type: 'grow', id, into: need }); continue; }
    }
    // Save up for what the wave after needs.
    const later = grows && price !== null && elementsFor(s, s.wave + 1).some((e) => !s.elements.includes(e)) ? price : 0;
    const spare = s.coins - later;
    const grown = s.placed.filter((p) => p.kind !== 'bramble').length;
    const walls = WALL_ROWS.filter((wall) => wall.every((c) => s.placed.some((p) => p.cell === c))).length;
    const want = grows ? wanted(s) : null;
    // The first wall first; then defenders keep pace with the maze: two for every wall built, and two more.
    const first = maze ? WALL_ROWS[0]!.find((c) => !s.placed.some((p) => p.cell === c)) : undefined;
    // Upgrade the defender that reaches the most, while it's cheaper than a new one.
    const up = s.placed.filter((p) => p.kind !== 'bramble' && p.level < maxLevel(p.kind) && spare >= costOf(p.kind, p.level + 1))
      .sort((a, b) => coverage(s, b.kind, b.cell, b.level) - coverage(s, a.kind, a.cell, a.level))[0];
    if (up && want && costOf(up.kind, up.level + 1) <= costOf(want) && grown >= 2 * (maze ? walls : 3)) { s = act(s, { type: 'upgrade', id: up.id }); continue; }
    if (want && first === undefined && grown < 2 * (maze ? walls : 3) + 2) {
      if (spare < costOf(want)) break;
      const id = bestBramble(s, want);
      if (id !== null) { s = act(s, { type: 'grow', id, into: want }); continue; }
    }
    const next = spots.find((c) => !s.placed.some((p) => p.cell === c) && !plantBlocker(s, c));
    if (next !== undefined) {
      if (spare < costOf('bramble')) break;
      s = act(s, { type: 'plant', cell: next });
      continue;
    }
    if (!grows) break;
    // The maze is whole: unlock more, hybrids from defenders at their best, more defenders, upgrades.
    if (price !== null && s.wave >= 14 && spare >= price + 10) {
      const e = ELEMENT_IDS.find((x) => !s.elements.includes(x));
      if (e) { s = act(s, { type: 'unlock', element: e }); continue; }
    }
    let done = false;
    for (const p of s.placed) {
      const g = growthsOf(s, p).find((x) => x.open && DEFENDERS[p.kind].tier === 1 && spare >= costOf(x.into));
      if (g) { s = act(s, { type: 'grow', id: p.id, into: g.into }); done = true; break; }
    }
    if (done) continue;
    const ups = s.placed.filter((p) => p.kind !== 'bramble' && p.level < maxLevel(p.kind) && spare >= costOf(p.kind, p.level + 1))
      .sort((a, b) => coverage(s, b.kind, b.cell, b.level) - coverage(s, a.kind, a.cell, a.level));
    if (ups.length) { s = act(s, { type: 'upgrade', id: ups[0]!.id }); continue; }
    if (want && spare >= costOf(want)) { const id = bestBramble(s, want); if (id !== null) { s = act(s, { type: 'grow', id, into: want }); continue; } }
    break;
  }
  return s;
}

export const BOTS: Record<string, (s: SiegeState) => SiegeState> = {
  Mazer: (s) => build(s, WALLS, true),
  Brambles: (s) => build(s, WALLS, false),
  Plain: (s) => build(s, BESIDE, true),
  Idle: (s) => s,
};

if (process.argv[1]?.endsWith('siege.ts')) {
  void ENTRY; void EXIT;
  for (const [name, bot] of Object.entries(BOTS)) {
    let won = 0, seedlings = 0, coins = 0;
    const lostAt: number[] = [];
    const t0 = performance.now();
    const eatenBy = new Array<number>(WAVES.length).fill(0);
    for (let i = 0; i < seasons; i++) {
      let s = newSiege(`LAB${i}`);
      while (s.phase === 'build') {
        s = bot(s);
        const r = actSiege(s, { type: 'wave' });
        if (r.record) eatenBy[r.record.wave - 1]! += r.record.eaten;
        s = r.state;
      }
      if (s.phase === 'won') { won++; seedlings += s.seedlings; coins += s.coins; } else lostAt.push(s.wave);
      if (process.argv.includes('-v')) console.log(`  ${name} ${s.seed}: starts ${s.elements[0] ?? '-'}, ${s.phase} at wave ${s.wave}, ${s.seedlings} seedlings, elements ${s.elements.join(' ')}`);
    }
    const ms = (performance.now() - t0) / seasons;
    console.log(`${name.padEnd(8)} won ${won}/${seasons}${won ? `, ${(seedlings / won).toFixed(1)} seedlings and ${(coins / won).toFixed(0)} coins left` : ''}`
      + `${lostAt.length ? `; lost at wave ${Math.min(...lostAt)}–${Math.max(...lostAt)} (mean ${(lostAt.reduce((a, b) => a + b, 0) / lostAt.length).toFixed(1)})` : ''}`
      + `; ${ms.toFixed(0)} ms a season`);
    console.log(`         eaten per wave: ${eatenBy.map((e) => (e / seasons).toFixed(1)).join(' ')}`);
  }
}
