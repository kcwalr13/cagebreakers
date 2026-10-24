import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ENEMY_CURVE, RUN } from '../content/balance';
import { speciesById } from '../content/species';
import { boardIsLatin } from './rules';
import { generateOpponent } from './opponent';
import {
  type RunAction, type RunState, act, claimCost, fittingNumbers, isClaimed, newRun, onBench, onBoard, pageOf, reach, values,
} from './run';
import { SEED_ALPHABET } from './seed';

const seedArb = fc.string({ unit: fc.constantFrom(...SEED_ALPHABET), minLength: 6, maxLength: 6 });

function started(seed: string): RunState {
  const s = newRun(seed);
  const cage = pageOf(seed).cages.find((c) => c.cells.length === 2)!;
  const r = act(s, { type: 'first-claim', cage: cage.id });
  expect(r.ok).toBe(true);
  return r.state;
}

describe('a run', () => {
  it('starts with a free claim of a two-cell cage', () => {
    const s = newRun('RUNSTA');
    const three = pageOf('RUNSTA').cages.find((c) => c.cells.length === 3)!;
    expect(act(s, { type: 'first-claim', cage: three.id }).ok).toBe(false);
    const st = started('RUNSTA');
    expect(st.phase).toBe('plan');
    expect(st.gold).toBe(RUN.startGold);
    expect(st.offers).toHaveLength(RUN.shopSize);
    expect(st.claimed).toHaveLength(1);
  });

  it('always offers at least one number that fits a cell you hold', () => {
    fc.assert(fc.property(seedArb, fc.nat(20), (seed, rerolls) => {
      let s = { ...started(seed), gold: 99 };
      for (let i = 0; i < rerolls; i++) s = act(s, { type: 'reroll' }).state;
      const fits = fittingNumbers(s);
      if (fits.length) expect(s.offers.some((o) => fits.includes(o.n))).toBe(true);
    }), { numRuns: 120 });
  });

  it('is deterministic: the same seed and actions give the same run', () => {
    const play = () => {
      let s = { ...started('SAMESD'), gold: 30 };
      for (const a of [{ type: 'reroll' }, { type: 'buy', offer: 0 }, { type: 'buy', offer: 1 }, { type: 'reroll' }] as RunAction[]) s = act(s, a).state;
      return s;
    };
    expect(play()).toEqual(play());
  });

  it('keeps units to claimed cages, the Latin rule and the army limit', () => {
    let s = { ...started('LIMITS'), gold: 50 };
    for (let i = 0; i < 4; i++) s = act(s, { type: 'buy', offer: i }).state;
    const page = pageOf(s.seed);
    const unclaimed = page.cageOf.findIndex((cage, c) => !s.claimed.includes(cage) && !page.stones[c]);
    const u = onBench(s)[0]!;
    expect(act(s, { type: 'place', uid: u.uid, cell: unclaimed }).reason).toMatch(/Claim this cage/);
    // Fill the army to its limit; one more is refused.
    for (const b of onBench(s)) {
      for (let c = 0; c < 36; c++) { const r = act(s, { type: 'place', uid: b.uid, cell: c }); if (r.ok && r.state !== s) { s = r.state; break; } }
    }
    expect(onBoard(s).length).toBeLessThanOrEqual(reach(s));
    expect(boardIsLatin(values(s))).toBe(true);
  });

  it('combines three copies into a two-star unit, keeping the chosen number', () => {
    const s0 = started('MERGES');
    const sp = s0.offers[0]!.species;
    const s = {
      ...s0, gold: 50,
      units: [
        { uid: 'a', species: sp, n: 1, stars: 1 as const, cell: -1 },
        { uid: 'b', species: sp, n: 5, stars: 1 as const, cell: -1 },
      ],
      offers: s0.offers.map((o, i) => (i === 0 ? { ...o, n: 3 } : o)),
    };
    const bought = act(s, { type: 'buy', offer: 0 });
    expect(bought.state.phase).toBe('merge');
    const merged = act(bought.state, { type: 'merge', keep: 'b' }).state;
    const unit = merged.units.find((u) => u.species === sp)!;
    expect(merged.units.filter((u) => u.species === sp)).toHaveLength(1);
    expect(unit).toMatchObject({ stars: 2, n: 5 });
    expect(merged.phase).toBe('plan');
  });

  it('charges more for each cage you already hold', () => {
    const s = started('CLAIMS');
    const page = pageOf(s.seed);
    const other = page.cages.find((c) => !s.claimed.includes(c.id))!;
    expect(claimCost(s, other.id)).toBe(other.cells.filter((c) => !page.stones[c]).length + 1);
  });

  it('fights, takes Life on a loss, and pays income for the next clash', () => {
    let s = { ...started('FIGHTS'), gold: 20 };
    const fits = fittingNumbers(s);
    s = act(s, { type: 'buy', offer: s.offers.findIndex((o) => fits.includes(o.n)) }).state;
    const u = onBench(s)[0]!;
    for (let c = 0; c < 36 && !onBoard(s).length; c++) { const r = act(s, { type: 'place', uid: u.uid, cell: c }); if (r.ok) s = r.state; }
    const before = s;
    const r = act(s, { type: 'clash' });
    expect(r.ok).toBe(true);
    expect(r.fought).toBeDefined();
    expect(r.state.records).toHaveLength(1);
    expect(r.state.life).toBe(before.life - r.fought!.record.lifeLost);
    if (r.state.phase === 'plan') {
      expect(r.state.clash).toBe(2);
      expect(r.state.gold).toBeGreaterThanOrEqual(before.gold + RUN.income);
    }
  });

  it('holds every invariant under random play', () => {
    const actionArb = fc.oneof(
      fc.record({ type: fc.constant('buy' as const), offer: fc.nat(3) }),
      fc.record({ type: fc.constant('reroll' as const) }),
      fc.record({ type: fc.constant('lock' as const) }),
      fc.record({ type: fc.constant('claim' as const), cage: fc.nat(13) }),
      fc.record({ type: fc.constant('place' as const), uid: fc.nat(30).map((n) => `u${n}`), cell: fc.integer({ min: -1, max: 35 }) }),
      fc.record({ type: fc.constant('sell' as const), uid: fc.nat(30).map((n) => `u${n}`) }),
      fc.record({ type: fc.constant('clash' as const) }),
    );
    fc.assert(fc.property(seedArb, fc.array(actionArb, { maxLength: 80 }), (seed, actions) => {
      let s = started(seed);
      let life = s.life;
      for (const a of actions) {
        if (s.phase === 'merge') s = act(s, { type: 'merge', keep: s.merge!.uids[0]! }).state;
        const r = act(s, a);
        if (!r.ok) expect(r.state).toBe(s);
        s = r.state;
        expect(s.gold).toBeGreaterThanOrEqual(0);
        expect(s.life).toBeLessThanOrEqual(life);
        life = s.life;
        expect(onBench(s).length).toBeLessThanOrEqual(RUN.benchSize + 1);
        expect(onBoard(s).length).toBeLessThanOrEqual(reach(s));
        for (const u of onBoard(s)) expect(isClaimed(s, u.cell)).toBe(true);
        expect(boardIsLatin(values(s))).toBe(true);
        if (s.phase === 'won' || s.phase === 'lost') break;
      }
    }), { numRuns: 60 });
  });
});

