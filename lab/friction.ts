/**
 * Friction report: how often the week's requests fight a player who plants every number in a
 * right square. A solver plays each garden by planting all its numbers in right squares, choosing
 * among them at random, as a person would plant where they've worked a number out. At the start of
 * each week the posted requests are judged against many such layouts:
 *  - "required met by right play": the share of all-right layouts that meet the required request.
 *    The rest are weeks where planting what you've worked out costs water unless you move a right
 *    number to another right square.
 *  - "keeps a number out": requests that are broken by adding a right number (No 5 in row 2,
 *    Leave a plot empty, Row 3 adds to 10 or less, and so on): they stop you planting a number
 *    where you know it goes.
 * Run: npx tsx lab/friction.ts [runs per garden] [station ids…]
 * Run it after any change to how requests are posted; the design doc's Verification targets name it.
 */
import { isMet, viewOf, type Posted, sampleLayout, choices } from '../src/core/commission';
import { type StationId, stationById } from '../src/content/stations';
import { newProfile, setupFor } from '../src/core/meta';
import { stream } from '../src/core/rng';
import { type RunState, act, dealtThisRound, newRun, runPage, standardSetup, valuesOf } from '../src/core/run';
import { labSeeds } from './seeds';

const N = Number(process.argv[2] ?? 40);
const ids = process.argv.slice(3);
const SAMPLES = 120;

/** Kinds a right number can break: adding a number in its right square can stop them being met. */
export const KEEP_OUT = new Set(['line-max', 'no-number', 'zone', 'empty-cage', 'line-count-max', 'no-seal-line', 'equal-lines', 'rising', 'parity-line']);

interface Tally { weeks: number; reqMetNow: number; reqRate: number; reqFull: number; reqBad: number; keepOut: number; bounties: number; bountyRate: number; byKind: Map<string, { n: number; rate: number; keepOut: boolean }> }
const tally = (): Tally => ({ weeks: 0, reqMetNow: 0, reqRate: 0, reqFull: 0, reqBad: 0, keepOut: 0, bounties: 0, bountyRate: 0, byKind: new Map() });

/** The share of all-right layouts of the week's numbers (all of them, or all but one) that meet a request. */
function rightRate(s: RunState, p: Posted, everyChoice: boolean): number {
  const page = runPage(s);
  const kept = s.tokens.filter((t) => t.round < s.round).map((t) => t.n);
  const dealt = dealtThisRound(s).map((t) => t.n);
  const sets = everyChoice ? choices({ kept, dealt, need: s.need, rooted: s.rooted }) : [[...kept, ...dealt]];
  const rng = stream(s.seed, `friction:${s.round}`);
  let worst = 1;
  for (const set of sets) {
    let met = 0;
    for (let i = 0; i < SAMPLES; i++) if (isMet(p.c, viewOf(page, sampleLayout(page, set, rng, s.rooted ?? [])))) met++;
    worst = Math.min(worst, met / SAMPLES);
  }
  return worst;
}

/** Plants every number in hand in a right square, chosen at random. */
function plantRight(s: RunState, seed: string): RunState {
  const rng = stream(seed, `solver:${s.round}`);
  const page = runPage(s);
  for (const t of rng.shuffle(s.tokens.filter((x) => x.cell < 0))) {
    const free = page.stones.map((_, c) => c).filter((c) => !page.stones[c] && page.solution[c] === t.n && !s.tokens.some((o) => o.cell === c));
    if (free.length) s = act(s, { type: 'place', id: t.id, cell: rng.pick(free) }).state;
  }
  return s;
}

function report(label: string, setups: { seed: string; setup: ReturnType<typeof standardSetup> }[]) {
  const t = tally();
  for (const { seed, setup } of setups) {
    let s = newRun(seed, { setup, id: seed });
    while (s.phase === 'arrange') {
      if (s.round < s.setup.rounds && !s.setup.zen) {
        t.weeks++;
        for (const p of s.posted) {
          const rate = rightRate(s, p, false);
          const k = t.byKind.get(p.c.kind) ?? { n: 0, rate: 0, keepOut: KEEP_OUT.has(p.c.kind) };
          k.n++; k.rate += rate; t.byKind.set(p.c.kind, k);
          if (KEEP_OUT.has(p.c.kind)) t.keepOut++;
          if (p.required) {
            t.reqRate += rate;
            if (isMet(p.c, viewOf(runPage(s), valuesOf(s)))) t.reqMetNow++;
            if (rate >= 0.999) t.reqFull++;
            if (rate < 0.5) t.reqBad++;
          } else { t.bounties++; t.bountyRate += rate; }
        }
      }
      s = plantRight(s, seed);
      s = act({ ...s, ink: s.setup.startInk || 1 }, { type: 'ink' }).state;
    }
  }
  const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
  console.log(`\n${label}: ${setups.length} gardens, ${t.weeks} weeks before harvest`);
  console.log(`  required met by right play: mean ${pct(t.reqRate / t.weeks)}; every right layout ${pct(t.reqFull / t.weeks)} of weeks; under half ${pct(t.reqBad / t.weeks)} of weeks`);
  console.log(`  required already met when posted: ${pct(t.reqMetNow / t.weeks)} of weeks`);
  console.log(`  bonus requests met by right play: mean ${pct(t.bountyRate / Math.max(1, t.bounties))}`);
  console.log(`  requests that keep a number out: ${pct(t.keepOut / (t.weeks * 3))} of all posted`);
  const kinds = [...t.byKind].sort((a, b) => b[1].n - a[1].n);
  console.log(`  by kind (posted, met by right play):`);
  for (const [kind, k] of kinds) console.log(`    ${kind.padEnd(16)} ${String(k.n).padStart(4)}  ${pct(k.rate / k.n).padStart(4)}${k.keepOut ? '  keeps a number out' : ''}`);
  const mean = t.reqRate / t.weeks;
  console.log(`TARGET right play meets the required request in at least 90% of all-right layouts, on average: ${pct(mean)} ${mean >= 0.9 ? 'pass' : 'FAIL'}`);
  console.log(`TARGET no posted request keeps a number out: ${t.keepOut} ${t.keepOut === 0 ? 'pass' : 'FAIL'}`);
}

if (ids.length) {
  for (const id of ids) report(stationById(id)!.name, labSeeds(N, 300).map((seed) => ({ seed, setup: setupFor(newProfile(), id as StationId) })));
} else {
  report('6×6 Daily Garden', labSeeds(N, 300).map((seed) => ({ seed, setup: standardSetup(6) })));
  report('8×8 Daily Garden', labSeeds(Math.ceil(N / 2), 400).map((seed) => ({ seed, setup: standardSetup(8) })));
}
