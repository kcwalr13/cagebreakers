/**
 * Playing Dewfall, as pure functions: the book's puzzles and the daily ones (both from fixed seeds,
 * the same for everyone), an attempt at a puzzle (the player's marks, the squares the lantern lit),
 * the actions on it, and the profile of what's been solved.
 */
import { CHAPTERS, DAILY, type DailySize, UNLOCK_AFTER } from '../../content/dewfall';
import { dayNumber } from '../calendar';
import { stream } from '../rng';
import { CLEAR, type Mark, type Puzzle, TRAIL, UNKNOWN, colCells, deduce, printedAt, puzzleBoard, puzzleOf, rowCells } from './clues';

const book = new Map<number, Puzzle[]>();

/** A chapter's puzzles, the gentlest first. */
export function chapterPuzzles(index: number): Puzzle[] {
  let ps = book.get(index);
  if (ps) return ps;
  const ch = CHAPTERS[index]!;
  const made = Array.from({ length: ch.count }, (_, k) => {
    const p = puzzleOf(stream('dewfall.book', `${ch.id}:${k}`), ch.shape);
    return { p, effort: deduce(p, ch.shape.depth).effort, k };
  });
  ps = made.sort((x, y) => x.effort - y.effort || x.k - y.k).map((x) => x.p);
  book.set(index, ps);
  return ps;
}

const dailies = new Map<string, Puzzle>();

/** The day's puzzle of a size: the same for everyone. */
export function dailyPuzzle(day: string, size: DailySize): Puzzle {
  const key = `${day}:${size}`;
  let p = dailies.get(key);
  if (!p) {
    p = puzzleOf(stream(`dewfall.daily:${day}`, size), DAILY.find((d) => d.size === size)!.shape);
    dailies.set(key, p);
  }
  return p;
}

/** Puzzles go by 'book:<chapter>:<n>' (n from 1) or 'daily:<day>:<size>'. */
export const bookId = (chapter: number, n: number) => `book:${CHAPTERS[chapter]!.id}:${n}`;
export const dailyId = (day: string, size: DailySize) => `daily:${day}:${size}`;

export type PuzzleRef =
  | { kind: 'book'; chapter: number; n: number }
  | { kind: 'daily'; day: string; size: DailySize };

export function parseId(id: string): PuzzleRef | null {
  const [kind, a, b] = id.split(':');
  if (kind === 'book') {
    const chapter = CHAPTERS.findIndex((c) => c.id === a);
    const n = Number(b);
    return chapter >= 0 && Number.isInteger(n) && n >= 1 && n <= CHAPTERS[chapter]!.count ? { kind, chapter, n } : null;
  }
  if (kind === 'daily' && /^\d{4}-\d\d-\d\d$/.test(a ?? '') && DAILY.some((d) => d.size === b)) return { kind, day: a!, size: b as DailySize };
  return null;
}

export function puzzleById(id: string): Puzzle | null {
  const ref = parseId(id);
  if (!ref) return null;
  return ref.kind === 'book' ? chapterPuzzles(ref.chapter)[ref.n - 1]! : dailyPuzzle(ref.day, ref.size);
}

/** A short fingerprint of a puzzle, so saved marks are dropped if the puzzle under an id ever changes. */
export const fingerprint = (p: Puzzle): string => `${p.width}x${p.height}:${p.trail.join('.')}:${p.clues.length}`;

export interface Attempt {
  v: 1;
  id: string;
  print: string;
  /** The player's marks: trail, clear, or nothing yet. */
  marks: Mark[];
  /** Squares the lantern lit: they show what they really are. */
  lit: number[];
  solved: boolean;
}

export function newAttempt(id: string, p: Puzzle): Attempt {
  return { v: 1, id, print: fingerprint(p), marks: new Array<Mark>(p.width * p.height).fill(UNKNOWN), lit: [], solved: false };
}

