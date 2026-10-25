import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PAGE_VARIANTS, type PageVariant } from '../content/stations';
import { gridOf } from './grid';
import { DEFAULT_PAGE_RULES, evaluate, generatePage } from './page';
import { boardIsLatin, boardValues, completions, isSealed, sealedCages } from './rules';
import { SEED_ALPHABET } from './seed';
import { solve } from './solve';

const { cells: CELLS, size: SIZE, colOf, rowOf } = gridOf(6);
const neighbors = (c: number) => gridOf(6).neighbors[c]!;

const seedArb = fc.string({ unit: fc.constantFrom(...SEED_ALPHABET), minLength: 6, maxLength: 6 });
const RUNS = { numRuns: 300 };

function isConnected(cells: number[]): boolean {
  const set = new Set(cells);
  const seen = new Set([cells[0]!]);
  const queue = [cells[0]!];
  while (queue.length) {
    for (const n of neighbors(queue.pop()!)) if (set.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return seen.size === cells.length;
}

describe('generatePage', () => {
  it('is deterministic for a seed', () => {
    expect(generatePage('7KQ2X4')).toEqual(generatePage('7KQ2X4'));
    expect(generatePage('7KQ2X4')).not.toEqual(generatePage('7KQ2X5'));
  });

  it('hides a valid Latin-square solution', () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const { solution } = generatePage(seed);
      expect(solution).toHaveLength(CELLS);
      expect(solution.every((n) => n >= 1 && n <= SIZE)).toBe(true);
      expect(boardIsLatin(solution)).toBe(true);
    }), RUNS);
  });

  it('divides the page into 12–14 connected cages of 2–4 cells', () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const page = generatePage(seed);
      expect(page.cages.length).toBeGreaterThanOrEqual(DEFAULT_PAGE_RULES.minCages);
      expect(page.cages.length).toBeLessThanOrEqual(DEFAULT_PAGE_RULES.maxCages);
      const covered = page.cages.flatMap((c) => c.cells).sort((a, b) => a - b);
      expect(covered).toEqual(Array.from({ length: CELLS }, (_, i) => i));
      for (const cage of page.cages) {
        expect(cage.cells.length).toBeGreaterThanOrEqual(2);
        expect(cage.cells.length).toBeLessThanOrEqual(4);
        expect(isConnected(cage.cells)).toBe(true);
        for (const c of cage.cells) expect(page.cageOf[c]).toBe(cage.id);
      }
    }), RUNS);
  });

  it('prints targets the hidden solution satisfies, so every cage can seal at once', () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const page = generatePage(seed);
      for (const cage of page.cages) {
        if (cage.op === '−' || cage.op === '÷') expect(cage.cells).toHaveLength(2);
        expect(Number.isInteger(cage.target)).toBe(true);
        expect(evaluate(cage.op, cage.cells.map((c) => page.solution[c]!))).toBe(cage.target);
      }
      expect(sealedCages(page, page.solution).size).toBe(page.cages.length);
    }), RUNS);
  });

  it('places 8–10 stones that agree with the solution and never fill a cage', () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const page = generatePage(seed);
      const stones = page.stones.map((v, i) => [i, v] as const).filter(([, v]) => v > 0);
      expect(stones.length).toBeGreaterThanOrEqual(DEFAULT_PAGE_RULES.minStones);
      expect(stones.length).toBeLessThanOrEqual(DEFAULT_PAGE_RULES.maxStones);
      for (const [i, v] of stones) expect(v).toBe(page.solution[i]);
      for (const cage of page.cages) expect(cage.cells.some((c) => !page.stones[c])).toBe(true);
      for (let line = 0; line < SIZE; line++) {
        expect(stones.filter(([i]) => rowOf(i) === line).length).toBeLessThanOrEqual(DEFAULT_PAGE_RULES.maxStonesPerLine);
        expect(stones.filter(([i]) => colOf(i) === line).length).toBeLessThanOrEqual(DEFAULT_PAGE_RULES.maxStonesPerLine);
      }
    }), RUNS);
  });

  it('starts with the solution among every cage\'s completions', () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const page = generatePage(seed);
      const values = boardValues(page, new Array(CELLS).fill(0));
      for (const cage of page.cages) {
        const solved = cage.cells.map((c) => page.solution[c]!);
        expect(completions(page, values, cage)).toContainEqual(solved);
        expect(isSealed(cage, values)).toBe(false);
      }
    }), { numRuns: 100 });
  });
});

