/**
 * Dewfall in the app: the profile, the saved marks on each puzzle, the puzzle open now, the brush,
 * strokes of painting, and undo. Every rule is asked of src/core/dewfall.
 */
import { batch, computed, effect, signal } from '@preact/signals';
import { CHAPTERS, DAILY, type DailySize } from '../../content/dewfall';
import { CLEAR, type Mark, type Puzzle, TRAIL, UNKNOWN } from '../../core/dewfall/clues';
import {
  type Attempt, type DewAction, type DewProfile, actDew, chapterPuzzles, dailyId, fingerprint, knownAt, newAttempt, newDewProfile, puzzleById,
  recordSolve, shownMarks,
} from '../../core/dewfall/play';
import { screen } from '../nav';
import { today } from '../run/state';
import { buzz } from '../settings';
import { play } from '../sound';
import { readJson, storage, writeJson } from '../storage';

export const DEW_KEY = 'cagebreakers.dewfall';
export const DEW_MARKS_KEY = 'cagebreakers.dewfall.marks';
export const DEW_LAST_KEY = 'cagebreakers.dewfall.last';
/** Attempts kept, most recent first; older ones are dropped. */
const KEEP = 80;

// Night Watch, which Dewfall and Garden Siege replace, kept its season here.
storage.remove('cagebreakers.watch');
storage.remove('cagebreakers.watch.best');

function loadProfile(): DewProfile {
  const p = readJson<DewProfile>(DEW_KEY);
  return p && p.v === 1 && p.stars && p.daily ? p : newDewProfile();
}
export const dewProfile = signal<DewProfile>(loadProfile());
effect(() => writeJson(DEW_KEY, dewProfile.value));

type Saved = Record<string, Attempt>;
const savedAttempts = signal<{ order: string[]; by: Saved }>(readJson<{ order: string[]; by: Saved }>(DEW_MARKS_KEY) ?? { order: [], by: {} });
effect(() => writeJson(DEW_MARKS_KEY, savedAttempts.value));

/** The puzzle open now, by id. */
export const dewId = signal<string | null>(readJson<{ id?: string }>(DEW_LAST_KEY)?.id ?? null);
effect(() => writeJson(DEW_LAST_KEY, { id: dewId.value }));

/** The saved attempt at a puzzle, if its marks still fit it. */
export function attemptOf(id: string, p: Puzzle): Attempt | null {
  const a = savedAttempts.value.by[id];
  return a && a.v === 1 && a.print === fingerprint(p) && a.marks.length === p.width * p.height ? a : null;
}

function saveAttempt(a: Attempt) {
  const { order, by } = savedAttempts.value;
  const next = [a.id, ...order.filter((x) => x !== a.id)];
  const keep = next.slice(0, KEEP);
  const out: Saved = {};
  for (const id of keep) out[id] = id === a.id ? a : by[id]!;
  savedAttempts.value = { order: keep, by: out };
}

export const puzzle = computed<Puzzle | null>(() => (dewId.value ? puzzleById(dewId.value) : null));
export const attempt = computed<Attempt | null>(() => {
  const p = puzzle.value, id = dewId.value;
  if (!p || !id) return null;
  return attemptOf(id, p) ?? newAttempt(id, p);
});

/** What a stroke paints squares with: trail or clear. */
export type Brush = typeof TRAIL | typeof CLEAR;
export const brush = signal<Brush>(TRAIL);
export const dewMessage = signal<{ text: string; warn: boolean; id: number } | null>(null);
/** The square the lantern just lit, glowing for a moment. */
export const litNow = signal<{ cell: number; id: number } | null>(null);
/** Set when the open puzzle has just been solved: the trail is shown being crawled. */
export const celebrating = signal<{ id: string; at: number } | null>(null);
/** Attempts before each change, for undo. In memory only, and only for the open puzzle. */
const undoStack = signal<Attempt[]>([]);
export const canUndo = computed(() => undoStack.value.length > 0);

let messageId = 0;
let messageTimer: ReturnType<typeof setTimeout> | undefined;
export function sayDew(text: string, warn = false, ms = 2800) {
  dewMessage.value = { text, warn, id: ++messageId };
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => (dewMessage.value = null), ms);
}

export function openPuzzle(id: string) {
  batch(() => {
    dewId.value = id;
    undoStack.value = [];
    dewMessage.value = null;
    celebrating.value = null;
    brush.value = TRAIL;
    screen.value = 'dewfall';
  });
}

export const openDaily = (size: DailySize) => openPuzzle(dailyId(today(), size));

/** Puts a changed attempt in place, and records the solve if this change solved it. */
function commit(before: Attempt, after: Attempt) {
  batch(() => {
    saveAttempt(after);
    if (after.solved && !before.solved) {
      dewProfile.value = recordSolve(dewProfile.value, after.id, after.lit.length > 0);
      celebrating.value = { id: after.id, at: ++messageId };
      play('win'); buzz([20, 40, 60]);
    }
  });
}

/** Starts a puzzle over from nothing marked (the stars it earned stay). */
export function replay(id: string) {
  const p = puzzleById(id);
  if (!p) return;
  openPuzzle(id);
  saveAttempt(newAttempt(id, p));
}

