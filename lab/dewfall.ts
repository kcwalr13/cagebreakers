/**
 * Dewfall's puzzle lab: makes puzzles of every chapter's and daily shape and reports how long that
 * takes, how many clues and hidden tallies they end with, how much reasoning they need, and checks
 * each one is solved by `deduce` to its own trail. Run: npx tsx lab/dewfall.ts [puzzles per shape]
 */
import { CHAPTERS, DAILY } from '../src/content/dewfall';
import { type PuzzleShape, deduce, puzzleOf } from '../src/core/dewfall/clues';
import { stream } from '../src/core/rng';

const n = Number(process.argv[2] ?? 20);
const shapes: [string, PuzzleShape][] = [...CHAPTERS.map((c) => [c.id, c.shape] as [string, PuzzleShape]), ...DAILY.map((d) => [`daily-${d.size}`, d.shape] as [string, PuzzleShape])];
let bad = 0;
for (const [name, shape] of shapes) {
  const ms: number[] = [], clues: number[] = [], hidden: number[] = [], effort: number[] = [], tries: number[] = [], glints: number[] = [], len: number[] = [];
  const kinds = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const p = puzzleOf(stream(`lab:${name}`, String(i)), shape);
    ms.push(performance.now() - t0);
    const d = deduce(p, shape.depth);
    const on = new Set(p.trail);
    if (!d.solved || p.trail.some((c) => d.marks[c] !== 1) || d.marks.some((m, c) => (m === 1) !== on.has(c))) { bad++; console.log('BAD', name, i); }
    clues.push(p.clues.filter((c) => c.kind !== 'glint').length);
    glints.push(p.clues.filter((c) => c.kind === 'glint').length);
    hidden.push([...p.rows, ...p.cols].filter((x) => x === null).length);
    effort.push(d.effort); tries.push(d.tries); len.push(p.trail.length);
    for (const c of p.clues) kinds.set(c.kind, (kinds.get(c.kind) ?? 0) + 1);
  }
  const avg = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1);
  const max = (xs: number[]) => Math.max(...xs).toFixed(0);
  console.log(`${name.padEnd(16)} ${shape.width}×${shape.height} ms ${avg(ms)} (max ${max(ms)})  trail ${avg(len)}  clues ${avg(clues)}  glints ${avg(glints)}  hidden ${avg(hidden)}/${shape.width + shape.height}  effort ${avg(effort)} (max ${max(effort)})  tries ${avg(tries)}  `
    + [...kinds].map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(' '));
}
if (bad) { console.log(`${bad} puzzles failed`); process.exit(1); }
console.log('Every puzzle is solved by rules to its own trail.');