describe('opponents', () => {
  it('follow the enemy curve, obey the Latin rule and repeat for a seed', () => {
    for (let clash = 1; clash <= 15; clash++) {
      if (clash === 10) continue; // the Mirror Scribe copies the player
      const o = generateOpponent('CURVES', clash);
      expect(o).toEqual(generateOpponent('CURVES', clash));
      expect(o.units).toHaveLength(ENEMY_CURVE.units[clash - 1]!);
      const vals = o.page.stones.slice();
      for (const u of o.units) { expect(vals[u.cell]).toBe(0); vals[u.cell] = u.n; }
      expect(boardIsLatin(vals)).toBe(true);
      const spent = o.units.reduce((g, u) => g + speciesById(u.species).tier * 3 ** (u.stars - 1), 0);
      expect(spent).toBeLessThanOrEqual(Math.max(ENEMY_CURVE.gold[clash - 1]!, o.units.length));
    }
  });

  it('marks the Keepers with their twists', () => {
    expect(generateOpponent('KEEPER', 5).playerRules?.unsealedPenalty).toBeGreaterThan(0);
    expect(generateOpponent('KEEPER', 15).rules?.unshatterable).toBe(true);
    const mirror = generateOpponent('KEEPER', 10, { page: pageOf('KEEPER'), units: [{ uid: 'x', species: 'shellguard', n: 1, stars: 1, cell: 0 }] });
    expect(mirror.units[0]).toMatchObject({ uid: 'm-x', cell: 0 });
    expect(mirror.rules?.buff).toBeGreaterThan(0);
  });
});
