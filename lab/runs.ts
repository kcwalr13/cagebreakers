/**
 * Balance report: every bot plays many full runs, then the targets from the design doc's
 * Verification table are checked. Run: npx tsx lab/runs.ts [runs per bot] [bots]
 * Species shifts are measured separately by lab/ablate.ts.
 */
import { SPECIES } from '../src/content/species';
import { CALLINGS, KINS } from '../src/content/traits';
import { PLAYER, tallyTraits } from '../src/core/clash';
import { type BotName, playRun } from './bots';
import { labSeeds } from './seeds';

const N = Number(process.argv[2] ?? 300);
const seeds = labSeeds(N);
const which = (process.argv[3]?.split(',') ?? ['random', 'greedy', 'planner', 'oracle']) as BotName[];
const results: Record<string, { win: number; reached: number }> = {};

for (const bot of which) {
  const t0 = performance.now();
  let won = 0, reachedSum = 0, lifeSum = 0;
  const deaths = new Array(16).fill(0);
  const winByClash = new Array(16).fill(0), foughtByClash = new Array(16).fill(0);
  const traitInWins = new Map<string, number>();
  const fielded = new Map<string, { runs: number; wins: number }>();
  for (const seed of seeds) {
    const s = playRun(seed, bot);
    const win = s.phase === 'won';
    if (win) won++;
    const reached = s.records.length;
    reachedSum += reached;
    if (s.phase === 'lost') deaths[reached]++;
    else lifeSum += s.life;
    for (const r of s.records) { foughtByClash[r.clash]++; if (r.winner === PLAYER) winByClash[r.clash]++; }
    const army = s.lastArmy;
    if (win) {
      const t = tallyTraits(army);
      for (const x of [...t.kins, ...t.callings]) if (x.level > 0) traitInWins.set(x.id, (traitInWins.get(x.id) ?? 0) + 1);
    }
    for (const sp of new Set(army.map((u) => u.species))) {
      const f = fielded.get(sp) ?? { runs: 0, wins: 0 };
      f.runs++; if (win) f.wins++;
      fielded.set(sp, f);
    }
  }
  const ms = (performance.now() - t0) / N;
  results[bot] = { win: won / N, reached: reachedSum / N };
  console.log(`\n${bot.toUpperCase()}: wins ${((100 * won) / N).toFixed(1)}% of ${N} runs, reaches clash ${(reachedSum / N).toFixed(1)} on average, ${ms.toFixed(0)} ms per run`);
  console.log('  clash win rate: ' + Array.from({ length: 15 }, (_, i) => i + 1).map((c) => `${c}:${foughtByClash[c] ? Math.round((100 * winByClash[c]) / foughtByClash[c]) : '-'}`).join(' '));
  console.log('  runs ended at:  ' + Array.from({ length: 15 }, (_, i) => i + 1).map((c) => `${c}:${deaths[c]}`).join(' '));
  if (won) console.log(`  average Life left on a win: ${(lifeSum / won).toFixed(1)}`);
  if (bot === 'oracle' && won) {
    const ids = [...Object.keys(KINS), ...Object.keys(CALLINGS)];
    console.log('  traits active in wins: ' + ids.map((id) => `${id} ${Math.round((100 * (traitInWins.get(id) ?? 0)) / won)}%`).join(', '));
    const rare = ids.filter((id) => (traitInWins.get(id) ?? 0) / won < 0.1);
    console.log(`  TARGET every Kin and Calling in 10% of Oracle wins: ${rare.length ? `FAIL (${rare.join(', ')})` : 'pass'}`);
    console.log('  species in the final army (share of runs, win rate when fielded):');
    const rows = SPECIES.map((sp) => ({ sp, f: fielded.get(sp.id) ?? { runs: 0, wins: 0 } })).sort((a, b) => b.f.runs - a.f.runs);
    for (const { sp, f } of rows) console.log(`    ${sp.name.padEnd(16)} t${sp.tier}  ${String(Math.round((100 * f.runs) / N)).padStart(3)}%  ${f.runs ? Math.round((100 * f.wins) / f.runs) : '-'}%`);
  }
}

if (results.oracle) {
  const w = results.oracle.win * 100;
  console.log(`\nTARGET Oracle wins 65–85% of runs: ${w.toFixed(1)}% ${w >= 65 && w <= 85 ? 'pass' : 'FAIL'}`);
}
if (results.greedy) {
  const r = results.greedy.reached;
  console.log(`TARGET Greedy averages clash 8–10: ${r.toFixed(1)} ${r >= 8 && r <= 10 ? 'pass' : 'FAIL'}`);
}
