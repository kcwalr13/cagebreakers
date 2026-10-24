/**
 * Encounter lab: measures how a fixed fight plays for random versus thoughtful layouts of the
 * player's roster. Run: npx tsx lab/encounter.ts
 */
import { FIRST_BLOOD } from '../src/content/encounters';
import { ENEMY, PLAYER, type UnitSpec, simulateClash } from '../src/core/clash';
import { CELLS, SIZE, rowOf } from '../src/core/grid';
import { generatePage } from '../src/core/page';
import { boardValues, isLegal, sealedCages } from '../src/core/rules';
import { createRng } from '../src/core/rng';
import { speciesById } from '../src/content/species';

const enc = FIRST_BLOOD;
const playerPage = generatePage(enc.playerSeed);
const enemyPage = generatePage(enc.enemySeed);
const enemyUnits = enc.enemy;

function show(page: typeof playerPage, units: { cell: number; n: number }[] = []) {
  const placed = new Array(CELLS).fill(0);
  for (const u of units) placed[u.cell] = u.n;
  const vals = boardValues(page, placed);
  const rows: string[] = [];
  for (let r = 0; r < SIZE; r++) {
    rows.push(Array.from({ length: SIZE }, (_, c) => {
      const i = r * SIZE + c; const cage = page.cages[page.cageOf[i]!]!;
      const label = cage.cells[0] === i ? `${cage.target}${cage.op}` : '';
      return `${(page.stones[i] ? `[${vals[i]}]` : vals[i] ? ` ${vals[i]} ` : ' . ')}${label.padEnd(5)}`;
    }).join(' '));
  }
  return rows.join('\n');
}

console.log('PLAYER PAGE', enc.playerSeed, '\n' + show(playerPage));
console.log('solution', playerPage.solution.join(''));
console.log('\nENEMY PAGE', enc.enemySeed, '\n' + show(enemyPage, enemyUnits));
console.log('enemy sealed', [...sealedCages(enemyPage, boardValues(enemyPage, (() => { const p = new Array(CELLS).fill(0); for (const u of enemyUnits) p[u.cell] = u.n; return p; })()))].map((id) => `${enemyPage.cages[id]!.target}${enemyPage.cages[id]!.op}`));

function randomLayout(seed: string): UnitSpec[] {
  const rng = createRng(seed);
  const placed = new Array<number>(CELLS).fill(0);
  const out: UnitSpec[] = [];
  for (const u of rng.shuffle(enc.roster)) {
    const vals = boardValues(playerPage, placed);
    const options = Array.from({ length: CELLS }, (_, c) => c).filter((c) => !vals[c] && isLegal(playerPage, vals, c, u.n));
    if (!options.length) continue;
    const cell = rng.pick(options);
    placed[cell] = u.n;
    out.push({ ...u, cell });
  }
  return out;
}

let wins = 0, total = 0;
const bySeals = new Map<number, [number, number]>();
const byFront = new Map<string, [number, number]>();
let best: { units: UnitSpec[]; margin: number } | null = null;
for (let i = 0; i < 3000; i++) {
  const units = randomLayout(`L${i}`);
  const r = simulateClash({ page: playerPage, units }, { page: enemyPage, units: enemyUnits });
  const won = r.winner === PLAYER;
  wins += won ? 1 : 0; total++;
  const seals = r.sealedAtStart[PLAYER].length;
  const b = bySeals.get(seals) ?? [0, 0]; b[0] += won ? 1 : 0; b[1]++; bySeals.set(seals, b);
  const wardensFront = units.filter((u) => speciesById(u.species).calling === 'warden' && rowOf(u.cell) <= 1).length;
  const key = `wardens-front:${wardensFront}`;
  const f = byFront.get(key) ?? [0, 0]; f[0] += won ? 1 : 0; f[1]++; byFront.set(key, f);
  const alive = r.survivors.filter((s) => s.startsWith('p')).length - r.survivors.filter((s) => !s.startsWith('p')).length;
  if (!best || alive > best.margin) best = { units, margin: alive };
}
console.log(`\nrandom layouts: player wins ${((100 * wins) / total).toFixed(1)}% of ${total}`);
for (const [k, [w, n]] of [...bySeals].sort((a, b) => a[0] - b[0])) console.log(`  ${k} seals: ${((100 * w) / n).toFixed(0)}% (${n})`);
for (const [k, [w, n]] of [...byFront].sort()) console.log(`  ${k}: ${((100 * w) / n).toFixed(0)}% (${n})`);
if (best) {
  console.log('\nbest random layout\n' + show(playerPage, best.units));
  const r = simulateClash({ page: playerPage, units: best.units }, { page: enemyPage, units: enemyUnits });
  console.log('winner', r.winner === PLAYER ? 'player' : r.winner === ENEMY ? 'enemy' : 'draw', 'in', (r.beats / 10).toFixed(1), 's; sealed', r.sealedAtStart[PLAYER].length);
}

// A thoughtful layout: four front seals, Wardens in front, the Fletcher and Archivist behind.
const thoughtful: UnitSpec[] = [
  { uid: 'p-shellguard', species: 'shellguard', n: 1, stars: 1, cell: 2 },
  { uid: 'p-warren-guard', species: 'warren-guard', n: 3, stars: 1, cell: 4 },
  { uid: 'p-stag-reaper', species: 'stag-reaper', n: 5, stars: 1, cell: 5 },
  { uid: 'p-tusk-ram', species: 'tusk-ram', n: 4, stars: 1, cell: 8 },
  { uid: 'p-moss-tender', species: 'moss-tender', n: 2, stars: 1, cell: 9 },
  { uid: 'p-boar-smasher', species: 'boar-smasher', n: 6, stars: 1, cell: 11 },
  { uid: 'p-owl-archivist', species: 'owl-archivist', n: 4, stars: 1, cell: 16 },
  { uid: 'p-hare-fletcher', species: 'hare-fletcher', n: 5, stars: 1, cell: 22 },
];
const tr = simulateClash({ page: playerPage, units: thoughtful }, { page: enemyPage, units: enemyUnits });
console.log('\nthoughtful layout\n' + show(playerPage, thoughtful));
console.log('winner', tr.winner === PLAYER ? 'player' : tr.winner === ENEMY ? 'enemy' : 'draw', 'in', (tr.beats / 10).toFixed(1), 's; sealed', tr.sealedAtStart[PLAYER].length,
  'survivors', tr.survivors.join(' '));
for (const e of tr.events) if (e.type === 'shatter' || e.type === 'death' || e.type === 'reseal') console.log(`  ${(e.t / 10).toFixed(1)}s ${e.type} ${'uid' in e ? e.uid : `team${e.team} cage${e.cage} by ${e.by}`}`);
