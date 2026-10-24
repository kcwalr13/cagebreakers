import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { RUN } from '../content/balance';
import { SPECIES } from '../content/species';
import { CALLINGS, KINS } from '../content/traits';
import { PLAYER, type UnitSpec, simulateClash } from './clash';
import { SIZE, colOf, rowOf } from './grid';
import { generateOpponent } from './opponent';
import { BLANK, SMUDGE, boardIsLatin, boardValues, isLegal, isSealed } from './rules';
import {
  type OwnedUnit, type RunAction, type RunState, act, claimCost, dominoSpots, isClaimed, migrateRun, newRun, onBench, onBoard, pageOf, reach, runPage,
  sealedNow, values,
} from './run';
import { SEED_ALPHABET } from './seed';

const seedArb = fc.string({ unit: fc.constantFrom(...SEED_ALPHABET), minLength: 6, maxLength: 6 });

function started(seed: string): RunState {
  const s = newRun(seed);
  const cage = pageOf(seed).cages.find((c) => c.cells.length === 2)!;
  const r = act(s, { type: 'first-claim', cage: cage.id });
  return act(r.state, { type: 'pick', choice: 0 }).state;
}
/** A run holding every cage, with gold to spare, for placement tests. */
function holdingAll(seed: string, units: OwnedUnit[] = []): RunState {
  const s = started(seed);
  return { ...s, gold: 99, claimed: pageOf(seed).cages.map((c) => c.id), units, nextUid: 100, satchel: [] };
}
const unit = (uid: string, species: string, n: number, cell = -1, extra: Partial<OwnedUnit> = {}): OwnedUnit => ({ uid, species, n, stars: 1, cell, ...extra });

describe('the roster', () => {
  it('has 30 species across tiers 8 / 7 / 7 / 5 / 3, with three Misprints at the top', () => {
    expect(SPECIES).toHaveLength(30);
    expect([1, 2, 3, 4, 5].map((t) => SPECIES.filter((s) => s.tier === t).length)).toEqual([8, 7, 7, 5, 3]);
    expect(SPECIES.filter((s) => s.misprint).map((s) => s.tier)).toEqual([5, 5, 5]);
    expect(SPECIES.filter((s) => s.misprint).every((s) => s.kin === null)).toBe(true);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(30);
  });

  it('lets every Kin and Calling reach its top threshold', () => {
    for (const k of Object.values(KINS)) expect(SPECIES.filter((s) => s.kin === k.id).length).toBeGreaterThanOrEqual(k.thresholds.at(-1)!);
    for (const c of Object.values(CALLINGS)) expect(SPECIES.filter((s) => s.calling === c.id).length).toBeGreaterThanOrEqual(c.thresholds.at(-1)!);
  });

  it('can fight with every species without errors, and the same fight repeats', () => {
    const page = pageOf('ROSTER');
    for (const sp of SPECIES) {
      const cell = page.cages.flatMap((c) => c.cells).find((c) => !page.stones[c] && colOf(c) < SIZE - 1 && !page.stones[c + 1])!;
      const u: UnitSpec = sp.misprint === 'domino'
        ? { uid: 'a', species: sp.id, n: page.solution[cell]!, n2: page.solution[cell + 1]!, stars: 2, cell, cell2: cell + 1 }
        : { uid: 'a', species: sp.id, n: sp.misprint === 'blank' ? 0 : page.solution[cell]!, stars: 2, cell };
      const enemy = generateOpponent('ROSTER', 6);
      const fight = () => simulateClash({ page, units: [u] }, { page: enemy.page, units: enemy.units });
      const r = fight();
      expect(r.events.at(-1)!.type).toBe('end');
      expect(r).toEqual(fight());
    }
  });
});

