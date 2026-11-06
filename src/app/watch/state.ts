/**
 * Night Watch in the app: the saved season, the tool in hand, the defender picked up to move,
 * and the night being shown. Every rule is asked of src/core/watch.
 */
import { batch, computed, effect, signal } from '@preact/signals';
import { DEFENDERS, type DefenderId, PESTS, WATCH } from '../../content/watch';
import {
  CLEAR, type NightRecord, TRAIL, UNKNOWN, type WatchAction, type WatchState, actWatch, knownAt, newWatch, readout as readoutOf, watchBoard as watchBoardOf,
  watchScore,
} from '../../core/watch/run';
import { normalizeSeed } from '../../core/seed';
import { buzz } from '../settings';
import { play } from '../sound';
import { freshSeed } from '../state';
import { readJson, storage, writeJson } from '../storage';

export const WATCH_KEY = 'cagebreakers.watch';
export const WATCH_BEST_KEY = 'cagebreakers.watch.best';

function load(): WatchState | null {
  const s = readJson<WatchState>(WATCH_KEY);
  return s && s.v === 1 && normalizeSeed(s.seed) && Array.isArray(s.marks) && s.current?.trail ? s : null;
}

export const watch = signal<WatchState | null>(load());
effect(() => { const s = watch.value; if (s) writeJson(WATCH_KEY, s); else storage.remove(WATCH_KEY); });

export const watchBest = signal<number>(readJson<{ best?: number }>(WATCH_BEST_KEY)?.best ?? 0);
effect(() => writeJson(WATCH_BEST_KEY, { best: watchBest.value }));

/** What a tap on a misty square does: mark it, plant a defender, or light it with the lantern. */
export type WatchTool = 'mark' | DefenderId | 'lantern';
export const tool = signal<WatchTool>('mark');
/** A defender picked up to move, by id. */
export const holding = signal<number | null>(null);
export const watchMessage = signal<{ text: string; warn: boolean; id: number } | null>(null);
/** The night being shown: the garden as it was at dusk, and what happened. */
export const playback = signal<{ before: WatchState; record: NightRecord; id: number } | null>(null);
/** A square that refused something, flashed briefly. */
export const refusedAt = signal<{ cell: number; id: number } | null>(null);

let messageId = 0;
let messageTimer: ReturnType<typeof setTimeout> | undefined;
export function sayWatch(text: string, warn = false, ms = 2600) {
  watchMessage.value = { text, warn, id: ++messageId };
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => (watchMessage.value = null), ms);
}

export function startWatch(seed = freshSeed()) {
  batch(() => {
    watch.value = newWatch(seed, `w${seed}${Date.now().toString(36)}`);
    tool.value = 'mark'; holding.value = null; playback.value = null; watchMessage.value = null;
  });
}

/** Applies an action; a refusal explains itself. */
export function doWatch(a: WatchAction, cell = -1): boolean {
  const s = watch.value;
  if (!s) return false;
  const r = actWatch(s, a);
  if (!r.ok) {
    if (cell >= 0) refusedAt.value = { cell, id: ++messageId };
    sayWatch(r.reason ?? "That can't be done.", true);
    buzz([30, 30, 30]); play('refuse');
    return false;
  }
  watch.value = r.state;
  return true;
}

