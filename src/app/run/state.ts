import { batch, computed, effect, signal } from '@preact/signals';
import { type Posted, isMet, viewOf } from '../../core/commission';
import { CELLS } from '../../core/grid';
import { hintFor } from '../../core/rules';
import type { CellHint } from '../PageView';
import type { StationId } from '../../content/stations';
import { setupFor } from '../../core/meta';
import {
  type RoundRecord, type RunAction, type RunState, act, inkBlocker, legalCells, migrateRun, newRun, runPage, scoreOf, valuesOf,
} from '../../core/run';
import { profile, runId, settle } from '../meta';
import { dailySeed, normalizeSeed } from '../../core/seed';
import { drag } from '../input';
import { sheet } from '../nav';
import { buzz } from '../settings';
import { play } from '../sound';
import { freshSeed } from '../state';
import { readJson, storage, writeJson } from '../storage';

/** Two runs can be in progress at once: your own, and today's Daily Page. */
export type Slot = 'main' | 'daily';
export const SAVE_KEYS: Record<Slot, string> = { main: 'cagebreakers.run', daily: 'cagebreakers.daily' };
const SLOT_KEY = 'cagebreakers.slot';
const BEST_KEY = 'cagebreakers.daily.best';

/** A saved run, or null. Runs saved before the commissions build can't continue and read as none. */
export function loadSlot(sl: Slot): RunState | null {
  const s = migrateRun(readJson<unknown>(SAVE_KEYS[sl]));
  return s && normalizeSeed(s.seed) ? s : null;
}

export const slot = signal<Slot>(readJson<{ slot?: Slot }>(SLOT_KEY)?.slot === 'daily' ? 'daily' : 'main');
export const run = signal<RunState | null>(loadSlot(slot.value));
// A battle-era save in the other slot is cleared too, so it never shows up as a run to continue.
for (const sl of ['main', 'daily'] as Slot[]) if (storage.get(SAVE_KEYS[sl]) && !loadSlot(sl)) storage.remove(SAVE_KEYS[sl]);
storage.remove('cagebreakers.codex');

/** The number in hand, by token id. */
export const selection = signal<number | null>(null);
/** A tool waiting for its target: the Lens wants an empty cell, the Eraser a printed number. */
export const aim = signal<'lens' | 'eraser' | null>(null);
/** The commission lit up on the page. */
export const focus = signal<number | null>(null);
export const message = signal<{ text: string; warn: boolean; id: number } | null>(null);
export const justPlaced = signal(-1);
export const justSealed = signal<Set<number>>(new Set());
export const refused = signal<{ cell: number; id: number } | null>(null);
/** The round just inked, for the result sheet: what was posted, what was met, what it paid. */
/**
 * Set when the week's summary closes and the garden moves on to a new week, so the round screen
 * can show the change: the board itself looks the same, so the new week needs announcing.
 */
export const weekTurn = signal<{ id: number; round: number } | null>(null);
let turns = 0;
let shownSheet = sheet.peek();
effect(() => {
  const now = sheet.value;
  const s = run.peek();
  if (shownSheet?.kind === 'round' && now?.kind !== 'round' && s?.phase === 'arrange') weekTurn.value = { id: ++turns, round: s.round };
  shownSheet = now;
});

export const lastInk = signal<{ record: RoundRecord; posted: Posted[]; met: boolean[]; spare: number[] } | null>(null);

effect(() => {
  const s = run.value, key = SAVE_KEYS[slot.value];
  if (s) writeJson(key, s); else storage.remove(key);
  writeJson(SLOT_KEY, { slot: slot.value });
});

