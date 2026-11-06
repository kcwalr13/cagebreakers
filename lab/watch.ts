/**
 * Night Watch balance: two bots play whole seasons.
 *  - Careful works out every trail from the clues (as a player can), then plants and moves the
 *    fewest defenders that stop every pest, keeping the rest of its coins.
 *  - Reader works out every trail too, but plants new defenders on so-so squares beside the trail
 *    (the best of three it looks at) until its readout says every pest is stopped; it moves old
 *    ones only when they stand on the trail.
 *  - Guesser reads nothing: it plants defenders on squares that are usually busy (the middle of
 *    the garden) whenever it can afford one.
 * Run: npx tsx lab/watch.ts [seasons]
 */
import { DEFENDERS, DEFENDER_IDS, PESTS, WATCH } from '../src/content/watch';
import {
  type WatchState, actWatch, harmMap, newWatch, pestsOf, reachOf, watchBoard, watchScore,
} from '../src/core/watch/run';
import { TRAIL, deduce } from '../src/core/watch/trail';
import { createRng } from '../src/core/rng';

const N = Number(process.argv[2] ?? 200);
const b = watchBoard();

function careful(s: WatchState): WatchState {
  const ded = deduce(b, s.current.clues, 1);
  if (!ded.solved) throw new Error('unsolvable night');
  const trail = b.all.filter((c) => ded.marks[c] === TRAIL);
  const on = new Set(trail);
  const need = Math.max(...pestsOf(s.night).map((p) => PESTS[p].hp));
  const harmNow = () => trail.reduce((sum, c) => sum + harmMap(b, s.defenders.filter((d) => !on.has(d.cell)))[c]!, 0);
  for (let guard = 0; guard < 40 && harmNow() < need; guard++) {
    // The move or planting that adds the most harm on the trail per coin.
    let best: { gain: number; cost: number; act: Parameters<typeof actWatch>[1] } | null = null;
    const free = b.all.filter((c) => !on.has(c) && !s.defenders.some((d) => d.cell === c));
    const consider = (gain: number, cost: number, act: Parameters<typeof actWatch>[1]) => {
      if (gain <= 0 || cost > s.coins) return;
      const score = gain / Math.max(cost, 0.5);
      if (!best || score > best.gain / Math.max(best.cost, 0.5) + 1e-9) best = { gain, cost, act };
    };
    for (const kind of DEFENDER_IDS) {
      for (const c of free) {
        const gain = reachOf(b, kind, c).filter((x) => on.has(x)).length * DEFENDERS[kind].bite;
        consider(Math.min(gain, need - harmNow() + gain), DEFENDERS[kind].cost, { type: 'plant', kind, cell: c });
      }
    }
    for (const d of s.defenders) {
      const now = on.has(d.cell) ? 0 : reachOf(b, d.kind, d.cell).filter((x) => on.has(x)).length * DEFENDERS[d.kind].bite;
      const cost = d.night === s.night || d.moved === s.night ? 0 : WATCH.move;
      for (const c of free) {
        const gain = reachOf(b, d.kind, c).filter((x) => on.has(x)).length * DEFENDERS[d.kind].bite - now;
        consider(gain, cost, { type: 'move', id: d.id, cell: c });
      }
    }
    if (!best) break;
    const r = actWatch(s, (best as { act: Parameters<typeof actWatch>[1] }).act);
    if (!r.ok) break;
    s = r.state;
  }
  // Anything still on the trail gets moved off if it can be.
  for (const d of s.defenders) {
    if (!on.has(d.cell)) continue;
    const spot = b.all.find((c) => !on.has(c) && !s.defenders.some((x) => x.cell === c));
    if (spot !== undefined) { const r = actWatch(s, { type: 'move', id: d.id, cell: spot }); if (r.ok) s = r.state; }
  }
  return s;
}

