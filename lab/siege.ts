/**
 * Garden Siege's balance lab: bots play whole seasons in each garden, and the report says how far
 * each gets and how many seedlings it keeps. Each garden plays four seasons, each starting from a
 * different element.
 *
 *   npx tsx lab/siege.ts [seasons] [-v] [--maps kitchen,warren] [--bots Mazer,Plain] [--economy]
 *
 *  - Mazer walls the garden with brambles across every other row, the gap at alternate ends, so pests
 *    walk back and forth; it unlocks what the next waves call for, grows the brambles that reach the
 *    most of the way into defenders, upgrades them, grows the best into hybrids, keeps two beehives
 *    and buys the Shed's improvements (cold frame, watering can, thorns) once it can spare the coins.
 *  - Brambles builds the same maze and grows nothing; Plain grows the same defenders beside the
 *    straight way down, with no maze; Idle plants nothing.
 *  - With --economy, Mazer's ways with coins are compared: no investing at all, Mazer's own, a greedy
 *    one (six hives first), and one leaning on each improvement in the Shed.
 */
import { DEFENDERS, type DefenderId, type Element, ELEMENTS, ELEMENT_IDS, PESTS, SHED_EFFECT, SHED_IDS, type ShedId, WAVES } from '../src/content/siege';
import { MAPS } from '../src/content/siege-maps';
import { type Field, type Pt, airRoute, fieldOf, pointAt, walksOf } from '../src/core/siege/field';
import {
  type SiegeAction, type SiegeState, actSiege, costOf, fieldNow, growthsOf, improvePrice, maxLevel, newSiege, plantBlocker, unlockPrice, walksNow,
} from '../src/core/siege/run';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const seasons = Number(args.find((a) => /^\d+$/.test(a)) ?? 4);
const verbose = args.includes('-v');

/**
 * The walls a mazer builds in a garden, as rows of tiles. It tries walls on every second row,
 * from a few starting rows, the first gap on either side, each gap at the first walkable tile from its
 * end, and (in a garden with rabbit holes) brambles round the holes; it plants each plan in order on an
 * empty garden, skipping tiles that would close the way, and keeps the plan whose way runs longest
 * beside its walls.
 */
const plans = new Map<string, number[][]>();
function wallsOf(f: Field): number[][] {
  let best = plans.get(f.map.id);
  if (best) return best;
  let bestLen = -1;
  const seal = f.holeTo.flatMap((to, c) => (to >= 0 ? f.nbrs[c]!.filter((n) => f.plantable(n)) : []));
  for (const start of [1, 2, 3]) for (const every of [2]) for (const side of [0, 1]) for (const sealed of seal.length ? [false, true] : [false]) {
    const walls: number[][] = [];
    for (let row = start, i = 0; row <= f.h - 3; row += every, i++) {
      const cols = Array.from({ length: f.w }, (_, k) => k);
      const ends = (i + side) % 2 ? cols : cols.slice().reverse();
      const gap = ends.find((k) => f.walkable(f.cellAt(row, k)))!;
      walls.push(cols.filter((k) => k !== gap).map((k) => f.cellAt(row, k)).filter((c) => f.plantable(c)));
      // The rabbit holes are sealed once the first wall stands.
      if (i === 0 && sealed) walls.push(seal);
    }
    const blocked = new Set<number>();
    const kept = walls.map((wall) => wall.filter((c) => { blocked.add(c); if (walksOf(f, blocked)) return true; blocked.delete(c); return false; }));
    // A long way counts, but most of all the stretches of it running beside the walls, where defenders reach.
    const ways = walksOf(f, blocked)!;
    const len = ways.reduce((n, w) => n + w.length * 0.3 + w.filter((c) => f.nbrs[c]!.some((x) => blocked.has(x))).length, 0) - blocked.size * 0.05;
    if (len > bestLen) { bestLen = len; best = kept.filter((w) => w.length); }
  }
  plans.set(f.map.id, best!);
  return best!;
}

/** Tiles beside each gap's straight way down, for a garden with no maze. */
function besideOf(f: Field): number[] {
  const walks = walksOf(f, new Set())!;
  const on = new Set(walks.flat());
  const out = new Set<number>();
  for (const c of on) for (const n of f.nbrs[c]!) if (!on.has(n) && f.plantable(n)) out.add(n);
  return [...out].sort((a, b) => a - b);
}

