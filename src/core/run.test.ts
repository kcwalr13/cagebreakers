import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RUN, TOOLS } from '../content/balance';
import { isMet, viewOf } from './commission';
import { CELLS } from './grid';
import { createRng } from './rng';
import { boardIsLatin } from './rules';
import {
  type RunAction, type RunSetup, type RunState, STANDARD_SETUP, act, bagCount, dealtThisRound, inkBlocker, legalCells, migrateRun, newRun,
  pageOf, placementOf, replay, runPage, scoreOf, valuesOf, viewNow,
} from './run';
import { STATIONS } from '../content/stations';
import { NEW_PROFILE, setupFor } from './meta';

const solutionCell = (s: RunState, n: number) => {
  const p = runPage(s);
  for (let c = 0; c < CELLS; c++) if (!p.stones[c] && p.solution[c] === n && !s.tokens.some((t) => t.cell === c)) return c;
  return -1;
};

/** Puts this round's numbers (all, or `count`) on cells where the solution has them. */
function placeOnSolution(s: RunState, count = Infinity): RunState {
  for (const t of dealtThisRound(s).slice(0, count)) {
    if (t.cell >= 0) continue;
    s = act(s, { type: 'place', id: t.id, cell: solutionCell(s, t.n) }).state;
  }
  return s;
}

function openCounts(s: RunState): number[] {
  const p = runPage(s);
  const out = new Array<number>(7).fill(0);
  for (let c = 0; c < CELLS; c++) if (!p.stones[c]) out[p.solution[c]!]!++;
  return out;
}

function checkInvariants(s: RunState) {
  const p = runPage(s);
  // The bag and the tokens together are exactly the page's open cells.
  const counts = s.bag.slice();
  for (const t of s.tokens) counts[t.n]!++;
  expect(counts).toEqual(openCounts(s));
  // Tokens stand on distinct open cells, and the page obeys the Latin rule.
  const cells = s.tokens.filter((t) => t.cell >= 0).map((t) => t.cell);
  expect(new Set(cells).size).toBe(cells.length);
  expect(cells.every((c) => !p.stones[c])).toBe(true);
  expect(boardIsLatin(valuesOf(s))).toBe(true);
  expect(s.gold).toBeGreaterThanOrEqual(0);
  expect(s.ink).toBeGreaterThanOrEqual(0);
  expect(s.ink).toBeLessThanOrEqual(s.setup.startInk);
  if (s.phase === 'arrange') checkProof(s);
}

/** The round's proof is a legal layout of numbers you could end the round with, meeting all three commissions. */
function checkProof(s: RunState) {
  const p = runPage(s);
  const proof = s.proof!;
  expect(proof).toHaveLength(CELLS);
  expect(boardIsLatin(proof)).toBe(true);
  for (let c = 0; c < CELLS; c++) if (p.stones[c]) expect(proof[c]).toBe(p.stones[c]);
  const placed = proof.filter((n, c) => n && !p.stones[c]);
  const pool = placed.slice();
  const take = (n: number) => { const i = pool.indexOf(n); if (i < 0) return false; pool.splice(i, 1); return true; };
  for (const t of s.tokens.filter((x) => x.round < s.round)) expect(take(t.n), 'an earlier number is missing from the proof').toBe(true);
  const fresh = dealtThisRound(s).map((t) => t.n);
  for (const n of pool) { const i = fresh.indexOf(n); expect(i, 'the proof uses a number you were not dealt').toBeGreaterThanOrEqual(0); fresh.splice(i, 1); }
  expect(pool.length).toBeGreaterThanOrEqual(s.need);
  const v = viewOf(p, proof);
  for (const c of s.posted) expect(isMet(c.c, v), JSON.stringify(c.c)).toBe(true);
}

