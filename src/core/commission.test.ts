import { describe as group, expect, it } from 'vitest';
import { RUN } from '../content/balance';
import { FINAL_SEALS } from '../content/commissions';
import {
  type Commission, type Holding, cageName, cellsOf, choices, describe, isMet, possible, postCommissions, readout, sampleLayout, viewOf,
} from './commission';
import { CELLS } from './grid';
import { generatePage } from './page';
import { createRng, stream } from './rng';
import { boardIsLatin } from './rules';
import { act, dealtThisRound, newRun, pageOf, type RunState } from './run';

const page = generatePage('CMSNAA');
const empty = viewOf(page, page.stones.slice());

group('commission sentences', () => {
  it('reads rows and columns from 1, top left', () => {
    expect(describe({ kind: 'line-min', axis: 'row', line: 2, min: 12 }, page)).toBe('Row 3 adds to 12 or more');
    expect(describe({ kind: 'line-max', axis: 'col', line: 4, max: 9 }, page)).toBe('Column 5 adds to 9 or less');
    expect(describe({ kind: 'no-number', axis: 'row', line: 0, n: 6 }, page)).toBe('No 6 in row 1');
    expect(describe({ kind: 'zone', n: 1, zone: 'left' }, page)).toBe('Every 1 sits in the left half');
    expect(describe({ kind: 'seal-count', count: 3 }, page)).toBe('Seal 3 cages');
    expect(describe({ kind: 'seal-op', op: '×' }, page)).toBe('Seal a × cage');
    expect(describe({ kind: 'line-count-max', axis: 'col', line: 1, max: 2 }, page)).toBe('Column 2 holds 2 numbers or fewer');
    expect(describe({ kind: 'fill-line', axis: 'row', line: 3 }, page)).toBe('Fill row 4');
    expect(describe({ kind: 'equal-lines', axis: 'row', a: 1, b: 4, min: 10 }, page)).toBe('Rows 2 and 5 add to the same total, 10 or more');
    expect(describe({ kind: 'no-seal-line', axis: 'row', line: 1 }, page)).toBe('No sealed cage touches row 2');
    expect(describe({ kind: 'diagonal-min', min: 15 }, page)).toBe('The long diagonal adds to 15 or more');
    expect(describe({ kind: 'rising', line: 2, count: 3 }, page)).toBe('Column 3 rises from top to bottom, 3 numbers or more');
    expect(describe({ kind: 'parity-line', axis: 'row', line: 5, even: true, count: 2 }, page)).toBe('Only even numbers in row 6, 2 or more');
    expect(describe({ kind: 'fill-page' }, page)).toBe('Fill every cell');
    expect(describe({ kind: 'seal-all' }, page)).toBe('Seal every cage');
  });

  it('names a cage by its label, adding its row when two cages share one', () => {
    for (const cage of page.cages) {
      const name = cageName(page, cage.id);
      expect(name).toContain(`${cage.target}${cage.op}`);
      const twins = page.cages.filter((c) => c.target === cage.target && c.op === cage.op).length;
      expect(name.includes(' in row ')).toBe(twins > 1);
    }
  });

  it('gives every commission a readout and the cells it is about', () => {
    const all: Commission[] = [
      { kind: 'line-min', axis: 'row', line: 0, min: 10 }, { kind: 'zone', n: 3, zone: 'top' },
      { kind: 'seal-cage', cage: 0 }, { kind: 'empty-cage', cage: 1 }, { kind: 'equal-lines', axis: 'col', a: 0, b: 5, min: 8 },
      { kind: 'rising', line: 0, count: 3 }, { kind: 'fill-page' }, { kind: 'seal-all' },
    ];
    for (const c of all) {
      expect(readout(c, empty).length).toBeGreaterThan(0);
      expect(cellsOf(c, page).every((x) => x >= 0 && x < CELLS)).toBe(true);
    }
  });
});

group('judging the page', () => {
  it('judges the full solution as filled and sealed', () => {
    const full = viewOf(page, page.solution.slice());
    expect(isMet({ kind: 'fill-page' }, full)).toBe(true);
    expect(isMet({ kind: 'seal-all' }, full)).toBe(true);
    expect(isMet({ kind: 'fill-page' }, empty)).toBe(false);
  });

  it('counts stones toward line totals and keeps them out of empty cages', () => {
    const row = page.stones.slice(0, 6).reduce((a, b) => a + b, 0);
    expect(isMet({ kind: 'line-min', axis: 'row', line: 0, min: row }, empty)).toBe(true);
    expect(isMet({ kind: 'line-min', axis: 'row', line: 0, min: row + 1 }, empty)).toBe(false);
    for (const cage of page.cages) expect(isMet({ kind: 'empty-cage', cage: cage.id }, empty)).toBe(true);
  });

  it('reads a column rising only when its numbers climb', () => {
    const values = new Array<number>(CELLS).fill(0);
    values[0] = 1; values[12] = 3; values[30] = 5;
    const v = { page: { ...page, stones: new Array<number>(CELLS).fill(0) }, values, sealed: new Set<number>() };
    expect(isMet({ kind: 'rising', line: 0, count: 3 }, v)).toBe(true);
    values[30] = 2;
    expect(isMet({ kind: 'rising', line: 0, count: 3 }, v)).toBe(false);
  });
});