/** Your best result on each day's page. */
export interface DailyBest { score: number; done: boolean; round: number }
const savedBest = readJson<Record<string, Partial<DailyBest>>>(BEST_KEY) ?? {};
export const dailyBest = signal<Record<string, DailyBest>>(
  Object.fromEntries(Object.entries(savedBest).filter(([, b]) => typeof b.score === 'number')) as Record<string, DailyBest>,
);
effect(() => {
  const s = run.value;
  if (!s?.daily || s.phase === 'arrange') return;
  const now: DailyBest = { score: scoreOf(s).total, done: s.phase === 'done', round: s.records.length };
  const prev = dailyBest.peek()[s.daily];
  if (!prev || now.score > prev.score) {
    dailyBest.value = { ...dailyBest.peek(), [s.daily]: now };
    writeJson(BEST_KEY, dailyBest.value);
  }
});

/** Today's date on this phone, as the Daily Page names it. */
export function today(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resetView() {
  selection.value = null; aim.value = null; focus.value = null; lastInk.value = null;
}

/** Switches to a slot, resuming whatever run it holds. */
export function openSlot(sl: Slot) {
  batch(() => { slot.value = sl; run.value = loadSlot(sl); resetView(); });
}

/** Opens today's Daily Page, continuing it if already begun (or starting it over when asked). */
export function startDaily(day = today(), fresh = false) {
  const saved = loadSlot('daily');
  batch(() => {
    slot.value = 'daily';
    run.value = saved?.daily === day && !fresh ? saved : newRun(dailySeed(day), { daily: day, id: runId() });
    resetView();
  });
}

/** Starts a run at a map station, with the satchel and upgrades from the scriptorium. */
export function startStation(station: StationId, seed = freshSeed()) {
  batch(() => { slot.value = 'main'; run.value = newRun(seed, { setup: setupFor(profile.value, station), id: runId() }); resetView(); });
}

/** Starts a run at the first station. */
export function startRun(seed = freshSeed()) {
  startStation('copy-desk', seed);
}

export function abandonRun() {
  batch(() => { run.value = null; resetView(); });
}

export const page = computed(() => (run.value ? runPage(run.value) : null));

// A finished run is counted into the scriptorium once.
effect(() => {
  const s = run.value;
  if (s && s.phase !== 'arrange') settle(s, today());
});
export const values = computed(() => (run.value ? valuesOf(run.value) : new Array<number>(CELLS).fill(0)));
export const view = computed(() => (page.value ? viewOf(page.value, values.value) : null));
export const sealed = computed(() => view.value?.sealed ?? new Set<number>());
/** For each posted commission, whether the page meets it right now. */
export const met = computed(() => {
  const s = run.value, v = view.value;
  return s && v ? s.posted.map((p) => isMet(p.c, v)) : [];
});
export const blocker = computed(() => (run.value ? inkBlocker(run.value) : null));
export const revealed = computed(() => {
  const s = run.value, p = page.value;
  return new Map((s?.revealed ?? []).map((c) => [c, p!.solution[c]!]));
});

/** The number in hand: dragged or selected, with the cell it would leave. */
export const holding = computed<{ id: number; n: number; origin: number } | null>(() => {
  const s = run.value;
  if (!s) return null;
  const d = drag.value;
  let id: number | null = null;
  if (d) {
    const from = d.from;
    id = from.kind === 'item' ? Number(from.key) : s.tokens.find((t) => t.cell === from.cell)?.id ?? null;
  }
  else id = selection.value;
  const t = id === null ? undefined : s.tokens.find((x) => x.id === id);
  return t ? { id: t.id, n: t.n, origin: t.cell } : null;
});

/** Cells the number in hand could move to, swaps included. */
export const legal = computed(() => {
  const s = run.value, h = holding.value;
  return s && h ? new Set(legalCells(s, h.id)) : null;
});

/**
 * Where the number in hand can go: open cells (gold when it would seal the cage), swaps with the
 * number standing there, and blocked cells, shaded. The cell it's leaving is left plain.
 */
export const hints = computed<(CellHint | null)[]>(() => {
  const p = page.value, h = holding.value, vals = values.value, ok = legal.value;
  return Array.from({ length: CELLS }, (_, c) => {
    if (!p || !h || !ok || c === h.origin) return null;
    if (!ok.has(c)) return 'blocked';
    if (vals[c]) return 'swap';
    return hintFor(p, vals, c, h.n, h.origin) === 'seals' ? 'seals' : 'open';
  });
});

/** The cells holding the same number as the one in hand: they're what blocks the shaded cells. */
export const blockers = computed(() => {
  const h = holding.value, vals = values.value;
  if (!h) return undefined;
  return new Set(Array.from({ length: CELLS }, (_, c) => c).filter((c) => c !== h.origin && vals[c] === h.n));
});

let messageId = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
export function say(text: string, warn = false, ms = 2800) {
  message.value = { text, warn, id: ++messageId };
  clearTimeout(timer);
  timer = setTimeout(() => (message.value = null), ms);
}

/** Applies an action. Refusals explain themselves; seals that form or break are heard. */
export function dispatch(a: RunAction, cell = -1): boolean {
  const s = run.value;
  if (!s) return false;
  const r = act(s, a);
  if (!r.ok) {
    if (cell >= 0) refused.value = { cell, id: Date.now() };
    say(r.reason ?? "That can't be done.", true);
    buzz([30, 30, 30]); play('refuse');
    return false;
  }
  const before = sealed.value;
  const beforeMet = met.value;
  batch(() => {
    run.value = r.state;
    if (a.type === 'place') justPlaced.value = a.id;
    if (a.type !== 'place') selection.value = null;
  });
  if (r.inked) {
    lastInk.value = { record: r.inked, posted: s.posted, met: beforeMet, spare: s.tokens.filter((t) => t.cell < 0).map((t) => t.n).sort() };
    focus.value = null;
    if (r.state.phase === 'done') play('win');
    else if (r.state.phase === 'ruined') play('lose');
    else if (r.inked.inkSpilled) { play('fall'); buzz([40, 60, 40]); }
    else { play('pick'); buzz(12); }
    sheet.value = { kind: 'round' };
    return true;
  }
  const now = sealed.value;
  const newly = new Set([...now].filter((id) => !before.has(id)));
  const broke = [...before].some((id) => !now.has(id));
  if (newly.size) {
    justSealed.value = newly;
    buzz([12, 40, 18]); play('seal');
    setTimeout(() => { if (justSealed.value === newly) justSealed.value = new Set(); }, 1200);
  } else if (broke) { buzz(16); play('shatter'); }
  else if (a.type === 'place') { buzz(8); play('place'); }
  else play('buy');
  return true;
}

/** Moves a number to a cell, or into your hand with -1. */
export function placeToken(id: number, cell: number): boolean {
  return dispatch({ type: 'place', id, cell }, cell);
}

/** The layout before All to hand, so it can be put back until anything else changes. */
const cleared = signal<{ from: RunState; cells: [number, number][] } | null>(null);
export const canPutBack = computed(() => !!cleared.value && cleared.value.from === run.value);

/** Takes every number off the page into your hand. */
export function clearPage() {
  const s = run.value;
  if (!s) return;
  const cells = s.tokens.filter((t) => t.cell >= 0).map((t) => [t.id, t.cell] as [number, number]);
  if (dispatch({ type: 'clear' })) cleared.value = { from: run.value!, cells };
}

/** Puts every number back where it stood before All to hand. */
export function putBack() {
  const c = cleared.value;
  let s = run.value;
  if (!c || !s || s !== c.from) return;
  for (const [id, cell] of c.cells) { const r = act(s, { type: 'place', id, cell }); if (r.ok) s = r.state; }
  batch(() => { run.value = s; cleared.value = null; selection.value = null; });
  play('place');
}

/** A tap on the page while a tool waits for its target. */
export function useAim(cell: number) {
  const tool = aim.value;
  if (!tool) return;
  if (dispatch({ type: tool, cell }, cell)) {
    aim.value = null;
    const p = page.value!;
    if (tool === 'lens') say(`Hint: a ${p.solution[cell]} belongs there.`, false, 3600);
    else say('Dug up: that number is yours now, free to move like any other.', false, 3600);
  }
}