/** Applies an action, with one undo step. */
export function doDew(act: DewAction): boolean {
  const p = puzzle.value, a = attempt.value;
  if (!p || !a) return false;
  const r = actDew(p, a, act);
  if (!r.ok) { sayDew(r.reason ?? "That can't be done.", true); play('refuse'); return false; }
  if (r.attempt.marks.every((m, i) => m === a.marks[i]) && r.attempt.lit.length === a.lit.length) return true;
  undoStack.value = [...undoStack.value.slice(-199), a];
  commit(a, r.attempt);
  if (r.lit !== undefined) litNow.value = { cell: r.lit, id: ++messageId };
  return true;
}

export function undo() {
  const stack = undoStack.value;
  const prev = stack[stack.length - 1];
  if (!prev || attempt.value?.solved) return;
  undoStack.value = stack.slice(0, -1);
  saveAttempt(prev);
  buzz(5);
}

/** A stroke of painting: the mark it lays (set by the first square), and the squares it has passed. */
let stroke: { mark: Mark; seen: Set<number>; before: Attempt } | null = null;

/** Starts a stroke on a square: it marks with the brush, or clears a square already marked that way. */
export function strokeStart(cell: number) {
  const p = puzzle.value, a = attempt.value;
  if (!p || !a || a.solved) return;
  const known = knownAt(p, a, cell) !== UNKNOWN;
  const mark: Mark = !known && a.marks[cell] === brush.value ? UNKNOWN : brush.value;
  stroke = { mark, seen: new Set([cell]), before: a };
  if (known) return;
  paint(cell, mark);
}

export function strokeMove(cell: number) {
  if (!stroke || stroke.seen.has(cell)) return;
  stroke.seen.add(cell);
  const p = puzzle.value, a = attempt.value;
  if (!p || !a || a.solved || knownAt(p, a, cell) !== UNKNOWN) return;
  paint(cell, stroke.mark);
}

function paint(cell: number, mark: Mark) {
  const p = puzzle.value!, a = attempt.value!;
  if (a.marks[cell] === mark) return;
  const r = actDew(p, a, { type: 'paint', cells: [cell], mark });
  if (!r.ok) return;
  commit(a, r.attempt);
  buzz(4);
}

/** Ends a stroke: everything it painted is one undo step. */
export function strokeEnd() {
  if (!stroke) return;
  const { before } = stroke;
  stroke = null;
  const now = attempt.value;
  if (now && now !== before && now.marks.some((m, i) => m !== before.marks[i])) undoStack.value = [...undoStack.value.slice(-199), before];
  if (now && !now.solved) play('place');
}

/** Lights a square with the lantern. The first time on a puzzle, it asks first: it costs a star. */
export const lanternAsked = signal(false);
export function lantern(sure = false) {
  const a = attempt.value;
  if (!a || a.solved) return;
  if (!a.lit.length && !sure) { lanternAsked.value = true; return; }
  lanternAsked.value = false;
  if (doDew({ type: 'lantern' })) play('pick');
}

/** How many squares the player has marked, for the title and the book. */
export const markedCount = (a: Attempt | null, p: Puzzle | null) => (a && p ? shownMarks(p, a).filter((m, c) => m !== UNKNOWN && knownAt(p, a, c) === UNKNOWN).length : 0);

/** The puzzle to carry on with from the title: the last one opened, if it isn't solved. */
export const carryOn = computed(() => {
  const id = dewId.value;
  if (!id) return null;
  const p = puzzleById(id);
  if (!p) return null;
  const a = attemptOf(id, p);
  if (!a || a.solved || !markedCount(a, p)) return null;
  return { id, p, a };
});

/** Stars in the whole book, and puzzles solved. */
export const bookTotals = computed(() => {
  const prof = dewProfile.value;
  let solved = 0, stars = 0, of = 0;
  CHAPTERS.forEach((ch) => {
    of += ch.count;
    for (let n = 1; n <= ch.count; n++) { const s = prof.stars[`book:${ch.id}:${n}`]; if (s) { solved++; stars += s; } }
  });
  return { solved, stars, of };
});

export const DAILY_SIZES = DAILY.map((d) => d.size);

// Automated tests drive Dewfall through these hooks.
if (typeof location === 'object' && new URLSearchParams(location.search).has('test')) {
  (window as unknown as { __dew: unknown }).__dew = {
    puzzle: () => puzzle.value,
    attempt: () => attempt.value,
    profile: () => dewProfile.value,
    open: openPuzzle,
    act: doDew,
    /** Marks every trail square but the last unmarked one, and clears the rest. */
    nearly() {
      const p = puzzle.value!, a = attempt.value!;
      const on = new Set(p.trail);
      const rest = p.trail.filter((c) => knownAt(p, a, c) === UNKNOWN);
      const keep = rest[rest.length - 1];
      doDew({ type: 'paint', cells: rest.filter((c) => c !== keep), mark: TRAIL });
      doDew({ type: 'paint', cells: Array.from({ length: p.width * p.height }, (_, c) => c).filter((c) => !on.has(c)), mark: CLEAR });
      return keep;
    },
    chapter: (i: number) => chapterPuzzles(i).length,
  };
}
