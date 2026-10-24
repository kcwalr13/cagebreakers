import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SPECIES } from '../content/species';
import { ENEMY, PLAYER, type Side, type UnitSpec, simulateClash } from './clash';
import { CELLS, SIZE, cellAt } from './grid';
import { type Page, generatePage } from './page';
import { SEED_ALPHABET } from './seed';

/** Units on chosen cells, numbered from the hidden solution so the Latin rule always holds. */
function army(page: Page, cells: number[], species: string[], prefix: string, stars: 1 | 2 | 3 = 1): UnitSpec[] {
  return cells.filter((c) => !page.stones[c]).map((cell, i) => ({
    uid: `${prefix}${i}`, species: species[i % species.length]!, n: page.solution[cell]!, stars, cell,
  }));
}

/** Every open cell of the given cages. */
const cagesCells = (page: Page, ids: number[]) => ids.flatMap((id) => page.cages[id]!.cells).filter((c) => !page.stones[c]);
const ALL = SPECIES.map((s) => s.id);

describe('simulateClash', () => {
  const pageA = generatePage('CLASH2');
  const pageB = generatePage('CLASH3');
  const player: Side = { page: pageA, units: army(pageA, cagesCells(pageA, [0, 1, 2, 3]), ALL, 'p') };
  const enemy: Side = { page: pageB, units: army(pageB, cagesCells(pageB, [0, 1, 2, 3]), ALL.slice().reverse(), 'e') };

  it('is a pure function of its input', () => {
    expect(simulateClash(player, enemy)).toEqual(simulateClash(player, enemy));
  });

  it('always ends within 45 seconds with a winner or a draw', () => {
    const r = simulateClash(player, enemy);
    expect(r.beats).toBeGreaterThan(0);
    expect(r.beats).toBeLessThanOrEqual(450);
    expect(r.events.at(-1)).toMatchObject({ type: 'end', winner: r.winner });
    expect([PLAYER, ENEMY, 'draw']).toContain(r.winner);
  });

  it('seals cages filled to their targets, and the seal shows in the stats', () => {
    const r = simulateClash(player, enemy);
    expect(r.sealedAtStart[PLAYER].length).toBeGreaterThan(0);
    const sumCage = pageA.cages.find((c) => r.sealedAtStart[PLAYER].includes(c.id) && c.op === '+');
    if (sumCage) {
      const inside = r.fighters.find((f) => f.team === PLAYER && f.cage === sumCage.id)!;
      const unsealed = simulateClash({ page: pageA, units: [player.units.find((u) => u.uid === inside.uid)!] }, enemy);
      expect(inside.maxHp).toBeGreaterThan(unsealed.fighters[0]!.maxHp);
    }
  });

  it('shatters a sealed cage the moment one of its members dies', () => {
    const r = simulateClash(player, enemy);
    for (const death of r.events.filter((e) => e.type === 'death')) {
      const f = r.fighters.find((x) => x.uid === death.uid)!;
      if (!f.sealed) continue;
      const shattered = r.events.some((e) => e.type === 'shatter' && e.team === f.team && e.cage === f.cage && e.t <= death.t);
      expect(shattered).toBe(true);
    }
  });

  it('never lets a fallen unit act', () => {
    const r = simulateClash(player, enemy);
    const diedAt = new Map(r.events.filter((e) => e.type === 'death').map((e) => [e.uid, e.t]));
    for (const e of r.events) {
      if (e.type !== 'attack' && e.type !== 'cast') continue;
      const d = diedAt.get(e.src);
      if (d !== undefined) expect(e.t).toBeLessThanOrEqual(d);
    }
  });

  it('sends Marksmen at the back of the column and Lancers through to the unit behind', () => {
    const page = generatePage('LINEUP');
    const col = 2;
    const open = Array.from({ length: SIZE }, (_, r) => cellAt(r, col)).filter((c) => !page.stones[c]);
    const front = open[0]!, back = open[open.length - 1]!, mid = open[1]!;
    const enemyUnits: UnitSpec[] = [front, mid, back].map((cell, i) => ({ uid: `e${i}`, species: 'shellguard', n: page.solution[cell]!, stars: 3, cell }));
    const shooter: UnitSpec = { uid: 'm', species: 'antler-archer', n: page.solution[cellAt(0, col)]! || 1, stars: 1, cell: cellAt(0, col) };
    const pageP = { ...page, stones: new Array(CELLS).fill(0) };
    const r1 = simulateClash({ page: pageP, units: [shooter] }, { page, units: enemyUnits });
    const firstShot = r1.events.find((e) => e.type === 'attack' && e.src === 'm');
    expect(firstShot).toMatchObject({ src: 'm', dst: 'e2' });

    const lancer: UnitSpec = { ...shooter, uid: 'l', species: 'tusk-ram' };
    const r2 = simulateClash({ page: pageP, units: [lancer] }, { page, units: enemyUnits });
    const firstAttack = r2.events.findIndex((e) => e.type === 'attack' && e.src === 'l');
    expect(r2.events[firstAttack]).toMatchObject({ dst: 'e0' });
    expect(r2.events.slice(firstAttack).find((e) => e.type === 'damage' && e.kind === 'pierce' && e.src === 'l')).toMatchObject({ dst: 'e1' });
  });

  it('lets two Breakers shatter the first sealed cage they hit', () => {
    const page = generatePage('BREAKS');
    const sealedCage = page.cages.find((c) => c.cells.length === 2)!;
    const defenders = army(page, sealedCage.cells, ['shellguard'], 'd', 3);
    const breakers: UnitSpec[] = [
      { uid: 'b0', species: 'boar-smasher', n: 1, stars: 1, cell: cellAt(0, 0) },
      { uid: 'b1', species: 'coil-unmaker', n: 2, stars: 1, cell: cellAt(0, 1) },
    ];
    const blank = { ...page, stones: new Array(CELLS).fill(0) };
    const r = simulateClash({ page: blank, units: breakers }, { page, units: defenders });
    expect(r.sealedAtStart[ENEMY]).toContain(sealedCage.id);
    const shatter = r.events.find((e) => e.type === 'shatter');
    expect(shatter).toMatchObject({ team: ENEMY, cage: sealedCage.id });
    expect(['b0', 'b1']).toContain((shatter as { by: string }).by);
  });

  it('handles any armies built from legal placements', () => {
    const seedArb = fc.string({ unit: fc.constantFrom(...SEED_ALPHABET), minLength: 6, maxLength: 6 });
    fc.assert(fc.property(seedArb, seedArb, fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 12 }), (sa, sb, na, nb) => {
      const pa = generatePage(sa), pb = generatePage(sb);
      const pick = (p: Page, n: number) => Array.from({ length: CELLS }, (_, i) => i).filter((c) => !p.stones[c]).filter((_, i) => i % 3 === 0).slice(0, n);
      const r = simulateClash(
        { page: pa, units: army(pa, pick(pa, na), ALL, 'p') },
        { page: pb, units: army(pb, pick(pb, nb), ALL.slice(3), 'e') },
      );
      expect(r.events.at(-1)?.type).toBe('end');
      for (const e of r.events) if (e.type === 'damage') expect(e.amount).toBeGreaterThanOrEqual(0);
    }), { numRuns: 150 });
  });

  it('simulates a full 12-against-12 clash in a few milliseconds', () => {
    const big = (p: Page, prefix: string) => army(p, Array.from({ length: CELLS }, (_, i) => i).filter((c) => !p.stones[c]).slice(0, 12), ALL, prefix, 2);
    const a = { page: pageA, units: big(pageA, 'p') }, b = { page: pageB, units: big(pageB, 'e') };
    simulateClash(a, b);
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) simulateClash(a, b);
    expect((performance.now() - t0) / 50).toBeLessThan(10);
  });
});
