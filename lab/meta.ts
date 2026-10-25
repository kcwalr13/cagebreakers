/**
 * Scriptorium report: how each station plays for the bots, and how fast a player progresses.
 * Run: npx tsx lab/meta.ts [runs per station] [campaigns]
 */
import { ITEMS } from '../src/content/meta';
import { STATIONS } from '../src/content/stations';
import { NEW_PROFILE, type Profile, buy, cantBuy, recordRun, setupFor, starsFor, stationOpen } from '../src/core/meta';
import { scoreOf } from '../src/core/run';
import { type BotName, playRun } from './bots';
import { labSeeds } from './seeds';

const N = Number(process.argv[2] ?? 120);
const CAMPAIGNS = Number(process.argv[3] ?? 20);
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const quant = (xs: number[], q: number) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0; };

console.log('STATIONS (fresh profile, no upgrades)');
const thirdStar: number[] = [];
for (const st of STATIONS) {
  for (const bot of ['careful', 'tidy'] as BotName[]) {
    const scores: number[] = [];
    let filled = 0, stars = [0, 0, 0, 0];
    for (const seed of labSeeds(N, 7000 + STATIONS.indexOf(st) * 1000)) {
      const { state } = playRun(seed, bot, setupFor(NEW_PROFILE, st.id));
      if (state.phase === 'done') { filled++; scores.push(scoreOf(state).total); }
      stars[starsFor(st, state)]!++;
    }
    if (bot === 'careful') thirdStar.push(stars[3]! / N);
    console.log(`  ${st.name.padEnd(20)} ${bot.padEnd(8)} filled ${pct(filled / N).padStart(4)}  score median ${quant(scores, 0.5)} p75 ${quant(scores, 0.75)} p90 ${quant(scores, 0.9)}  stars 1/2/3: ${pct(stars[1]! / N)} ${pct(stars[2]! / N)} ${pct(stars[3]! / N)}  (marks ${st.stars.join('/')})`);
  }
}

// A Careful player's campaign: play the open station with the fewest stars, buy what's affordable.
console.log(`\nCAMPAIGNS (${CAMPAIGNS} Careful players)`);
const wishlist = ['quill', 'purse-1', 'gilder', 'eraser', 'purse-2', 'bounty-hunter', 'newsprint', 'deeper-inkwell', 'inkwell', 'second-strap', 'neon'] as const;
const firstRunToOwn: number[] = [], runsToAll: number[] = [], runsToAllStations: number[] = [];
const leafPerRun: number[] = [];
for (let c = 0; c < CAMPAIGNS; c++) {
  let p: Profile = { ...NEW_PROFILE };
  let ownAll = -1, allStations = -1;
  const seeds = labSeeds(120, 50_000 + c * 200);
  for (let run = 1; run <= seeds.length; run++) {
    const open = STATIONS.filter((st) => stationOpen(p, st));
    const st = open.slice().sort((a, b) => (p.stars[a.id] ?? 0) - (p.stars[b.id] ?? 0))[0]!;
    const { state } = playRun(seeds[run - 1]!, 'careful', setupFor(p, st.id));
    const before = p.leaf;
    p = recordRun(p, { ...state, id: `c${c}r${run}` }, `${run}`);
    leafPerRun.push(p.leaf - before);
    for (const id of wishlist) if (!cantBuy(p, ITEMS.find((i) => i.id === id)!)) p = buy(p, id).profile;
    if (p.owned.length >= 1 && firstRunToOwn.length <= c) firstRunToOwn.push(run);
    if (allStations < 0 && STATIONS.every((s2) => p.filled.includes(s2.id))) allStations = run;
    if (p.owned.length === ITEMS.length) { ownAll = run; break; }
  }
  runsToAll.push(ownAll);
  runsToAllStations.push(allStations);
}
console.log(`  leaf per run: median ${quant(leafPerRun, 0.5)}, p90 ${quant(leafPerRun, 0.9)}`);
console.log(`  first purchase after run ${quant(firstRunToOwn, 0.5)} (median)`);
console.log(`  every station filled after ${quant(runsToAllStations, 0.5)} runs (median)`);
console.log(`  everything owned after ${quant(runsToAll, 0.5)} runs (median; -1 = not within 120)`);
const lo = Math.min(...thirdStar), hi = Math.max(...thirdStar);
console.log(`\nTARGET Careful earns the third star in 15–40% of runs at every station: ${pct(lo)}–${pct(hi)} ${lo >= 0.15 && hi <= 0.4 ? 'pass' : 'FAIL'}`);
const target = quant(runsToAll, 0.5);
console.log(`TARGET a Careful player owns everything after 15–25 runs: ${target} ${target >= 15 && target <= 25 ? 'pass' : 'FAIL'}`);
