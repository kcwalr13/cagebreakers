import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CHAPTERS, DAILY, UNLOCK_AFTER } from '../../content/dewfall';
import { stream } from '../rng';
import { type Board, boardOf } from './board';
import { CLEAR, type Clue, type Puzzle, type PuzzleShape, TRAIL, UNKNOWN, countedBy, deduce, makePuzzle, puzzleOf } from './clues';
import {
  actDew, afterInBook, bookId, chapterOpen, chapterPuzzles, dailyId, dailyPuzzle, dailyStreak, isSolved, lanternSquare, newAttempt,
  newDewProfile, nextInBook, parseId, puzzleById, recordSolve, shownMarks,
} from './play';
import { drawTrail, isPath, straightAt } from './trail';

/** Every trail on a board from `entry` to `exit`, by brute force. */
function allTrails(b: Board, entry: number, exit: number): number[][] {
  const out: number[][] = [];
  const path = [entry];
  const on = new Set(path);
  const go = () => {
    const tail = path[path.length - 1]!;
    if (tail === exit) { out.push(path.slice()); return; }
    for (const n of b.orth[tail]!) {
      if (on.has(n) || b.orth[n]!.some((m) => m !== tail && on.has(m))) continue;
      path.push(n); on.add(n);
      go();
      path.pop(); on.delete(n);
    }
  };
  go();
  return out;
}

/** Whether a trail fits every clue of a puzzle, read straight from the rules as a player hears them. */
function fits(p: Puzzle, trail: readonly number[]): boolean {
  const b = boardOf(p.width, p.height);
  const on = new Set(trail);
  if (p.rows.some((n, r) => n !== null && trail.filter((c) => b.rowOf(c) === r).length !== n)) return false;
  if (p.cols.some((n, k) => n !== null && trail.filter((c) => b.colOf(c) === k).length !== n)) return false;
  return p.clues.every((c: Clue) => {
    const i = trail.indexOf(c.cell);
    switch (c.kind) {
      case 'glint': return i >= 0;
      case 'pebble': return i > 0 && i < trail.length - 1 && straightAt(trail, i);
      case 'acorn': return i > 0 && i < trail.length - 1 && !straightAt(trail, i);
      default: return i < 0 && countedBy(b, c).filter((x) => on.has(x)).length === c.n;
    }
  });
}

const small: PuzzleShape = {
  width: 4, height: 5, trail: [6, 12], kinds: ['dew', 'leaf', 'scarecrow', 'pebble', 'acorn'], feature: [], minFeature: 0, hideTallies: 6, depth: 0, spare: 0,
};

describe('Dewfall trails', () => {
  it('run from the top row to the bottom row, never touching themselves along an edge', () => {
    fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 8 }), (seed) => {
      const b = boardOf(6, 8);
      const t = drawTrail(stream(seed, 't'), b, 14, 22);
      expect(isPath(b, t, t[0]!, t[t.length - 1]!)).toBe(true);
      expect(b.rowOf(t[0]!)).toBe(0);
      expect(b.rowOf(t[t.length - 1]!)).toBe(7);
      expect(t.length).toBeGreaterThanOrEqual(14);
      expect(t.length).toBeLessThanOrEqual(22);
    }), { numRuns: 60 });
  });
});

