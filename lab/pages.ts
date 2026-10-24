/**
 * Page inspector: generates many pages and reports their shape, so generator changes can be
 * judged by numbers rather than by eye. Run: npm run lab -- [count]
 */
import { CELLS, SIZE } from '../src/core/grid';
import { generatePage } from '../src/core/page';
import { boardValues, combinationSets } from '../src/core/rules';
import { SEED_ALPHABET } from '../src/core/seed';

const count = Number(process.argv[2] ?? 2000);
const seeds = Array.from({ length: count }, (_, i) => {
  let s = '', n = i * 7919 + 13;
  for (let k = 0; k < 6; k++) { s += SEED_ALPHABET[n % SEED_ALPHABET.length]; n = Math.floor(n / SEED_ALPHABET.length) + k * 31; }
  return s;
});

const tally = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const sizes = new Map<string, number>(), ops = new Map<string, number>(), cageCounts = new Map<string, number>();
let comboTotal = 0, cagesTotal = 0, singleCombo = 0, ms = 0;

for (const seed of seeds) {
  const t = performance.now();
  const page = generatePage(seed);
  ms += performance.now() - t;
  tally(cageCounts, String(page.cages.length));
  const values = boardValues(page, new Array(CELLS).fill(0));
  for (const cage of page.cages) {
    tally(sizes, String(cage.cells.length));
    tally(ops, cage.op);
    const n = combinationSets(page, values, cage).length;
    comboTotal += n; cagesTotal++;
    if (n === 1) singleCombo++;
  }
}

const pct = (m: Map<string, number>, total: number) =>
  [...m.entries()].sort().map(([k, v]) => `${k}: ${((100 * v) / total).toFixed(1)}%`).join('  ');

console.log(`pages: ${count} (${SIZE}×${SIZE}), ${(ms / count).toFixed(2)} ms per page`);
console.log(`cages per page   ${pct(cageCounts, count)}`);
console.log(`cage sizes       ${pct(sizes, cagesTotal)}`);
console.log(`operations       ${pct(ops, cagesTotal)}`);
console.log(`combinations     ${(comboTotal / cagesTotal).toFixed(2)} sets per cage on an empty page; ${((100 * singleCombo) / cagesTotal).toFixed(1)}% have exactly one`);
