/**
 * Balance report: every bot plays many full runs, then the targets from the design doc's
 * Verification table are checked. Run: npx tsx lab/runs.ts [runs per bot] [bots]
 */
import { RUN } from '../src/content/balance';
import { type BotName, BOTS, playRun } from './bots';
import { labSeeds } from './seeds';

const N = Number(process.argv[2] ?? 300);
const seeds = labSeeds(N);
const which = (process.argv[3]?.split(',') ?? BOTS) as BotName[];
const out: Record<string, { reqRate: number; bountyShare: number }> = {};
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

for (const bot of which) {
  const t0 = performance.now();
  let reqMet = 0, reqPosted = 0, bountyGold = 0, sealGold = 0, bounties = 0, ruined = 0, inkLeft = 0, score = 0, rounds = 0;
  const missByRound = new Array<number>(RUN.rounds + 1).fill(0), postedByRound = new Array<number>(RUN.rounds + 1).fill(0);
  for (const seed of seeds) {
    const { state } = playRun(seed, bot);
    for (const r of state.records) {
      rounds++;
      if (r.required !== null && r.round < RUN.rounds) {
        reqPosted++; postedByRound[r.round]!++;
        if (r.required) reqMet++; else missByRound[r.round]!++;
      }
      bountyGold += r.bountyGold; sealGold += r.sealGold; bounties += r.bounties;
    }
    if (state.phase === 'ruined') ruined++;
    else inkLeft += state.ink;
    score += state.gold + (state.phase === 'done' ? state.ink * RUN.inkBonus : 0);
  }
  const ms = (performance.now() - t0) / N;
  const gold = bountyGold + sealGold;
  out[bot] = { reqRate: reqMet / reqPosted, bountyShare: bountyGold / Math.max(1, gold) };
  console.log(`\n${bot.toUpperCase()}: ${N} runs, ${ms.toFixed(0)} ms per run`);
  console.log(`  required commissions met: ${pct(reqMet / reqPosted)} (rounds 1–${RUN.rounds - 1})`);
  console.log('  missed by round: ' + Array.from({ length: RUN.rounds - 1 }, (_, i) => i + 1).map((r) => `${r}:${postedByRound[r] ? Math.round((100 * missByRound[r]!) / postedByRound[r]!) : '-'}%`).join(' '));
  console.log(`  bounties met: ${(bounties / N).toFixed(1)} per run (${pct(bounties / (2 * rounds))} of those posted)`);
  console.log(`  gold per run: ${(gold / N).toFixed(1)} — bounties ${(bountyGold / N).toFixed(1)} (${pct(bountyGold / Math.max(1, gold))}), seals ${(sealGold / N).toFixed(1)}`);
  console.log(`  ruined: ${pct(ruined / N)}; ink left when finished: ${(inkLeft / Math.max(1, N - ruined)).toFixed(2)}; score ${(score / N).toFixed(1)}`);
}

const verdict = (ok: boolean) => (ok ? 'pass' : 'FAIL');
if (out.careful) {
  console.log(`\nTARGET Careful meets ≥95% of required: ${pct(out.careful.reqRate)} ${verdict(out.careful.reqRate >= 0.95)}`);
  console.log(`TARGET commissions, not seals, earn Careful most of its gold: ${pct(out.careful.bountyShare)} from bounties ${verdict(out.careful.bountyShare > 0.5)}`);
}
if (out.hasty) console.log(`TARGET Hasty misses ≥30% of required: ${pct(1 - out.hasty.reqRate)} ${verdict(1 - out.hasty.reqRate >= 0.3)}`);
