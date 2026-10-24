/**
 * Species shifts: how much the Oracle's win rate moves when one species never appears in its
 * shop. The design target is that no species shifts it by more than 8 points.
 * Run: npx tsx lab/ablate.ts [runs per species] [workers]
 */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SPECIES } from '../src/content/species';
import { playRun } from './bots';
import { labSeeds } from './seeds';

const self = fileURLToPath(import.meta.url);

function winRate(seeds: string[], banned: string[]): number {
  let won = 0;
  for (const seed of seeds) if (playRun(seed, 'oracle', { banned }).phase === 'won') won++;
  return won / seeds.length;
}

if (process.argv[2] === '--worker') {
  // A worker measures the species it is handed and reports back.
  const n = Number(process.argv[3]);
  const seeds = labSeeds(n, 5000);
  process.on('message', (msg: { species: string | null }) => {
    const rate = winRate(seeds, msg.species ? [msg.species] : []);
    process.send!({ species: msg.species, rate });
  });
  process.send!({ ready: true });
} else {
  const n = Number(process.argv[2] ?? 200);
  const workers = Number(process.argv[3] ?? 2);
  const queue: (string | null)[] = [null, ...SPECIES.map((s) => s.id)];
  const results = new Map<string | null, number>();
  const t0 = performance.now();
  await new Promise<void>((done) => {
    let live = workers;
    for (let w = 0; w < workers; w++) {
      const child = fork(self, ['--worker', String(n)], { execArgv: ['--import', 'tsx'] });
      const next = () => { const sp = queue.shift(); if (sp === undefined) { child.kill(); if (--live === 0) done(); } else child.send({ species: sp }); };
      child.on('message', (m: { ready?: boolean; species?: string | null; rate?: number }) => {
        if (!m.ready) { results.set(m.species ?? null, m.rate!); process.stdout.write('.'); }
        next();
      });
    }
  });
  const base = results.get(null)!;
  console.log(`\nOracle baseline: ${(100 * base).toFixed(1)}% over ${n} runs (${((performance.now() - t0) / 60000).toFixed(1)} min)`);
  const rows = SPECIES.map((s) => ({ s, shift: base - results.get(s.id)! })).sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));
  for (const { s, shift } of rows) {
    const pts = 100 * shift;
    console.log(`  ${s.name.padEnd(16)} t${s.tier}  ${pts >= 0 ? '+' : ''}${pts.toFixed(1)} points${Math.abs(pts) > 8 ? '  <-- over 8' : ''}`);
  }
  const over = rows.filter((r) => Math.abs(r.shift) > 0.08);
  console.log(`TARGET no species shifts the Oracle's win rate by more than 8 points: ${over.length ? `FAIL (${over.map((r) => r.s.name).join(', ')})` : 'pass'}`);
  console.log('(A positive shift means the Oracle wins more often with the species than without it.)');
}