/** What a square is known to be: printed on the puzzle or lit by the lantern, or UNKNOWN. */
export function knownAt(p: Puzzle, a: Pick<Attempt, 'lit'>, cell: number): Mark {
  const printed = printedAt(p, cell);
  if (printed !== UNKNOWN) return printed;
  if (a.lit.includes(cell)) return p.trail.includes(cell) ? TRAIL : CLEAR;
  return UNKNOWN;
}

/** Every square as the player sees it: known, or as they marked it. */
export function shownMarks(p: Puzzle, a: Pick<Attempt, 'lit' | 'marks'>): Mark[] {
  return a.marks.map((m, c) => { const k = knownAt(p, a, c); return k === UNKNOWN ? m : k; });
}

/** The squares the player takes for trail. */
export function takenTrail(p: Puzzle, a: Pick<Attempt, 'lit' | 'marks'>): Set<number> {
  const out = new Set<number>();
  shownMarks(p, a).forEach((m, c) => { if (m === TRAIL) out.add(c); });
  return out;
}

/** Solved when the squares taken for trail are exactly the trail (squares left blank are fine). */
export function isSolved(p: Puzzle, a: Pick<Attempt, 'lit' | 'marks'>): boolean {
  const taken = takenTrail(p, a);
  return taken.size === p.trail.length && p.trail.every((c) => taken.has(c));
}

export type DewAction =
  /** Marks these squares (known ones are skipped). */
  | { type: 'paint'; cells: number[]; mark: Mark }
  /** Fills the rest of a settled row or column: clear when its count is met, trail when only that many squares are open. */
  | { type: 'fill'; axis: 'rows' | 'cols'; index: number }
  /** Lights a square: one marked wrong if there is one, else one the clues decide next. */
  | { type: 'lantern' }
  /** Takes every mark away. */
  | { type: 'reset' };

export interface DewResult { attempt: Attempt; ok: boolean; reason?: string; lit?: number }

const refuse = (attempt: Attempt, reason: string): DewResult => ({ attempt, ok: false, reason });

/** The square the lantern lights next, or -1 when there's nothing left to show. */
export function lanternSquare(p: Puzzle, a: Attempt): number {
  const on = new Set(p.trail);
  const b = puzzleBoard(p);
  const wrong = b.all.find((c) => knownAt(p, a, c) === UNKNOWN && a.marks[c] !== UNKNOWN && (a.marks[c] === TRAIL) !== on.has(c));
  if (wrong !== undefined) return wrong;
  // Every mark is right: show a square the clues decide from here, by rules if they can.
  const start = shownMarks(p, a);
  for (const depth of [0, 1] as const) {
    const next = deduce(p, depth, start).order.find((c) => start[c] === UNKNOWN);
    if (next !== undefined) return next;
  }
  return p.trail.find((c) => start[c] !== TRAIL) ?? -1;
}

export function actDew(p: Puzzle, prev: Attempt, act: DewAction): DewResult {
  if (prev.solved) return refuse(prev, 'This one is solved');
  const a: Attempt = { ...prev, marks: prev.marks.slice(), lit: prev.lit.slice() };
  const b = puzzleBoard(p);
  switch (act.type) {
    case 'paint': {
      for (const c of act.cells) if (c >= 0 && c < b.cells && knownAt(p, a, c) === UNKNOWN) a.marks[c] = act.mark;
      break;
    }
    case 'fill': {
      const want = p[act.axis][act.index];
      if (want === null || want === undefined) return refuse(prev, 'That count is hidden in the mist');
      const cells = act.axis === 'rows' ? rowCells(b, act.index) : colCells(b, act.index);
      const shown = shownMarks(p, a);
      const t = cells.filter((c) => shown[c] === TRAIL).length;
      const open = cells.filter((c) => shown[c] === UNKNOWN);
      const line = act.axis === 'rows' ? 'row' : 'column';
      if (!open.length) return refuse(prev, `That ${line} is all marked`);
      if (t === want) for (const c of open) a.marks[c] = CLEAR;
      else if (t + open.length === want) for (const c of open) a.marks[c] = TRAIL;
      else return refuse(prev, `That ${line} isn't settled yet: ${want - t} more trail ${want - t === 1 ? 'square' : 'squares'} among ${open.length}`);
      break;
    }
    case 'lantern': {
      const c = lanternSquare(p, a);
      if (c < 0) return refuse(prev, 'Nothing left to light');
      a.lit.push(c);
      a.marks[c] = UNKNOWN;
      a.solved = isSolved(p, a);
      return { attempt: a, ok: true, lit: c };
    }
    case 'reset': {
      a.marks.fill(UNKNOWN);
      break;
    }
  }
  a.solved = isSolved(p, a);
  return { attempt: a, ok: true };
}