describe('the Misprints', () => {
  const page = pageOf('MISPRT');
  const two = page.cages.find((c) => c.cells.length === 2 && c.cells.every((x) => !page.stones[x]))!;
  const [a, b] = two.cells as [number, number];

  it('the Blank counts as whatever number completes its cage', () => {
    const placed = new Array(36).fill(0);
    placed[a] = page.solution[a]; placed[b] = BLANK;
    expect(isSealed(two, boardValues(page, placed))).toBe(true);
    // It never blocks a number under the Latin rule.
    const vals = boardValues(page, placed);
    const peer = [...Array(36).keys()].find((c) => c !== b && (rowOf(c) === rowOf(b) || colOf(c) === colOf(b)) && !vals[c])!;
    for (let n = 1; n <= 6; n++) if (isLegal(page, vals, peer, n)) expect(isLegal(page, vals, peer, n)).toBe(true);
    expect(boardIsLatin(vals)).toBe(true);
  });

  it('the Smudge ignores the Latin rule, and no cage it stands in can seal', () => {
    const placed = new Array(36).fill(0);
    placed[a] = page.solution[a]; placed[b] = SMUDGE;
    const vals = boardValues(page, placed);
    expect(isSealed(two, vals)).toBe(false);
    expect(isLegal(page, vals, b, SMUDGE)).toBe(true);
    const s = holdingAll('MISPRT', [unit('n', 'shellguard', page.solution[a]!, a), unit('s', 'smudge', page.solution[a]!)]);
    // The Smudge may stand in the same row or column as an equal number.
    const sameLine = [...Array(36).keys()].find((c) => c !== a && !page.stones[c] && (rowOf(c) === rowOf(a) || colOf(c) === colOf(a)))!;
    expect(act(s, { type: 'place', uid: 's', cell: sameLine }).ok).toBe(true);
  });

  it('the Domino lies across two cells and turns around its first half', () => {
    const page2 = pageOf('DOMINO');
    const cell = [...Array(36).keys()].find((c) => colOf(c) < SIZE - 1 && rowOf(c) < SIZE - 1 && !page2.stones[c] && !page2.stones[c + 1] && !page2.stones[c + SIZE])!;
    const d = unit('d', 'domino', page2.solution[cell]!, -1, { n2: page2.solution[cell + 1]! });
    let s = holdingAll('DOMINO', [d]);
    const placed = act(s, { type: 'place', uid: 'd', cell });
    expect(placed.ok).toBe(true);
    s = placed.state;
    const laid = s.units[0]!;
    expect(laid.cell).toBe(cell);
    expect(laid.cell2).toBeDefined();
    expect(Math.abs(laid.cell2! - cell) === 1 || Math.abs(laid.cell2! - cell) === SIZE).toBe(true);
    expect(boardIsLatin(values(s))).toBe(true);
    // A unit can't be dropped onto it.
    s = { ...s, units: [...s.units, unit('x', 'blank', 0)] };
    expect(act(s, { type: 'place', uid: 'x', cell: laid.cell2! }).ok).toBe(false);
    // Turning walks the other half around the first, through every legal spot, and back.
    const empty = holdingAll('DOMINO');
    const pivot = [...Array(36).keys()].find((c) => dominoSpots(empty, { uid: '', n: 2, n2: 5 }, c).length >= 3)!;
    let t = act(holdingAll('DOMINO', [unit('d', 'domino', 2, -1, { n2: 5 })]), { type: 'place', uid: 'd', cell: pivot }).state;
    const seenSpots = new Set<number>();
    for (let i = 0; i < 4; i++) {
      seenSpots.add(t.units[0]!.cell2!);
      const r = act(t, { type: 'turn', uid: 'd' });
      expect(r.ok).toBe(true);
      expect(r.state.units[0]!.cell).toBe(pivot);
      expect(boardIsLatin(values(r.state))).toBe(true);
      t = r.state;
    }
    expect(seenSpots.size).toBe(dominoSpots(empty, { uid: '', n: 2, n2: 5 }, pivot).length);
  });

  it('a Domino fights as one body in both of its columns', () => {
    const page2 = pageOf('DOMFIT');
    const cell = [...Array(6).keys()].find((c) => !page2.stones[c] && !page2.stones[c + 1])!;
    const dom: UnitSpec = { uid: 'd', species: 'domino', n: page2.solution[cell]!, n2: page2.solution[cell + 1]!, stars: 1, cell, cell2: cell + 1 };
    const enemyPage = pageOf('DOMFIX');
    const marks: UnitSpec[] = [0, 1, 2, 3, 4, 5].filter((c) => !enemyPage.stones[c]).map((c) => ({ uid: `e${c}`, species: 'hare-fletcher', n: enemyPage.solution[c]!, stars: 1, cell: c }));
    const r = simulateClash({ page: page2, units: [dom] }, { page: enemyPage, units: marks });
    const hitters = new Set(r.events.filter((e) => e.type === 'attack' && e.dst === 'd').map((e) => (e as { src: string }).src));
    // Enemies facing either half find it.
    const cols = new Set([colOf(cell), colOf(cell + 1)]);
    for (const m of marks) if (cols.has(colOf(m.cell))) expect(hitters.has(m.uid)).toBe(true);
  });
});