describe('a run', () => {
  it('starts with round 1 dealt and its commissions posted', () => {
    const s = newRun('STARTA');
    expect(s.round).toBe(1);
    expect(s.ink).toBe(RUN.startInk);
    expect(dealtThisRound(s)).toHaveLength(RUN.deal[0]!);
    expect(s.need).toBe(RUN.deal[0]! - 1);
    expect(s.posted.length).toBeGreaterThanOrEqual(2);
    checkInvariants(s);
  });

  it('refuses a number its row or column already holds, and printed cells', () => {
    let s = newRun('LEGALA');
    const p = runPage(s);
    const t = dealtThisRound(s)[0]!;
    const legal = new Set(legalCells(s, t.id));
    for (let c = 0; c < CELLS; c++) {
      const r = act(s, { type: 'place', id: t.id, cell: c });
      expect(r.ok, `cell ${c}`).toBe(legal.has(c));
      if (p.stones[c]) expect(r.reason).toMatch(/printed/);
      else if (!r.ok) expect(r.reason).toMatch(/already a \d in (row|column) \d/);
    }
    s = act(s, { type: 'place', id: t.id, cell: [...legal][0]! }).state;
    expect(s.tokens.find((x) => x.id === t.id)!.cell).toBe([...legal][0]);
  });

  it('swaps numbers when one is dropped on another, or sends the other to your hand', () => {
    let s = newRun('SWAPPA');
    const [a, b] = dealtThisRound(s);
    s = placeOnSolution(s, 2);
    const ca = s.tokens.find((t) => t.id === a!.id)!.cell, cb = s.tokens.find((t) => t.id === b!.id)!.cell;
    const r = act(s, { type: 'place', id: a!.id, cell: cb });
    if (r.ok) {
      const after = r.state.tokens.find((t) => t.id === b!.id)!.cell;
      expect([ca, -1]).toContain(after);
      checkInvariants(r.state);
    }
    // Lifting a number puts it in your hand.
    s = act(s, { type: 'place', id: a!.id, cell: -1 }).state;
    expect(s.tokens.find((t) => t.id === a!.id)!.cell).toBe(-1);
  });

  it("won't ink until enough of this round's numbers and all earlier ones are on the page", () => {
    let s = newRun('INKWAIT');
    expect(act(s, { type: 'ink' }).ok).toBe(false);
    expect(inkBlocker(s)).toMatch(/Place \d more/);
    s = placeOnSolution(s, s.need);
    expect(inkBlocker(s)).toBeNull();
    s = act(s, { type: 'ink' }).state;
    expect(s.round).toBe(2);
    // The unplaced number went back to the bag; the placed ones stay.
    expect(s.tokens.filter((t) => t.round === 1)).toHaveLength(RUN.deal[0]! - 1);
    const old = s.tokens.find((t) => t.round === 1)!;
    s = placeOnSolution(s);
    s = act(s, { type: 'place', id: old.id, cell: -1 }).state;
    expect(inkBlocker(s)).toMatch(/Put your inked \d back on the page/);
    checkInvariants(s);
  });

  it('spills ink for a missed required commission, unless the Blotter is down', () => {
    // Find a round 1 where placing on the solution misses the required commission.
    for (const seed of ['MISSAA', 'MISSBB', 'MISSCC', 'MISSDD', 'MISSEE', 'MISSFF', 'MISSGG', 'MISSHH']) {
      let s = placeOnSolution(newRun(seed));
      const req = s.posted.find((p) => p.required)!;
      if (isMet(req.c, viewNow(s))) continue;
      const missed = act(s, { type: 'ink' });
      expect(missed.inked!.required).toBe(false);
      expect(missed.state.ink).toBe(RUN.startInk - 1);
      s = { ...s, gold: TOOLS.blotter };
      s = act(s, { type: 'blotter' }).state;
      expect(s.gold).toBe(0);
      const blotted = act(s, { type: 'ink' });
      expect(blotted.inked!.blotted).toBe(true);
      expect(blotted.state.ink).toBe(RUN.startInk);
      return;
    }
    throw new Error('no seed missed its first required commission');
  });

  it('pays gold for bounties met and for each sealed cage', () => {
    let s = placeOnSolution(newRun('PAYDAY'));
    const r = act(s, { type: 'ink' });
    const rec = r.inked!;
    expect(r.state.gold).toBe(rec.bountyGold + rec.sealGold + rec.fullHandGold);
    expect(rec.sealGold).toBe(rec.seals * RUN.sealGold);
    s = r.state;
    expect(s.records).toHaveLength(1);
  });

  it('pays the full-hand bonus for placing every new number, never in the final round', () => {
    const s = newRun('FULLHAND');
    const some = act(placeOnSolution(s, s.need), { type: 'ink' });
    expect(some.inked!.fullHand).toBe(false);
    expect(some.inked!.fullHandGold).toBe(0);
    expect(placementOf(placeOnSolution(s, s.need)).full).toBe(false);
    const every = placeOnSolution(s);
    expect(placementOf(every)).toMatchObject({ placed: s.need + 1, need: s.need, bonus: RUN.fullHandGold, full: true });
    const all = act(every, { type: 'ink' });
    expect(all.inked!.fullHand).toBe(true);
    expect(all.state.gold).toBe(all.inked!.bountyGold + all.inked!.sealGold + RUN.fullHandGold);
    // The final round must place everything, so there's no bonus to earn.
    let f = newRun('FULLHAND');
    while (f.round < RUN.rounds) f = act({ ...placeOnSolution(f), ink: RUN.startInk }, { type: 'ink' }).state;
    expect(placementOf(f).bonus).toBe(0);
    const last = act(placeOnSolution(f), { type: 'ink' });
    expect(last.inked!.fullHand).toBe(false);
  });

  it('fills the whole page by the final round, then scores the run', () => {
    let s = newRun('FULLPG');
    while (s.phase === 'arrange') {
      if (s.round === RUN.rounds) {
        expect(s.need).toBe(dealtThisRound(s).length);
        expect(s.posted[0]!.c.kind).toBe('fill-page');
        expect(bagCount(s.bag)).toBe(0);
      }
      s = placeOnSolution(s);
      // Keep the run alive whatever the commissions say.
      s = { ...s, ink: RUN.startInk };
      s = act(s, { type: 'ink' }).state;
    }
    expect(s.phase).toBe('done');
    expect(s.records).toHaveLength(RUN.rounds);
    expect(valuesOf(s).every((n) => n > 0)).toBe(true);
    expect(scoreOf(s).total).toBe(s.gold + s.ink * RUN.inkBonus);
  });

  it('ends the run when the last drop of ink is spilled', () => {
    let s = newRun('RUINED');
    for (let i = 0; i < 40 && s.phase === 'arrange'; i++) {
      s = placeOnSolution(s, s.need);
      const req = s.posted.find((p) => p.required);
      s = { ...s, ink: 1 };
      const r = act(s, { type: 'ink' });
      s = r.state;
      if (req && r.inked!.required === false) { expect(s.phase).toBe('ruined'); return; }
    }
  });

  it('redraws loose numbers for gold, keeping all three commissions possible', () => {
    let s = newRun('REDRAWA');
    expect(act(s, { type: 'redraw' }).reason).toMatch(/gold/);
    s = { ...s, gold: 10 };
    const before = dealtThisRound(s).map((t) => t.id);
    const r = act(s, { type: 'redraw' });
    expect(r.ok, r.reason).toBe(true);
    expect(r.state.gold).toBe(10 - TOOLS.redraw);
    expect(r.state.redraws).toBe(1);
    expect(dealtThisRound(r.state).every((t) => !before.includes(t.id))).toBe(true);
    checkInvariants(r.state);
    // Placed numbers stay put; only loose ones are redrawn.
    let t = placeOnSolution(s, 2);
    const placed = dealtThisRound(t).filter((x) => x.cell >= 0).map((x) => x.id);
    const again = act(t, { type: 'redraw' });
    if (again.ok) {
      t = again.state;
      expect(dealtThisRound(t).filter((x) => placed.includes(x.id))).toHaveLength(2);
      checkInvariants(t);
    }
  });

  it('refuses a redraw that would break a promise, and charges nothing for it', () => {
    let refused = 0;
    for (const seed of ['RDAAAA', 'RDBBBB', 'RDCCCC', 'RDDDDD', 'RDEEEE', 'RDFFFF', 'RDGGGG', 'RDHHHH', 'RDJJJJ', 'RDKKKK', 'RDMMMM', 'RDNNNN']) {
      const s = { ...newRun(seed), gold: 10 };
      const r = act(s, { type: 'redraw' });
      if (r.ok) { checkInvariants(r.state); continue; }
      refused++;
      expect(r.reason).toBe('No other deal would keep all three commissions possible');
      expect(r.state).toBe(s);
    }
    expect(refused).toBeLessThan(6);
  });

  it('shows a hidden number with the Lens', () => {
    let s = { ...newRun('LENSES'), gold: 5 };
    const p = runPage(s);
    const stone = p.stones.findIndex((n) => n > 0);
    expect(act(s, { type: 'lens', cell: stone }).ok).toBe(false);
    const cell = p.stones.findIndex((n) => n === 0);
    s = act(s, { type: 'lens', cell }).state;
    expect(s.revealed).toEqual([cell]);
    expect(s.gold).toBe(5 - TOOLS.lens);
    expect(act(s, { type: 'lens', cell }).ok).toBe(false);
  });

  it('closes battle-era saves and restores current ones', () => {
    expect(migrateRun({ v: 2, seed: 'OLDRUN', clash: 3 })).toBeNull();
    expect(migrateRun(null)).toBeNull();
    const s = newRun('KEEPME');
    expect(migrateRun(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

/** A state-aware random player: mostly sensible moves, plus refusals and every tool. */
function randomActions(seed: string, steps: number, salt: number, setup: RunSetup = STANDARD_SETUP): { state: RunState; actions: RunAction[] } {
  const rng = createRng(`${seed}:${salt}`);
  let s = newRun(seed, { setup });
  const actions: RunAction[] = [];
  for (let i = 0; i < steps && s.phase === 'arrange'; i++) {
    const roll = rng.next();
    let a: RunAction;
    if (roll < 0.55) {
      const t = rng.pick(s.tokens);
      const legal = legalCells(s, t.id);
      a = { type: 'place', id: t.id, cell: legal.length && rng.next() < 0.85 ? rng.pick(legal) : rng.int(-1, CELLS - 1) };
    } else if (roll < 0.75) {
      if (inkBlocker(s)) {
        for (const t of s.tokens) if (t.cell < 0 && (t.round < s.round || rng.next() < 0.8)) {
          const c = solutionCell(s, t.n);
          if (c >= 0) { const step: RunAction = { type: 'place', id: t.id, cell: c }; s = act(s, step).state; actions.push(step); }
        }
      }
      a = { type: 'ink' };
    } else {
      // Tools: give the run gold sometimes so they get used, through an action-free state edit.
      const tool = rng.pick(['redraw', 'lens', 'blotter', 'quill', 'gilder', 'eraser', 'inkwell'] as const);
      a = tool === 'lens' || tool === 'eraser' ? { type: tool, cell: rng.int(0, CELLS - 1) } : { type: tool };
    }
    const r = act(s, a);
    if (!r.ok) expect(r.state).toBe(s);
    s = r.state;
    actions.push(a);
    checkInvariants(s);
  }
  return { state: s, actions };
}

/** Every station's setup, carrying every tool, with gold to spend. */
const RICH: RunSetup[] = [
  { ...STANDARD_SETUP, startGold: 40, tools: ['redraw', 'lens', 'blotter', 'quill', 'gilder', 'eraser', 'inkwell'] },
  ...STATIONS.map((st) => ({ ...setupFor(NEW_PROFILE, st.id), startGold: 40, tools: ['redraw', 'lens', 'blotter', 'quill', 'gilder', 'eraser', 'inkwell'] as RunSetup['tools'] })),
];

describe('random play', () => {
  it('never breaks the rules, and replays exactly from seed, setup and actions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('RNDAAA', 'RNDBBB', 'RNDCCC', 'RNDDDD', 'RNDEEE', 'RNDFFF', 'RNDGGG', 'RNDHHH'),
        fc.integer({ min: 0, max: 1e6 }),
        fc.constantFrom(...RICH),
        (seed, salt, setup) => {
          const { state, actions } = randomActions(seed, 120, salt, setup);
          expect(replay(seed, actions, { setup })).toEqual(state);
        },
      ),
      { numRuns: 50, seed: 20261024 },
    );
  }, 30_000); // About 5 s on its own: heavy enough to need room when the suite runs in parallel.
});
