import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CELLS, PEERS } from './grid';
import { generatePage } from './page';
import { boardIsLatin, boardValues, combinationSets, completions, hintFor, isLegal, isSealed } from './rules';
import { SEED_ALPHABET } from './seed';

const seedArb = fc.string({ unit: fc.constantFrom(...SEED_ALPHABET), minLength: 6, maxLength: 6 });

describe('the Latin rule', () => {
  it('never lets a legal placement repeat a number in a row or column', () => {
    fc.assert(fc.property(seedArb, fc.array(fc.tuple(fc.nat(CELLS - 1), fc.integer({ min: 1, max: 6 })), { maxLength: 60 }), (seed, moves) => {
      const page = generatePage(seed);
      const placed = new Array<number>(CELLS).fill(0);
      for (const [cell, n] of moves) {
        const values = boardValues(page, placed);
        if (values[cell]) continue;
        if (isLegal(page, values, cell, n)) placed[cell] = n;
      }
      expect(boardIsLatin(boardValues(page, placed))).toBe(true);
    }), { numRuns: 300 });
  });

  it('refuses stones and repeated numbers, and ignores the origin of a moving number', () => {
    const page = generatePage('7KQ2X4');
    const stone = page.stones.findIndex((v) => v > 0);
    const values = boardValues(page, new Array(CELLS).fill(0));
    expect(isLegal(page, values, stone, 1)).toBe(false);
    const open = values.findIndex((v, i) => !v && PEERS[i]!.some((p) => values[p]));
    const peerValue = values[PEERS[open]!.find((p) => values[p])!]!;
    expect(isLegal(page, values, open, peerValue)).toBe(false);
    // Moving a number along its own row: its old cell must not block it.
    const placed = new Array<number>(CELLS).fill(0);
    const a = values.findIndex((v) => !v);
    const n = [1, 2, 3, 4, 5, 6].find((x) => isLegal(page, values, a, x))!;
    placed[a] = n;
    const after = boardValues(page, placed);
    const b = PEERS[a]!.find((p) => !after[p] && isLegal(page, after, p, n, a));
    if (b !== undefined) expect(isLegal(page, after, b, n)).toBe(false);
  });
});

describe('cages', () => {
  it('seals exactly when filled with numbers that hit the target', () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const page = generatePage(seed);
      for (const cage of page.cages) expect(isSealed(cage, page.solution)).toBe(true);
    }), { numRuns: 100 });
  });

  it('agrees between hints and sealing', () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const page = generatePage(seed);
      const placed = new Array<number>(CELLS).fill(0);
      // Fill each cage with the solution except one cell, then check that cell's hints.
      for (const cage of page.cages) {
        const open = cage.cells.filter((c) => !page.stones[c]);
        for (const c of open.slice(1)) placed[c] = page.solution[c]!;
      }
      const values = boardValues(page, placed);
      for (const cage of page.cages) {
        const last = cage.cells.find((c) => !values[c])!;
        expect(hintFor(page, values, last, page.solution[last]!)).toBe('seals');
        for (let n = 1; n <= 6; n++) {
          const hint = hintFor(page, values, last, n);
          if (n !== page.solution[last] && hint === 'seals') {
            const next = values.slice(); next[last] = n;
            expect(isSealed(cage, next)).toBe(true);
          }
          if (hint === 'dead') {
            const next = values.slice(); next[last] = n;
            expect(isSealed(cage, next)).toBe(false);
          }
        }
      }
    }), { numRuns: 100 });
  });

  it('lists each combination once, sorted', () => {
    const page = generatePage('7KQ2X4');
    const values = boardValues(page, new Array(CELLS).fill(0));
    for (const cage of page.cages) {
      const sets = combinationSets(page, values, cage);
      expect(new Set(sets.map((s) => s.join(','))).size).toBe(sets.length);
      for (const s of sets) expect(s).toEqual(s.slice().sort((a, b) => a - b));
      expect(sets.length).toBeGreaterThan(0);
      expect(completions(page, values, cage).length).toBeGreaterThanOrEqual(sets.length);
    }
  });
});