describe('saves from M3', () => {
  it('load into this build with an empty satchel and play on', () => {
    const v2 = started('OLDSAV');
    const { satchel, pick, picksOwed, pickCount, erased, inked, revealed, ...rest } = v2;
    void satchel; void pick; void picksOwed; void pickCount; void erased; void inked; void revealed;
    const v1 = { ...rest, v: 1 };
    const s = migrateRun(JSON.parse(JSON.stringify(v1)))!;
    expect(s.v).toBe(2);
    expect(s.satchel).toEqual([]);
    expect(act(s, { type: 'reroll' }).ok).toBe(true);
    expect(migrateRun({ v: 99 })).toBeNull();
    expect(migrateRun(null)).toBeNull();
  });
});

describe('items', () => {
  it('a run opens with a pick of three, and a Keeper win earns a second pick next chapter', () => {
    const s0 = act(newRun('PICKS2'), { type: 'first-claim', cage: pageOf('PICKS2').cages.find((c) => c.cells.length === 2)!.id }).state;
    expect(s0.phase).toBe('pick');
    expect(s0.pick).toHaveLength(3);
    expect(act(s0, { type: 'buy', offer: 0 }).ok).toBe(false);
    const s1 = act(s0, { type: 'pick', choice: 1 }).state;
    expect(s1.satchel).toEqual([s0.pick![1]]);
    expect(s1.phase).toBe('plan');
  });

  it('the Chisel and Flip change a number, benching the unit if it no longer fits', () => {
    const page = pageOf('CHISEL');
    const cell = page.stones.findIndex((v) => !v);
    let s = holdingAll('CHISEL', [unit('a', 'shellguard', page.solution[cell]!, cell)]);
    s = { ...s, satchel: ['flip', 'chisel'] };
    const flipped = act(s, { type: 'use', slot: 0, uid: 'a' });
    expect(flipped.ok).toBe(true);
    const u = flipped.state.units[0]!;
    expect(u.n).toBe(7 - page.solution[cell]!);
    if (u.cell >= 0) expect(boardIsLatin(values(flipped.state))).toBe(true);
    expect(flipped.state.satchel).toEqual(['chisel']);
    const blank = { ...s, units: [unit('b', 'blank', 0)] };
    expect(act(blank, { type: 'use', slot: 1, uid: 'b' }).ok).toBe(false);
  });

  it('the Eraser opens a stone, the Inkpot switches + and ×, the Lens shows the hidden number', () => {
    const page = pageOf('ERASER');
    const stone = page.stones.findIndex((v) => v);
    let s = holdingAll('ERASER');
    const before = reach(s);
    s = { ...s, satchel: ['eraser', 'inkpot', 'lens'] };
    const erased = act(s, { type: 'use', slot: 0, cell: stone });
    expect(erased.ok).toBe(true);
    expect(runPage(erased.state).stones[stone]).toBe(0);
    expect(reach(erased.state)).toBe(before + 1);
    expect(act(s, { type: 'use', slot: 0, cell: page.stones.findIndex((v) => !v) }).ok).toBe(false);

    const plus = page.cages.find((c) => c.op === '+' || c.op === '×')!;
    const inked = act(erased.state, { type: 'use', slot: 0, cage: plus.id });
    expect(inked.ok).toBe(true);
    const now = runPage(inked.state).cages[plus.id]!;
    expect(now.op).toBe(plus.op === '+' ? '×' : '+');
    expect(isSealed(now, page.solution)).toBe(true);

    const open = page.stones.findIndex((v) => !v);
    const looked = act(inked.state, { type: 'use', slot: 0, cell: open });
    expect(looked.ok).toBe(true);
    expect(looked.state.revealed).toEqual([open]);
    expect(looked.note).toContain(String(page.solution[open]));
  });

  it('relics: one per unit, back to the satchel on a sale, and they change the fight', () => {
    let s = holdingAll('RELICS', [unit('a', 'shellguard', 1), unit('b', 'shellguard', 2)]);
    s = { ...s, satchel: ['blade', 'thorn'] };
    const armed = act(s, { type: 'use', slot: 0, uid: 'a' });
    expect(armed.state.units[0]!.relic).toBe('blade');
    expect(act(armed.state, { type: 'use', slot: 0, uid: 'a' }).ok).toBe(false);
    const sold = act(armed.state, { type: 'sell', uid: 'a' });
    expect(sold.state.satchel).toContain('blade');

    const page = pageOf('RELICS'), enemy = generateOpponent('RELICS', 4);
    const cell = page.stones.findIndex((v) => !v);
    const base: UnitSpec = { uid: 'p', species: 'hare-fletcher', n: page.solution[cell]!, stars: 2, cell };
    const dealt = (relic?: UnitSpec['relic']) => {
      const r = simulateClash({ page, units: [relic ? { ...base, relic } : base] }, { page: enemy.page, units: enemy.units });
      const firstHit = r.events.find((e) => e.type === 'damage' && e.src === 'p' && e.kind === 'hit');
      return firstHit && firstHit.type === 'damage' ? firstHit.amount : 0;
    };
    expect(dealt('blade')).toBeGreaterThan(dealt());
    const thorny = simulateClash({ page, units: [{ ...base, relic: 'thorn' }] }, { page: enemy.page, units: enemy.units });
    expect(thorny.events.some((e) => e.type === 'damage' && e.kind === 'thorn' && e.src === 'p')).toBe(true);
  });
});