const airPts = new Map<string, Pt[]>();
function airOf(f: Field): Pt[] {
  let pts = airPts.get(f.map.id);
  if (!pts) {
    pts = f.entries.flatMap((_, e) => { const r = airRoute(f, e); return Array.from({ length: 30 }, (_, i) => pointAt(r, (r.len * i) / 29)); });
    airPts.set(f.map.id, pts);
  }
  return pts;
}

/** How much of the pests' ways a defender of this kind on `cell` would reach. */
function coverage(s: SiegeState, kind: DefenderId, cell: number, level = 0): number {
  const f = fieldNow(s);
  const def = DEFENDERS[kind], r = def.levels[level]!.range + (f.terrain[cell] === 'rich' ? 0.8 : 0), at = f.mids[cell]!;
  let n = 0;
  for (const walk of walksNow(s)) for (const c of walk) { const p = f.mids[c]!; if (Math.hypot(p.x - at.x, p.y - at.y) <= r) n++; }
  if (def.air !== 'no') {
    // Flight lines already watched count for less, so a garden with two gaps gets both lines covered.
    const watchers = s.placed.filter((p) => p.cell !== cell && p.kind !== 'bramble' && DEFENDERS[p.kind].air !== 'no' && DEFENDERS[p.kind].levels[p.level]!.damage > 0)
      .map((p) => ({ at: f.mids[p.cell]!, r: DEFENDERS[p.kind].levels[p.level]!.range }));
    for (const p of airOf(f)) {
      if (Math.hypot(p.x - at.x, p.y - at.y) > r) continue;
      const watched = watchers.filter((w) => Math.hypot(p.x - w.at.x, p.y - w.at.y) <= w.r).length;
      n += (def.air === 'double' ? 0.6 : 0.3) / (1 + watched);
    }
  }
  return n;
}

const act = (s: SiegeState, a: SiegeAction) => { const r = actSiege(s, a); return r.ok ? r.state : s; };

function elementsFor(s: SiegeState, wave: number): Element[] {
  const kinds = (WAVES[wave - 1] ?? []).map((g) => g.kind);
  // Each season starts from a different element (LAB0 water, LAB1 earth, ...).
  const out: Element[] = [ELEMENT_IDS[Number(s.seed.slice(3)) % 4]!];
  if (kinds.some((k) => PESTS[k].flies) && !s.elements.some((e) => e === 'air' || e === 'sun')) out.push('air');
  if (kinds.some((k) => PESTS[k].armour >= 2 || k === 'greatSnail') && !s.elements.includes('earth')) out.push('earth');
  if (wave >= 12 && s.elements.length < 3) out.push(...ELEMENT_IDS.filter((e) => !s.elements.includes(e)).slice(0, 1));
  return [...new Set(out)];
}

function counters(s: SiegeState, wave: number): DefenderId | null {
  const kinds = (WAVES[wave - 1] ?? []).map((g) => g.kind);
  const count = (ok: (k: DefenderId) => boolean) => s.placed.filter((p) => ok(p.kind) && DEFENDERS[p.kind].levels[p.level]!.damage > 0).reduce((n, p) => n + 1 + p.level, 0);
  if (kinds.some((k) => PESTS[k].flies) && count((k) => DEFENDERS[k].air !== 'no' && k !== 'bramble') < 3 + wave / 2) {
    if (s.elements.includes('air')) return 'thrush';
    if (s.elements.includes('sun')) return 'marigold';
  }
  if (kinds.some((k) => PESTS[k].armour >= 2 || k === 'greatSnail') && count((k) => DEFENDERS[k].pierce) < 3 + wave / 2) {
    if (s.elements.includes('earth')) return 'hedgehog';
  }
  return null;
}

function wanted(s: SiegeState): DefenderId | null {
  const have = (k: DefenderId) => s.placed.filter((p) => DEFENDERS[p.kind].elements.includes(DEFENDERS[k].elements[0]!)).length;
  return s.elements.map((e) => ELEMENTS[e].defender).sort((a, b) => have(a) - have(b))[0] ?? null;
}

function bestBramble(s: SiegeState, kind: DefenderId, worst = false): number | null {
  let best: number | null = null, bestN = worst ? Infinity : -1;
  for (const p of s.placed) {
    if (p.kind !== 'bramble') continue;
    const n = coverage(s, kind, p.cell);
    if (worst ? n < bestN : n > bestN) { bestN = n; best = p.id; }
  }
  return best;
}

/**
 * How a bot treats coins: beehives to keep, the improvements it buys and in what order and from when,
 * and from which wave (if any) it banks enough coins to earn the most interest.
 */