describe('pages of every size', () => {
  const variants: PageVariant[] = [
    'five', 'six', 'six-rocks', 'six-fallow', 'six-market', 'seven', 'eight',
    'six-fences', 'six-hidden', 'six-diagonal', 'six-hidden-fences', 'seven-fences', 'seven-hidden', 'seven-diagonal-fences',
    'seven-hidden-diagonal', 'eight-gentle', 'eight-diagonal', 'eight-fences', 'eight-all', 'five-all',
  ];
  it.each(variants)('%s: a valid page with exactly one solution', (variant) => {
    const rules = PAGE_VARIANTS[variant];
    const g = gridOf(rules.size);
    fc.assert(fc.property(seedArb, (seed) => {
      const page = generatePage(seed, rules);
      expect(page.size).toBe(rules.size);
      expect(page.solution).toHaveLength(g.cells);
      expect(page.solution.every((n) => n >= 1 && n <= g.size)).toBe(true);
      expect(boardIsLatin(page.solution, rules.diagonal)).toBe(true);
      expect(!!page.hidden).toBe(!!rules.hidden);
      expect(!!page.diagonal).toBe(!!rules.diagonal);
      if (rules.fences) {
        expect(page.fences!.length).toBeGreaterThanOrEqual(rules.fences[0]);
        expect(page.fences!.length).toBeLessThanOrEqual(rules.fences[1]);
        for (const f of page.fences!) {
          expect(g.neighbors[f.a]).toContain(f.b);
          expect(page.solution[f.a]!).toBeGreaterThan(page.solution[f.b]!);
        }
      } else expect(page.fences).toBeUndefined();
      const covered = page.cages.flatMap((c) => c.cells).sort((a, b) => a - b);
      expect(covered).toEqual(g.all);
      expect(page.cages.length).toBeGreaterThanOrEqual(rules.minCages);
      expect(page.cages.length).toBeLessThanOrEqual(rules.maxCages);
      for (const cage of page.cages) {
        expect(evaluate(cage.op, cage.cells.map((c) => page.solution[c]!))).toBe(cage.target);
        expect(cage.cells.some((c) => !page.stones[c])).toBe(true);
      }
      page.stones.forEach((v, i) => { if (v) expect(v).toBe(page.solution[i]); });
      if (rules.maxStones === 0) expect(page.stones.every((v) => !v)).toBe(true);
      // Every square can be worked out: the hidden solution is the only one.
      const { found, settled } = solve(page, 2);
      expect(settled).toBe(true);
      expect(found).toEqual([page.solution]);
    }), { numRuns: rules.size >= 7 ? 20 : 50 });
  }, 60_000);

  it('draws the hidden solution again when no cages settle it, so a page is always made', () => {
    // This seed's first solution never came out unique on a stoneless page.
    const page = generatePage('YQPF5G', PAGE_VARIANTS['six-fallow']);
    expect(page.stones.every((v) => !v)).toBe(true);
    expect(solve(page, 2).found).toEqual([page.solution]);
  });

  it('keeps the 6×6 pages from before for saved gardens', () => {
    expect(PAGE_VARIANTS.standard.unique).toBeUndefined();
    expect(generatePage('7KQ2X4', PAGE_VARIANTS.standard)).toEqual(generatePage('7KQ2X4'));
  });
});