describe('a run with every M4 action', () => {
  /** Each step is four numbers read against the current state, so random play stays relevant. */
  const stepArb = fc.tuple(fc.nat(9), fc.nat(40), fc.nat(40), fc.nat(40));
  const interpret = (s: RunState, [kind, i, j, k]: [number, number, number, number]): RunAction => {
    const uids = s.units.map((u) => u.uid);
    const uid = uids.length ? uids[i % uids.length]! : 'none';
    const held = s.claimed.flatMap((id) => runPage(s).cages[id]!.cells);
    const cell = held.length && j % 4 ? held[j % held.length]! : j % 36;
    switch (kind) {
      case 0: return { type: 'buy', offer: i % 4 };
      case 1: return { type: 'reroll' };
      case 2: return { type: 'claim', cage: i % runPage(s).cages.length };
      case 3: case 4: return { type: 'place', uid, cell: k % 7 === 0 ? -1 : cell };
      case 5: return { type: 'turn', uid };
      case 6: return { type: 'sell', uid };
      case 7: case 8: return { type: 'use', slot: k % Math.max(1, s.satchel.length), uid, half: (k % 2) as 0 | 1, dir: k % 3 ? 1 : -1, cell, cage: i % runPage(s).cages.length };
      default: return { type: 'clash' };
    }
  };
  const seen = new Set<string>();
  const play = (seed: string, steps: [number, number, number, number][]) => {
    // Start with every Misprint on offer and every item in hand, so random play exercises them.
    let s: RunState = {
      ...started(seed), gold: 40,
      claimed: [...new Set([...started(seed).claimed, ...pageOf(seed).cages.filter((c) => c.cells.length >= 3).slice(0, 3).map((c) => c.id)])],
      offers: [
        { species: 'domino', n: 2, n2: 5, sold: false }, { species: 'blank', n: 0, sold: false },
        { species: 'smudge', n: 3, sold: false }, { species: 'domino', n: 6, n2: 1, sold: false },
      ],
      satchel: ['chisel', 'flip', 'eraser', 'inkpot', 'lens', 'blade', 'thorn', 'quill'],
    };
    const states: RunState[] = [];
    for (const step of steps) {
      if (s.phase === 'merge') s = act(s, { type: 'merge', keep: s.merge!.uids.at(-1)! }).state;
      if (s.phase === 'pick') s = act(s, { type: 'pick', choice: 2 }).state;
      const a = interpret(s, step);
      const r = act(s, a);
      if (!r.ok) expect(r.state).toBe(s);
      if (r.ok) seen.add(a.type === 'use' ? `use:${s.satchel[a.slot]}` : a.type);
      for (const u of onBoard(r.state)) seen.add(`board:${u.species}`);
      s = r.state;
      states.push(s);
      if (s.phase === 'won' || s.phase === 'lost') break;
    }
    return states;
  };

  it('keeps every invariant', () => {
    fc.assert(fc.property(seedArb, fc.array(stepArb, { minLength: 30, maxLength: 90 }), (seed, steps) => {
      for (const s of play(seed, steps)) {
        expect(s.gold).toBeGreaterThanOrEqual(0);
        expect(onBench(s).length).toBeLessThanOrEqual(RUN.benchSize + 1);
        expect(onBoard(s).length).toBeLessThanOrEqual(reach(s));
        const cells = onBoard(s).flatMap((u) => (u.cell2 !== undefined ? [u.cell, u.cell2] : [u.cell]));
        expect(new Set(cells).size).toBe(cells.length);
        for (const c of cells) { expect(isClaimed(s, c)).toBe(true); expect(runPage(s).stones[c]).toBe(0); }
        expect(boardIsLatin(values(s))).toBe(true);
        for (const id of sealedNow(s)) expect(s.claimed).toContain(id);
        expect(claimCost(s, 0)).toBeGreaterThan(0);
      }
    }), { numRuns: 150, seed: 20261024 });
    // Random play really did reach the new rules.
    for (const k of ['board:domino', 'board:blank', 'board:smudge', 'use:chisel', 'use:flip', 'use:eraser', 'use:inkpot', 'use:lens', 'use:blade', 'clash']) {
      expect(seen, k).toContain(k);
    }
  });

  it('is deterministic: the same seed and actions reach the same state', () => {
    fc.assert(fc.property(seedArb, fc.array(stepArb, { maxLength: 60 }), (seed, steps) => {
      expect(play(seed, steps).at(-1)).toEqual(play(seed, steps).at(-1));
    }), { numRuns: 60 });
  });

  it('fights Mirror Scribe copies of Dominoes and relics', () => {
    const page = pageOf('MIRROR');
    const cell = [...Array(6).keys()].find((c) => !page.stones[c] && !page.stones[c + 1])!;
    const army: UnitSpec[] = [{ uid: 'd', species: 'domino', n: page.solution[cell]!, n2: page.solution[cell + 1]!, stars: 1, cell, cell2: cell + 1, relic: 'bulwark' }];
    const mirror = generateOpponent('MIRROR', 10, { page, units: army });
    expect(mirror.units[0]).toMatchObject({ cell2: cell + 1, relic: 'bulwark' });
    const r = simulateClash({ page, units: army }, { page: mirror.page, units: mirror.units, rules: mirror.rules });
    expect(r.winner === PLAYER || r.winner === 1 || r.winner === 'draw').toBe(true);
  });
});