function reader(s: WatchState, seed: string): WatchState {
  const rng = createRng(`${seed}:reader:${s.night}`);
  const ded = deduce(b, s.current.clues, 1);
  const trail = b.all.filter((c) => ded.marks[c] === TRAIL);
  const on = new Set(trail);
  const need = Math.max(...pestsOf(s.night).map((p) => PESTS[p].hp));
  const harmNow = () => trail.reduce((sum, c) => sum + harmMap(b, s.defenders.filter((d) => !on.has(d.cell)))[c]!, 0);
  const beside = b.all.filter((c) => !on.has(c) && b.orth[c]!.some((n) => on.has(n)));
  for (let guard = 0; guard < 20 && harmNow() < need; guard++) {
    const kind = rng.pick(DEFENDER_IDS);
    const spots = beside.filter((c) => !s.defenders.some((d) => d.cell === c));
    if (!spots.length || s.coins < DEFENDERS[kind].cost) break;
    // The best of three squares beside the trail it happens to look at.
    const looks = [rng.pick(spots), rng.pick(spots), rng.pick(spots)];
    const covers = (c: number) => reachOf(b, kind, c).filter((x) => on.has(x)).length;
    const cell = looks.reduce((p, q) => (covers(q) > covers(p) ? q : p));
    const r = actWatch(s, { type: 'plant', kind, cell });
    if (r.ok) s = r.state;
  }
  for (const d of s.defenders.filter((x) => on.has(x.cell))) {
    const spot = beside.find((c) => !s.defenders.some((x) => x.cell === c));
    if (spot !== undefined) { const r = actWatch(s, { type: 'move', id: d.id, cell: spot }); if (r.ok) s = r.state; }
  }
  return s;
}

function guesser(s: WatchState, seed: string): WatchState {
  const rng = createRng(`${seed}:${s.night}`);
  const middle = b.all.filter((c) => b.colOf(c) >= 1 && b.colOf(c) <= b.width - 2 && b.rowOf(c) >= 1 && b.rowOf(c) <= b.height - 2);
  for (let guard = 0; guard < 10; guard++) {
    const kind = rng.pick(DEFENDER_IDS);
    if (s.coins < DEFENDERS[kind].cost + 1) break;
    const r = actWatch(s, { type: 'plant', kind, cell: rng.pick(middle) });
    if (r.ok) s = r.state;
  }
  return s;
}

const BOTS = { CAREFUL: (s: WatchState) => careful(s), READER: reader, GUESSER: guesser };
for (const [name, bot] of Object.entries(BOTS)) {
  let lostRuns = 0, seedlings = 0, score = 0, coins = 0, cleanNights = 0, nights = 0, pests = 0, through = 0, trampled = 0;
  const lostByNight = new Array<number>(WATCH.nights).fill(0);
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const seed = `watch-lab-${i}`;
    let s = newWatch(seed);
    while (s.phase === 'plan') {
      s = bot(s, seed);
      const r = actWatch(s, { type: 'dusk' });
      s = r.state;
      const rec = r.night!;
      nights++;
      pests += rec.walks.length;
      through += rec.walks.filter((w) => w.stoppedAt === null).length;
      trampled += rec.trampled.length;
      lostByNight[rec.night - 1]! += rec.lost;
      if (rec.lost === 0) cleanNights++;
    }
    if (s.phase === 'lost') lostRuns++;
    seedlings += s.seedlings; coins += s.coins; score += watchScore(s).total;
  }
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  console.log(`\n${name}: ${N} seasons, ${((performance.now() - t0) / N).toFixed(0)} ms each`);
  console.log(`  seasons lost: ${pct(lostRuns / N)}; seedlings left ${(seedlings / N).toFixed(2)} of ${WATCH.seedlings}; coins left ${(coins / N).toFixed(1)}; score ${(score / N).toFixed(1)}`);
  console.log(`  pests through to the bed: ${pct(through / pests)}; nights with nothing through ${pct(cleanNights / nights)}; defenders trampled ${trampled}`);
  console.log(`  seedlings eaten by night: ${lostByNight.map((x, i) => `${i + 1}:${(x / N).toFixed(2)}`).join(' ')}`);
}
