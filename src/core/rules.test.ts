import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { gridOf } from './grid';
import { generatePage } from './page';
import { PAGE_VARIANTS } from '../content/stations';
import { boardIsLatin, boardValues, brokenBy, combinationSets, completions, fencesKept, hintFor, isLegal, isSealed, sealedCages } from './rules';
import { SEED_ALPHABET } from './seed';

const CELLS = gridOf(6).cells;
const PEERS = gridOf(6).peers;

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

describe('the twists', () => {
  const twisted = (variant: Parameters<typeof generatePage>[1]) => fc.property(seedArb, fc.array(fc.tuple(fc.nat(63), fc.integer({ min: 1, max: 8 })), { maxLength: 80 }), (seed, moves) => {
    const page = generatePage(seed, variant);
    const n = page.stones.length;
    const placed = new Array<number>(n).fill(0);
    for (const [c, v] of moves) {
      const cell = c % n, num = ((v - 1) % page.size) + 1;
      const values = boardValues(page, placed);
      if (values[cell]) continue;
      if (isLegal(page, values, cell, num)) placed[cell] = num;
    }
    const board = boardValues(page, placed);
    expect(boardIsLatin(board, page.diagonal)).toBe(true);
    expect(fencesKept(page, board)).toBe(true);
  });

  it('never lets a placement break a fence or repeat on a counted diagonal', () => {
    fc.assert(twisted(PAGE_VARIANTS['six-fences']), { numRuns: 150 });
    fc.assert(twisted(PAGE_VARIANTS['seven-diagonal-fences']), { numRuns: 60 });
  });

  it('never lets a placement break shade, a runner, a bean pole, elbow room or a tidy plot', () => {
    for (const v of ['six-shade', 'six-runners', 'six-poles', 'six-elbow', 'six-tidy', 'seven-poles-runners'] as const) {
      fc.assert(twisted(PAGE_VARIANTS[v]), { numRuns: 40 });
    }
  });

  it('says which twist keeps a number out', () => {
    const bare = (variant: Parameters<typeof generatePage>[1], seed: string) => ({ ...generatePage(seed, variant), stones: new Array<number>(36).fill(0) });
    const g = gridOf(6);
    // Shade takes only even numbers.
    const shady = bare(PAGE_VARIANTS['six-shade'], 'SHADEA');
    const sc = shady.shade![0]!;
    const none = new Array<number>(36).fill(0);
    expect(brokenBy(shady, none, sc, 3)).toEqual({ by: 'shade' });
    expect(brokenBy(shady, none, sc, 4)).toBeNull();
    // A runner joins numbers one apart.
    const run = bare(PAGE_VARIANTS['six-runners'], 'RUNNRA');
    const r = run.runners![0]!;
    const rv = none.slice(); rv[r.b] = 3;
    expect(brokenBy(run, rv, r.a, 5)).toEqual({ by: 'runner', other: r.b });
    expect(brokenBy(run, rv, r.a, 4)).toBeNull();
    expect(brokenBy(run, rv, r.a, 2)).toBeNull();
    // Numbers climb a bean pole from root to tip, past squares between them too.
    const poled = bare(PAGE_VARIANTS['six-poles'], 'POLESA');
    const pole = poled.poles![0]!;
    const pv = none.slice(); pv[pole[0]!] = 4;
    expect(brokenBy(poled, pv, pole[2]!, 4)).toMatchObject({ by: 'pole', other: pole[0] });
    expect(brokenBy(poled, pv, pole[2]!, 6)).toBeNull();
    // Elbow room: a number may not touch itself at a corner.
    const elbow = bare(PAGE_VARIANTS['six-elbow'], 'ELBOWA');
    const ev = none.slice(); ev[g.cellAt(2, 2)] = 5;
    expect(brokenBy(elbow, ev, g.cellAt(3, 3), 5)).toEqual({ by: 'peer', why: 'corner', other: g.cellAt(2, 2) });
    expect(brokenBy({ ...elbow, elbow: false }, ev, g.cellAt(3, 3), 5)).toBeNull();
    // Tidy plots: no number repeats inside a plot.
    const tidy = bare(PAGE_VARIANTS['six-tidy'], 'TIDYAA');
    const bent = tidy.cages.find((c) => c.cells.some((x) => g.rowOf(x) !== g.rowOf(c.cells[0]!)) && c.cells.some((x) => g.colOf(x) !== g.colOf(c.cells[0]!)))!;
    const [a, b] = [bent.cells[0]!, bent.cells.find((x) => g.rowOf(x) !== g.rowOf(bent.cells[0]!) && g.colOf(x) !== g.colOf(bent.cells[0]!))!];
    const tv = none.slice(); tv[a] = 2;
    expect(brokenBy(tidy, tv, b, 2)).toEqual({ by: 'peer', why: 'plot', other: a });
  });

  it('refuses a number that breaks a fence, and one already on the long diagonal', () => {
    const page = generatePage('FENCEQ', PAGE_VARIANTS['six-fences']);
    const f = page.fences!.find((x) => !page.stones[x.a] && !page.stones[x.b])!;
    const placed = new Array<number>(page.stones.length).fill(0);
    placed[f.b] = page.solution[f.b]!;
    const values = boardValues(page, placed);
    for (let v = 1; v <= 6; v++) if (v <= values[f.b]!) expect(isLegal(page, values, f.a, v)).toBe(false);
    expect(brokenBy(page, values, f.a, values[f.b]!)).not.toBeNull();
    // On a bare diagonal page, a number in one corner keeps it out of the opposite corner: they share the long diagonal but no row or column.
    const diag = { ...generatePage('DIAGQQ', PAGE_VARIANTS['six-diagonal']), stones: new Array<number>(36).fill(0) };
    const dPlaced = new Array<number>(36).fill(0);
    dPlaced[35] = 4;
    expect(isLegal(diag, dPlaced, 0, 4)).toBe(false);
    expect(isLegal({ ...diag, diagonal: false }, dPlaced, 0, 4)).toBe(true);
    dPlaced[30] = 2; // the other diagonal's bottom-left corner
    expect(isLegal(diag, dPlaced, 5, 2)).toBe(false);
  });

  it('a plot with its sign hidden blooms when any operation makes its target', () => {
    const page = generatePage('HIDDEN', PAGE_VARIANTS['six-hidden']);
    const cage = { id: 0, cells: [0, 1], op: '+' as const, target: 2 };
    expect(isSealed(cage, [4, 2], false)).toBe(false);
    expect(isSealed(cage, [4, 2], true)).toBe(true); // 4 ÷ 2
    expect(isSealed(cage, [3, 1], true)).toBe(true); // 3 − 1
    expect(isSealed({ ...cage, cells: [0, 1, 2], target: 6 }, [1, 2, 3], true)).toBe(true);
    expect(isSealed({ ...cage, cells: [0, 1, 2], target: 1 }, [3, 2, 1], true)).toBe(false); // no − or ÷ past two squares
    expect(sealedCages(page, page.solution).size).toBe(page.cages.length);
  });
});