group('proving commissions possible', () => {
  it('lists each distinct set of numbers you could end a round with', () => {
    const sets = choices({ kept: [6], dealt: [2, 2, 5], need: 2 });
    expect(sets.map((s) => s.join(''))).toEqual(expect.arrayContaining(['226', '256', '2256']));
    expect(sets).toHaveLength(3);
  });

  it('samples legal layouts that hold exactly the given numbers', () => {
    const rng = createRng('layouts');
    for (let i = 0; i < 200; i++) {
      const nums = Array.from({ length: rng.int(0, 20) }, () => rng.int(1, 6));
      // Only as many of each number as the page has open cells for it.
      const room = new Array<number>(7).fill(0);
      for (let c = 0; c < CELLS; c++) if (!page.stones[c]) room[page.solution[c]!]!++;
      const fits = nums.filter((n) => room[n]!-- > 0);
      const values = sampleLayout(page, fits, rng);
      expect(boardIsLatin(values)).toBe(true);
      const placed = values.filter((n, c) => n && !page.stones[c]).sort();
      expect(placed).toEqual(fits.slice().sort());
    }
  });

  /** Plays rounds by putting numbers on solution cells, checking each round's commissions. */
  function* rounds(seed: string): Generator<RunState> {
    let s = newRun(seed);
    const rng = stream(seed, 'test-play');
    while (s.phase === 'arrange') {
      yield s;
      const p = pageOf(seed);
      const pick = rng.shuffle(dealtThisRound(s)).slice(0, rng.int(s.need, dealtThisRound(s).length));
      for (const t of pick) {
        const cell = rng.shuffle(Array.from({ length: CELLS }, (_, c) => c))
          .find((c) => !p.stones[c] && p.solution[c] === t.n && !s.tokens.some((o) => o.cell === c));
        if (cell !== undefined) s = act(s, { type: 'place', id: t.id, cell }).state;
      }
      // Keep the run going whatever the commissions say, so every round gets checked.
      s = act({ ...s, ink: RUN.startInk }, { type: 'ink' }).state;
    }
  }

  it('posts one required commission and two bounties, each provably possible', () => {
    let checked = 0;
    for (const seed of ['PRVAAA', 'PRVBBB', 'PRVCCC', 'PRVDDD', 'PRVEEE', 'PRVFFF']) {
      for (const s of rounds(seed)) {
        const p = pageOf(seed);
        const holding: Holding = {
          kept: s.tokens.filter((t) => t.round < s.round).map((t) => t.n),
          dealt: dealtThisRound(s).map((t) => t.n),
          need: s.need,
        };
        const required = s.posted.filter((x) => x.required);
        expect(required).toHaveLength(1);
        expect(s.posted.filter((x) => !x.required).length).toBeGreaterThanOrEqual(1);
        const rng = stream(seed, `prove:${s.round}`);
        expect(possible(p, holding, required[0]!.c, rng, true, 600), describe(required[0]!.c, p)).toBe(true);
        for (const b of s.posted.filter((x) => !x.required)) {
          expect(possible(p, holding, b.c, rng, false, 600), describe(b.c, p)).toBe(true);
          expect(b.gold).toBeGreaterThan(0);
        }
        expect(new Set(s.posted.map((x) => x.c.kind)).size).toBe(s.posted.length);
        // All three can be met at once: the round's proof layout does it.
        const v = viewOf(p, s.proof!);
        expect(boardIsLatin(s.proof!)).toBe(true);
        for (const c of s.posted) expect(isMet(c.c, v), describe(c.c, p)).toBe(true);
        expect(s.posted.filter((x) => !x.required)).toHaveLength(2);
        checked++;
      }
    }
    expect(checked).toBe(6 * RUN.rounds);
  });

  it('posts three commissions even on a thin first page, all met at once by the proof', () => {
    for (let i = 0; i < 80; i++) {
      const seed = `THN${'23456789ABCDEFGHJKMNPQRSTUVWXYZ'[i % 31]}${'ABCDEFGHJK'[Math.floor(i / 31)]}Q`;
      const s = newRun(seed);
      const p = pageOf(seed);
      expect(s.posted, seed).toHaveLength(3);
      const v = viewOf(p, s.proof!);
      for (const c of s.posted) expect(isMet(c.c, v), `${seed}: ${describe(c.c, p)}`).toBe(true);
    }
  });

  it('asks the final round to fill the page, with seal bounties', () => {
    const final = postCommissions({ page, round: 8, final: true, holding: { kept: [], dealt: [], need: 0 }, now: empty }, createRng('f'));
    expect(final.map((p) => p.c.kind)).toEqual(['fill-page', 'seal-count', 'seal-all']);
    expect(final[1]!.c).toEqual({ kind: 'seal-count', count: Math.ceil(page.cages.length * FINAL_SEALS.share) });
  });

  it('posts the same commissions for the same seed', () => {
    const a = newRun('SAMEPG'), b = newRun('SAMEPG');
    expect(a.posted).toEqual(b.posted);
  });

  it('posts a round in well under 50 ms', () => {
    const s = newRun('QUICKA');
    const p = pageOf(s.seed);
    const holding = { kept: [], dealt: dealtThisRound(s).map((t) => t.n), need: s.need };
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) postCommissions({ page: p, round: 3, final: false, holding, now: viewOf(p, p.stones.slice()) }, createRng(`q${i}`));
    expect((performance.now() - t0) / 20).toBeLessThan(50);
  });
});