/** A tap on a square of the garden. */
export function tapSquare(cell: number) {
  const s = watch.value;
  if (!s || s.phase !== 'plan' || playback.value) return;
  const here = s.defenders.find((d) => d.cell === cell);
  const held = holding.value === null ? null : s.defenders.find((d) => d.id === holding.value) ?? null;
  if (held) {
    if (here?.id === held.id) { holding.value = null; return; }
    if (here) { holding.value = here.id; return; }
    if (doWatch({ type: 'move', id: held.id, cell }, cell)) { holding.value = null; play('place'); buzz(8); }
    return;
  }
  if (here) { holding.value = here.id; return; }
  const t = tool.value;
  if (t === 'mark') {
    if (knownAt(s, cell) !== null) { sayWatch(knownAt(s, cell) === 'trail' ? 'That square is known to be trail.' : 'That square is known to be clear.'); return; }
    const m = s.marks[cell];
    doWatch({ type: 'mark', cell, mark: m === UNKNOWN ? TRAIL : m === TRAIL ? CLEAR : UNKNOWN });
    buzz(5);
    return;
  }
  if (t === 'lantern') {
    if (doWatch({ type: 'lantern', cell }, cell)) { tool.value = 'mark'; play('seal'); }
    return;
  }
  if (doWatch({ type: 'plant', kind: t, cell }, cell)) {
    play('place'); buzz(8);
    const left = watch.value!.coins;
    if (left < DEFENDERS[t].cost) tool.value = 'mark';
  }
}

/** Takes back the defender in hand, planted tonight, for its price. */
export function liftHeld() {
  const id = holding.value;
  if (id !== null && doWatch({ type: 'lift', id })) holding.value = null;
}

/** Lets the pests come: the night resolves at once, and is then shown. */
export function letThemCome() {
  const before = watch.value;
  if (!before || before.phase !== 'plan') return;
  const r = actWatch(before, { type: 'dusk' });
  if (!r.ok || !r.night) return;
  batch(() => {
    holding.value = null; tool.value = 'mark';
    playback.value = { before, record: r.night!, id: ++messageId };
    watch.value = r.state;
    if (r.state.phase !== 'plan') watchBest.value = Math.max(watchBest.value, watchScore(r.state).total);
  });
}

export function endPlayback() { playback.value = null; }

export const pestLine = (kinds: readonly (keyof typeof PESTS)[]): string => {
  const counts = new Map<string, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts].map(([k, n]) => `${n} ${n === 1 ? PESTS[k as keyof typeof PESTS].name.toLowerCase() : PESTS[k as keyof typeof PESTS].plural}`).join(' and ');
};

/** The season's best, and what's saved, for the title. */
export const watchNote = computed(() => {
  const s = watch.value;
  if (s && s.phase === 'plan') return `Night ${s.night} of ${WATCH.nights}, ${s.seedlings} ${s.seedlings === 1 ? 'seedling' : 'seedlings'} left.`;
  return watchBest.value ? `Best season ${watchBest.value}.` : 'Six nights in a season.';
});

// Automated tests drive the season through these hooks.
if (typeof location === 'object' && new URLSearchParams(location.search).has('test')) {
  (window as unknown as { __watch: unknown }).__watch = {
    state: () => watch.value,
    act: (a: WatchAction) => doWatch(a),
    tap: tapSquare,
    start: startWatch,
    dusk: letThemCome,
    skip: endPlayback,
    /** Marks tonight's real trail, clears the rest, and plants frogs beside it until every pest is stopped. */
    solve() {
      let s = watch.value!;
      const b = watchBoardOf();
      const on = new Set(s.current.trail);
      for (const c of b.all) if (knownAt(s, c) === null) s = actWatch(s, { type: 'mark', cell: c, mark: on.has(c) ? TRAIL : CLEAR }).state;
      const covers = (c: number) => b.around[c]!.filter((x) => on.has(x)).length;
      for (const d of s.defenders.slice()) {
        const spot = b.all.filter((c) => !on.has(c) && !s.defenders.some((x) => x.cell === c && x.id !== d.id)).sort((p, q) => covers(q) - covers(p))[0]!;
        const r = actWatch(s, { type: 'move', id: d.id, cell: spot });
        if (r.ok) s = r.state;
      }
      for (let i = 0; i < 20 && !readoutOf(s).every((r) => r.harm >= r.hp); i++) {
        const spot = b.all.filter((c) => !on.has(c) && !s.defenders.some((x) => x.cell === c)).sort((p, q) => covers(q) - covers(p))[0]!;
        const r = actWatch(s, { type: 'plant', kind: 'frog', cell: spot });
        if (!r.ok) break;
        s = r.state;
      }
      watch.value = s;
    },
  };
}
