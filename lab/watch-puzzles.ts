/**
 * Night Watch puzzle report: draws trails and clue sets and says how long they take to make, how
 * many clues they keep, and how hard they are to reason out.
 * Run: npx tsx lab/watch-puzzles.ts [count]
 */
import { boardOf } from '../src/core/watch/board';
import { deduce, drawTrail, makeClues, type ClueOptions } from '../src/core/watch/trail';
import { createRng } from '../src/core/rng';

const N = Number(process.argv[2] ?? 100);
const b = boardOf(7, 8);
const show = (trail: number[], clues: ReturnType<typeof makeClues>) => {
  const on = new Set(trail);
  const dew = new Map(clues.dew.map((d) => [d.cell, d.n]));
  const lines: string[] = [];
  lines.push('   ' + clues.cols.map((x) => (x === null ? '?' : String(x))).join(' '));
  for (let r = 0; r < b.height; r++) {
    let s = '';
    for (let k = 0; k < b.width; k++) {
      const c = b.cellAt(r, k);
      s += (dew.has(c) ? String(dew.get(c)) : clues.glints.includes(c) ? '*' : c === clues.entry ? 'E' : c === clues.exit ? 'X' : on.has(c) ? '#' : '.') + ' ';
    }
    lines.push(`${clues.rows[r] === null ? '?' : clues.rows[r]}  ${s}`);
  }
  return lines.join('\n');
};

for (const [label, opts] of [
  ['all tallies', { hideTallies: 0, depth: 0, spareDew: 0 }],
  ['hide 5', { hideTallies: 5, depth: 0, spareDew: 0 }],
  ['hide 9', { hideTallies: 9, depth: 0, spareDew: 0 }],
  ['hide 15', { hideTallies: 15, depth: 0, spareDew: 0 }],
  ['hide 15 deep', { hideTallies: 15, depth: 1, spareDew: 0 }],
  ['hide all', { hideTallies: 99, depth: 0, spareDew: 0 }],
] as [string, ClueOptions][]) {
  const times: number[] = [], dews: number[] = [], lens: number[] = [], hid: number[] = [], glints: number[] = [], tries: number[] = [];
  let d0 = 0, fail = 0;
  for (let i = 0; i < N; i++) {
    const rng = createRng(`lab-${label}-${i}`);
    const t0 = performance.now();
    try {
      const trail = drawTrail(rng, b, 11, 18);
      const clues = makeClues(rng, b, trail, opts);
      times.push(performance.now() - t0);
      dews.push(clues.dew.length); lens.push(trail.length);
      hid.push(clues.rows.filter((x) => x === null).length + clues.cols.filter((x) => x === null).length);
      glints.push(clues.glints.length);
      if (deduce(b, clues, 0).solved) d0++;
      tries.push(deduce(b, clues, 1).tries);
      if (i === 0) console.log(`\n${label}:\n${show(trail, clues)}`);
    } catch (e) { fail++; }
  }
  const avg = (xs: number[]) => (xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length)).toFixed(1);
  const max = (xs: number[]) => Math.max(...xs).toFixed(0);
  console.log(`${label}: ${N} puzzles, ${fail} failed; ms avg ${avg(times)} max ${max(times)}; trail ${avg(lens)}; dew ${avg(dews)}; hidden tallies ${avg(hid)}; glints ${avg(glints)}; solved by rules alone ${d0}; tries ${avg(tries)}`);
}