interface Economy { hives: number; hivesBy: number; shed: ShedId[]; shedFrom: number; reserve: number; saveFrom?: number }
const ECONOMIES: Record<string, Economy> = {
  none: { hives: 0, hivesBy: 99, shed: [], shedFrom: 99, reserve: 0 },
  mazer: { hives: 2, hivesBy: 3, shed: ['frame', 'can', 'thorns', 'frame', 'can', 'can'], shedFrom: 6, reserve: 25 },
  greedy: { hives: 6, hivesBy: 2, shed: ['compost', 'compost', 'compost'], shedFrom: 2, reserve: 0 },
  compost: { hives: 0, hivesBy: 99, shed: ['compost', 'compost', 'compost'], shedFrom: 3, reserve: 0 },
  thorns: { hives: 0, hivesBy: 99, shed: ['thorns', 'thorns', 'thorns'], shedFrom: 4, reserve: 0 },
  frame: { hives: 0, hivesBy: 99, shed: ['frame', 'frame', 'frame'], shedFrom: 4, reserve: 0 },
  'saver@5': { hives: 0, hivesBy: 99, shed: ['compost', 'compost', 'compost'], shedFrom: 4, reserve: 0, saveFrom: 5 },
  'saver@11': { hives: 2, hivesBy: 3, shed: ['compost', 'compost', 'can'], shedFrom: 8, reserve: 0, saveFrom: 11 },
  'saver@15': { hives: 2, hivesBy: 3, shed: ['can', 'compost', 'compost'], shedFrom: 8, reserve: 0, saveFrom: 15 },
  can: { hives: 0, hivesBy: 99, shed: ['can', 'can', 'can'], shedFrom: 6, reserve: 0 },
  hives: { hives: 3, hivesBy: 3, shed: [], shedFrom: 99, reserve: 0 },
};

