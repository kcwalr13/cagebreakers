/**
 * Balance report: every bot plays many full runs. Run: npx tsx lab/runs.ts [runs per bot]
 */
import { PLAYER } from '../src/core/clash';
import { SEED_ALPHABET } from '../src/core/seed';
import { type BotName, playRun } from './bots';

const N = Number(process.argv[2] ?? 300);
const seeds = Array.from({ length: N }, (_, i) => {
  let s = '', n = i * 104729 + 7;
  for (let k = 0; k < 6; k++) { s += SEED_ALPHABET[n % SEED_ALPHABET.length]; n = Math.floor(n / SEED_ALPHABET.length) + 17 * k; }
  return s;
});

const which = (process.argv[3]?.split(',') ?? ['random', 'greedy', 'planner', 'oracle']) as BotName[];
for (const bot of which) {
  const t0 = performance.now();
  let won = 0, reachedSum = 0, lifeSum = 0;
  const deaths = new Array(16).fill(0);
  const winByClash = new Array(16).fill(0), foughtByClash = new Array(16).fill(0);
  for (const seed of seeds) {
    const s = playRun(seed, bot);
    if (s.phase === 'won') won++;
    const reached = s.records.length;
    reachedSum += reached;
    if (s.phase === 'lost') deaths[reached]++;
    else lifeSum += s.life;
    for (const r of s.records) { foughtByClash[r.clash]++; if (r.winner === PLAYER) winByClash[r.clash]++; }
  }
  const ms = (performance.now() - t0) / N;
  console.log(`\n${bot.toUpperCase()}: wins ${((100 * won) / N).toFixed(1)}% of ${N} runs, reaches clash ${(reachedSum / N).toFixed(1)} on average, ${ms.toFixed(0)} ms per run`);
  console.log('  clash win rate: ' + Array.from({ length: 15 }, (_, i) => i + 1).map((c) => `${c}:${foughtByClash[c] ? Math.round((100 * winByClash[c]) / foughtByClash[c]) : '-'}`).join(' '));
  console.log('  runs ended at:  ' + Array.from({ length: 15 }, (_, i) => i + 1).map((c) => `${c}:${deaths[c]}`).join(' '));
  if (won) console.log(`  average Life left on a win: ${(lifeSum / won).toFixed(1)}`);
}