describe('Dewfall clues and the solver', () => {
  it('only call a puzzle solved when its trail is the one trail that fits (checked by brute force)', () => {
    let checked = 0;
    for (let i = 0; i < 80; i++) {
      const rng = stream('brute', String(i));
      const b = boardOf(small.width, small.height);
      const shape: PuzzleShape = i % 2 ? small : { ...small, depth: 1, hideTallies: 9 };
      const p = makePuzzle(rng, drawTrail(rng, b, shape.trail[0], shape.trail[1]), shape);
      if (!p) continue;
      const fitting = allTrails(b, p.entry, p.exit).filter((t) => fits(p, t));
      expect(fitting).toHaveLength(1);
      expect(fitting[0]).toEqual(p.trail);
      checked++;
    }
    expect(checked).toBeGreaterThan(60);
  });

  it('read pebbles as straight, acorns as turns, and scarecrows along one line', () => {
    // A 3×3 garden: the trail comes down the middle column.
    const base: Puzzle = { width: 3, height: 3, entry: 1, exit: 7, rows: [null, null, null], cols: [null, null, null], clues: [], trail: [1, 4, 7] };
    const b = boardOf(3, 3);
    const trails = allTrails(b, 1, 7);
    expect(trails.filter((t) => fits({ ...base, clues: [{ kind: 'pebble', cell: 4 }] }, t))).toEqual([[1, 4, 7]]);
    expect(trails.filter((t) => fits({ ...base, clues: [{ kind: 'acorn', cell: 4 }] }, t))).toEqual([]);
    expect(deduce({ ...base, clues: [{ kind: 'pebble', cell: 4 }] }, 0).solved).toBe(true);
    // A scarecrow in the top-left corner looking down sees no trail.
    expect(deduce({ ...base, clues: [{ kind: 'scarecrow', cell: 0, dir: 2, n: 0 }, { kind: 'scarecrow', cell: 2, dir: 2, n: 0 }] }, 0).solved).toBe(true);
    // An acorn there instead can't be: the solver finds nothing fits.
    expect(deduce({ ...base, clues: [{ kind: 'acorn', cell: 4 }, { kind: 'pebble', cell: 4 }] }, 0).stuck).toBe(true);
  });

  it('make every chapter of the book, each puzzle solved by rules to its own trail', () => {
    CHAPTERS.forEach((ch, i) => {
      const ps = chapterPuzzles(i);
      expect(ps).toHaveLength(ch.count);
      for (const p of ps) {
        const d = deduce(p, ch.shape.depth);
        expect(d.solved).toBe(true);
        expect(p.trail.every((c) => d.marks[c] === TRAIL)).toBe(true);
        expect(d.marks.filter((m) => m === TRAIL)).toHaveLength(p.trail.length);
        for (const k of ch.shape.feature) expect(p.clues.filter((c) => c.kind === k).length).toBeGreaterThanOrEqual(ch.shape.minFeature);
        if (ch.shape.depth === 0) expect(d.tries).toBe(0);
        else expect(d.tries).toBeLessThanOrEqual(ch.shape.maxTries ?? Infinity);
      }
      // The gentlest first.
      const efforts = ps.map((p) => deduce(p, ch.shape.depth).effort);
      expect(efforts).toEqual(efforts.slice().sort((x, y) => x - y));
    });
  });

  it('make the same daily puzzles for everyone, at every size', () => {
    for (const day of ['2026-11-06', '2026-11-07', '2027-01-01']) {
      for (const d of DAILY) {
        const p = dailyPuzzle(day, d.size);
        expect(puzzleOf(stream(`dewfall.daily:${day}`, d.size), d.shape)).toEqual(p);
        expect([p.width, p.height]).toEqual([d.shape.width, d.shape.height]);
        expect(deduce(p, d.shape.depth).solved).toBe(true);
      }
    }
    expect(dailyPuzzle('2026-11-06', 'small')).not.toEqual(dailyPuzzle('2026-11-07', 'small'));
  });
});