/** What the player has done in Dewfall. */
export interface DewProfile {
  v: 1;
  /** Puzzles solved: 2 without the lantern, 1 with it. */
  stars: Record<string, 1 | 2>;
  /** Days, and the daily sizes solved on them. */
  daily: Record<string, DailySize[]>;
}

export const newDewProfile = (): DewProfile => ({ v: 1, stars: {}, daily: {} });

/** Records a solve; a better one keeps the better stars. */
export function recordSolve(prof: DewProfile, id: string, lanternUsed: boolean): DewProfile {
  const stars: 1 | 2 = lanternUsed ? 1 : 2;
  const out: DewProfile = { ...prof, stars: { ...prof.stars, [id]: Math.max(prof.stars[id] ?? 0, stars) as 1 | 2 }, daily: { ...prof.daily } };
  const ref = parseId(id);
  if (ref?.kind === 'daily' && !(out.daily[ref.day] ?? []).includes(ref.size)) out.daily[ref.day] = [...(out.daily[ref.day] ?? []), ref.size];
  return out;
}

export const solvedIn = (prof: DewProfile, chapter: number): number =>
  Array.from({ length: CHAPTERS[chapter]!.count }, (_, k) => bookId(chapter, k + 1)).filter((id) => prof.stars[id]).length;

export const starsIn = (prof: DewProfile, chapter: number): number =>
  Array.from({ length: CHAPTERS[chapter]!.count }, (_, k) => prof.stars[bookId(chapter, k + 1)] ?? 0).reduce<number>((s, x) => s + x, 0);

export const chapterOpen = (prof: DewProfile, chapter: number): boolean => chapter === 0 || solvedIn(prof, chapter - 1) >= UNLOCK_AFTER;

/** Days in a row with a daily puzzle solved, counting back from today (or from yesterday, if today has none yet). */
export function dailyStreak(prof: DewProfile, today: string): number {
  const days = new Set(Object.keys(prof.daily).filter((d) => prof.daily[d]!.length).map(dayNumber));
  let n = dayNumber(today);
  if (!days.has(n)) n--;
  let streak = 0;
  while (days.has(n)) { streak++; n--; }
  return streak;
}

/** The first puzzle in the book not solved yet, among open chapters, or null when they're all done. */
export function nextInBook(prof: DewProfile): string | null {
  for (let c = 0; c < CHAPTERS.length; c++) {
    if (!chapterOpen(prof, c)) break;
    for (let n = 1; n <= CHAPTERS[c]!.count; n++) if (!prof.stars[bookId(c, n)]) return bookId(c, n);
  }
  return null;
}

/** The puzzle after this one in the book, if it's open. */
export function afterInBook(prof: DewProfile, id: string): string | null {
  const ref = parseId(id);
  if (ref?.kind !== 'book') return null;
  if (ref.n < CHAPTERS[ref.chapter]!.count) return bookId(ref.chapter, ref.n + 1);
  return ref.chapter + 1 < CHAPTERS.length && chapterOpen(prof, ref.chapter + 1) ? bookId(ref.chapter + 1, 1) : null;
}

/** A puzzle's name for the player: 'Mist 4', or 'Daily, medium'. */
export function puzzleName(id: string): string {
  const ref = parseId(id);
  if (!ref) return 'Dewfall';
  if (ref.kind === 'book') return `${CHAPTERS[ref.chapter]!.name} ${ref.n}`;
  return `Daily Dewfall, ${DAILY.find((d) => d.size === ref.size)!.name.toLowerCase()}`;
}