function build(s: SiegeState, kind: 'maze' | 'plain' | 'brambles', eco: Economy): SiegeState {
  const f = fieldNow(s);
  const walls = wallsOf(f);
  const spots = kind === 'plain' ? besideOf(f) : walls.flat();
  const grows = kind !== 'brambles';
  for (let guard = 0; guard < 600; guard++) {
    const price = unlockPrice(s);
    if (grows && price !== null) {
      const now = elementsFor(s, s.wave).find((e) => !s.elements.includes(e));
      if (now && s.coins >= price) { s = act(s, { type: 'unlock', element: now }); continue; }
    }
    const need = grows ? counters(s, s.wave) : null;
    if (need) {
      if (s.coins < costOf(need, 0, s)) break;
      const id = bestBramble(s, need);
      if (id !== null) { s = act(s, { type: 'grow', id, into: need }); continue; }
    }
    // Beehives, on the brambles reaching least of the way, by the wave the bot means to have them.
    const hives = s.placed.filter((p) => p.kind === 'hive').length;
    if (hives < eco.hives && s.wave >= eco.hivesBy && s.coins >= costOf('hive', 0, s)) {
      const id = bestBramble(s, 'frog', true);
      if (id !== null) { s = act(s, { type: 'grow', id, into: 'hive' }); continue; }
    }
    const later = grows && price !== null && elementsFor(s, s.wave + 1).some((e) => !s.elements.includes(e)) ? price : 0;
    // A saver keeps back the coins that earn the most interest.
    const bank = eco.saveFrom !== undefined && s.wave >= eco.saveFrom ? SHED_EFFECT.interestCap[s.shed.compost]! / SHED_EFFECT.interest[s.shed.compost]! : 0;
    const spare = s.coins - later - bank;
    // The Shed, in the bot's order, once it can spare the coins.
    const bought = SHED_IDS.reduce((n, id) => n + s.shed[id], 0);
    const item = eco.shed[bought];
    if (item && s.wave >= eco.shedFrom) {
      const cost = improvePrice(s, item);
      if (cost !== null && spare >= cost + eco.reserve) { s = act(s, { type: 'improve', item }); continue; }
    }
    const grown = s.placed.filter((p) => p.kind !== 'bramble' && p.kind !== 'hive').length;
    const built = walls.filter((wall) => wall.every((c) => s.placed.some((p) => p.cell === c))).length;
    const want = grows ? wanted(s) : null;
    const first = kind === 'maze' ? walls[0]!.find((c) => !s.placed.some((p) => p.cell === c) && !plantBlocker(s, c)) : undefined;
    const up = s.placed.filter((p) => p.kind !== 'bramble' && p.kind !== 'hive' && p.level < maxLevel(p.kind) && spare >= costOf(p.kind, p.level + 1, s))
      .sort((a, b) => coverage(s, b.kind, b.cell, b.level) - coverage(s, a.kind, a.cell, a.level))[0];
    const pace = 2 * (kind === 'maze' ? built : 3);
    if (up && want && costOf(up.kind, up.level + 1, s) <= costOf(want, 0, s) && grown >= pace) { s = act(s, { type: 'upgrade', id: up.id }); continue; }
    if (want && first === undefined && grown < pace + 2) {
      if (spare < costOf(want, 0, s)) break;
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
    if (price !== null && s.wave >= 14 && spare >= price + 10) {
      const e = ELEMENT_IDS.find((x) => !s.elements.includes(x));
      if (e) { s = act(s, { type: 'unlock', element: e }); continue; }
    }
    let done = false;
    for (const p of s.placed) {
      const g = growthsOf(s, p).find((x) => x.open && DEFENDERS[p.kind].tier === 1 && spare >= costOf(x.into, 0, s));
      if (g) { s = act(s, { type: 'grow', id: p.id, into: g.into }); done = true; break; }
    }
    if (done) continue;
    const ups = s.placed.filter((p) => p.kind !== 'bramble' && p.level < maxLevel(p.kind) && spare >= costOf(p.kind, p.level + 1, s))
      .sort((a, b) => (a.kind === 'hive' ? 1 : 0) - (b.kind === 'hive' ? 1 : 0) || coverage(s, b.kind, b.cell, b.level) - coverage(s, a.kind, a.cell, a.level));
    if (ups.length) { s = act(s, { type: 'upgrade', id: ups[0]!.id }); continue; }
    if (want && spare >= costOf(want, 0, s)) { const id = bestBramble(s, want); if (id !== null) { s = act(s, { type: 'grow', id, into: want }); continue; } }
    break;
  }
  return s;
}

export const BOTS: Record<string, (s: SiegeState) => SiegeState> = {
  Mazer: (s) => build(s, 'maze', ECONOMIES.mazer!),
  Brambles: (s) => build(s, 'brambles', ECONOMIES.none!),
  Plain: (s) => build(s, 'plain', ECONOMIES.none!),
  Idle: (s) => s,
};

function play(map: string, bot: (s: SiegeState) => SiegeState, i: number): SiegeState {
  let s = newSiege(`LAB${i}`, `LAB${i}`, map);
  while (s.phase === 'build') {
    s = bot(s);
    s = actSiege(s, { type: 'wave' }).state;
  }
  return s;
}

function report(label: string, results: SiegeState[]) {
  const won = results.filter((s) => s.phase === 'won');
  const lost = results.filter((s) => s.phase === 'lost').map((s) => s.wave);
  const honey = results.reduce((n, s) => n + s.records.reduce((m, r) => m + r.honey, 0), 0) / results.length;
  const interest = results.reduce((n, s) => n + s.records.reduce((m, r) => m + r.interest, 0), 0) / results.length;
  const score = results.reduce((n, s) => n + Math.max(0, s.seedlings) * 10 + s.coins, 0) / results.length;
  console.log(`  ${label.padEnd(18)} won ${won.length}/${results.length}${won.length ? `, ${(won.reduce((n, s) => n + s.seedlings, 0) / won.length).toFixed(1)} seedlings left` : ''}, score ${score.toFixed(0)}`
    + `${lost.length ? `; lost at ${lost.join(', ')}` : ''}; honey ${honey.toFixed(0)}, interest ${interest.toFixed(0)}`
    + (verbose ? `  [${results.map((s) => `${s.elements[0] ?? '-'}:${s.phase === 'won' ? s.seedlings : `w${s.wave}`}`).join(' ')}]` : ''));
}

if (process.argv[1]?.endsWith('siege.ts')) {
  const maps = flag('--maps')?.split(',') ?? MAPS.map((m) => m.id);
  const bots = flag('--bots')?.split(',') ?? Object.keys(BOTS);
  for (const id of maps) {
    const m = MAPS.find((x) => x.id === id)!;
    const f = fieldOf(m);
    console.log(`${m.name} (${m.shape}, ${f.w}×${f.h}, strength ${m.strength}, way ${walksOf(f, new Set())!.map((w) => w.length).join('/')}):`);
    const t0 = performance.now();
    if (args.includes('--economy')) {
      for (const [name, eco] of Object.entries(ECONOMIES)) report(`Mazer, ${name}`, Array.from({ length: seasons }, (_, i) => play(id, (s) => build(s, 'maze', eco), i)));
    } else {
      for (const name of bots) report(name, Array.from({ length: seasons }, (_, i) => play(id, BOTS[name]!, i)));
    }
    console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  }
}