describe('Dewfall attempts', () => {
  const id = bookId(1, 1);
  const p = puzzleById(id)!;
  const on = new Set(p.trail);

  it('paint, skip known squares, fill settled lines, and know when solved', () => {
    let a = newAttempt(id, p);
    // Painting the entry (known trail) changes nothing.
    a = actDew(p, a, { type: 'paint', cells: [p.entry], mark: CLEAR }).attempt;
    expect(shownMarks(p, a)[p.entry]).toBe(TRAIL);
    // A row whose count isn't settled refuses to fill.
    const r = p.rows.findIndex((n, i) => n !== null && n > 0 && n < p.width - p.clues.filter((c) => Math.floor(c.cell / p.width) === i).length);
    const refused = actDew(p, a, { type: 'fill', axis: 'rows', index: r });
    if (!refused.ok) expect(refused.reason).toMatch(/isn't settled/);
    // Mark the trail: solved, and further marks are refused.
    a = actDew(p, a, { type: 'paint', cells: p.trail, mark: TRAIL }).attempt;
    expect(a.solved).toBe(true);
    expect(actDew(p, a, { type: 'reset' }).ok).toBe(false);
  });

  it('fill a row with clear once its count is met', () => {
    let a = newAttempt(id, p);
    const r = p.rows.findIndex((n) => n !== null);
    const inRow = p.trail.filter((c) => Math.floor(c / p.width) === r);
    a = actDew(p, a, { type: 'paint', cells: inRow, mark: TRAIL }).attempt;
    const res = actDew(p, a, { type: 'fill', axis: 'rows', index: r });
    if (res.ok) {
      const row = Array.from({ length: p.width }, (_, k) => r * p.width + k);
      expect(row.every((c) => shownMarks(p, res.attempt)[c] !== UNKNOWN)).toBe(true);
      expect(row.filter((c) => shownMarks(p, res.attempt)[c] === TRAIL).sort()).toEqual(inRow.slice().sort());
    }
  });

  it('light a wrong mark first, then a square the clues decide', () => {
    let a = newAttempt(id, p);
    const offTrail = Array.from({ length: p.width * p.height }, (_, c) => c).find((c) => !on.has(c) && shownMarks(p, a)[c] === UNKNOWN)!;
    a = actDew(p, a, { type: 'paint', cells: [offTrail], mark: TRAIL }).attempt;
    expect(lanternSquare(p, a)).toBe(offTrail);
    const lit = actDew(p, a, { type: 'lantern' });
    expect(lit.lit).toBe(offTrail);
    expect(shownMarks(p, lit.attempt)[offTrail]).toBe(CLEAR);
    // Now every mark is right: the next square lit is one deduction from what's shown.
    const next = lanternSquare(p, lit.attempt);
    const d = deduce(p, 0, shownMarks(p, lit.attempt));
    expect(d.order).toContain(next);
    // Lighting until nothing is left solves the puzzle.
    let b = lit.attempt;
    for (let i = 0; i < p.width * p.height && !b.solved; i++) b = actDew(p, b, { type: 'lantern' }).attempt;
    expect(b.solved).toBe(true);
    expect(isSolved(p, b)).toBe(true);
  });
});

describe('the Dewfall profile', () => {
  it('keeps the better stars, opens chapters, counts the daily streak', () => {
    let prof = newDewProfile();
    expect(chapterOpen(prof, 0)).toBe(true);
    expect(chapterOpen(prof, 1)).toBe(false);
    expect(nextInBook(prof)).toBe(bookId(0, 1));
    for (let n = 1; n <= UNLOCK_AFTER; n++) prof = recordSolve(prof, bookId(0, n), n === 1);
    expect(prof.stars[bookId(0, 1)]).toBe(1);
    prof = recordSolve(prof, bookId(0, 1), false);
    prof = recordSolve(prof, bookId(0, 1), true);
    expect(prof.stars[bookId(0, 1)]).toBe(2);
    expect(chapterOpen(prof, 1)).toBe(true);
    expect(nextInBook(prof)).toBe(bookId(0, UNLOCK_AFTER + 1));
    expect(afterInBook(prof, bookId(0, CHAPTERS[0]!.count))).toBe(bookId(1, 1));
    expect(afterInBook(prof, bookId(1, CHAPTERS[1]!.count))).toBe(null);

    prof = recordSolve(prof, dailyId('2026-11-04', 'small'), false);
    prof = recordSolve(prof, dailyId('2026-11-05', 'large'), true);
    expect(dailyStreak(prof, '2026-11-05')).toBe(2);
    expect(dailyStreak(prof, '2026-11-06')).toBe(2);
    expect(dailyStreak(prof, '2026-11-07')).toBe(0);
    prof = recordSolve(prof, dailyId('2026-11-06', 'medium'), false);
    expect(dailyStreak(prof, '2026-11-06')).toBe(3);
    expect(prof.daily['2026-11-06']).toEqual(['medium']);
  });

  it('reads puzzle ids back, and refuses ones that name nothing', () => {
    expect(parseId(bookId(2, 4))).toEqual({ kind: 'book', chapter: 2, n: 4 });
    expect(parseId(dailyId('2026-11-06', 'large'))).toEqual({ kind: 'daily', day: '2026-11-06', size: 'large' });
    expect(parseId('book:nope:1')).toBe(null);
    expect(parseId('book:dew:99')).toBe(null);
    expect(parseId('daily:2026-11-06:huge')).toBe(null);
  });
});
