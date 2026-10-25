/**
 * Star marks for map gardens: Careful's scores at each garden (fresh profile, no upgrades), and
 * the marks that would give a third star in about 25–30% of runs.
 * Run: npx tsx lab/calibrate.ts [runs] [station ids…]
 */
import { STATIONS, stationById } from '../src/content/stations';
import { newProfile, setupFor, starsFor } from '../src/core/meta';
import { scoreOf } from '../src/core/run';
import { playRun } from './bots';
import { labSeeds } from './seeds';

const N = Number(process.argv[2] ?? 80);
const ids = process.argv.slice(3);
const quant = (xs: number[], q: number) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0; };
for (const st of ids.length ? ids.map((id) => stationById(id)!) : STATIONS.filter((s) => !s.zen)) {
  const t = performance.now();
  const scores: number[] = [];
  let filled = 0, third = 0;
  for (const seed of labSeeds(N, 7000 + STATIONS.indexOf(st) * 1000)) {
    const { state } = playRun(seed, 'careful', setupFor(newProfile(), st.id));
    if (state.phase === 'done') { filled++; scores.push(scoreOf(state).total); }
    if (starsFor(st, state) === 3) third++;
  }
  console.log(`${st.id.padEnd(16)} filled ${filled}/${N} p40 ${quant(scores, 0.4)} p50 ${quant(scores, 0.5)} p70 ${quant(scores, 0.7)} p72 ${quant(scores, 0.72)} p90 ${quant(scores, 0.9)}  now ${st.stars.join('/')} third ${(100 * third / N).toFixed(0)}%  ${((performance.now() - t) / 1000).toFixed(0)}s`);
}
