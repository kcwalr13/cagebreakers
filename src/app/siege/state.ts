/**
 * Garden Siege in the app: the saved season, the piece picked up, strokes of planting, undo while
 * building, and the wave being played. Every rule is asked of src/core/siege; a wave is stepped here
 * only to be shown.
 */
import { batch, computed, effect, signal } from '@preact/signals';
import { DEFENDERS, type DefenderId, type Element, ELEMENTS, SIEGE, WAVES } from '../../content/siege';
import { normalizeSeed } from '../../core/seed';
import { type SiegeAction, type SiegeState, type WaveRecord, actSiege, finishWave, newSiege, siegeScore, startWave } from '../../core/siege/run';
import { type Strike, type WaveSim, runWave, stepWave } from '../../core/siege/sim';
import { buzz } from '../settings';
import { play } from '../sound';
import { freshSeed } from '../state';
import { readJson, storage, writeJson } from '../storage';

export const SIEGE_KEY = 'cagebreakers.siege';
export const SIEGE_BEST_KEY = 'cagebreakers.siege.best';

function load(): SiegeState | null {
  const s = readJson<SiegeState>(SIEGE_KEY);
  // A season from before brambles and elements (v1) is dropped.
  return s && s.v === 2 && normalizeSeed(s.seed) && Array.isArray(s.placed) && Array.isArray(s.elements) ? s : null;
}

export const siege = signal<SiegeState | null>(load());
effect(() => { const s = siege.value; if (s) writeJson(SIEGE_KEY, s); else storage.remove(SIEGE_KEY); });

export const siegeBest = signal<number>(readJson<{ best?: number }>(SIEGE_BEST_KEY)?.best ?? 0);
effect(() => writeJson(SIEGE_BEST_KEY, { best: siegeBest.value }));

/** A planted piece picked up, by id: its reach shows, and it can be grown, upgraded or sold. */
export const selected = signal<number | null>(null);
export const siegeMessage = signal<{ text: string; warn: boolean; id: number } | null>(null);
export const refusedAt = signal<{ cell: number; id: number } | null>(null);
/** Seasons before each change since the last wave, for undo. In memory only. */
const history = signal<SiegeState[]>([]);
export const canUndo = computed(() => history.value.length > 0);

/** The wave being played: stepped in the app, finished by the core. */
export interface Playing { sim: WaveSim; before: SiegeState; id: number; strikes: { s: Strike; until: number }[] }
export const playing = signal<Playing | null>(null);
export const speed = signal<1 | 2 | 4>(1);
export const paused = signal(false);
/** Bumped every time the wave moves on, so the field redraws. */
export const frame = signal(0);
/** The last wave's outcome, shown until something else is. */
export const lastWave = signal<WaveRecord | null>(null);

let messageId = 0;
let messageTimer: ReturnType<typeof setTimeout> | undefined;
export function saySiege(text: string, warn = false, ms = 2800) {
  siegeMessage.value = { text, warn, id: ++messageId };
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => (siegeMessage.value = null), ms);
}

export function startSiege(seed = freshSeed()) {
  batch(() => {
    siege.value = newSiege(seed, `g${seed}${Date.now().toString(36)}`);
    selected.value = null; playing.value = null; siegeMessage.value = null; lastWave.value = null; paused.value = false; history.value = [];
  });
}

/** Applies an action. `undoable` keeps the season before it for undo; a refusal explains itself. */
export function doSiege(a: SiegeAction, cell = -1, undoable = true): boolean {
  const s = siege.value;
  if (!s) return false;
  const r = actSiege(s, a);
  if (!r.ok) {
    if (cell >= 0) refusedAt.value = { cell, id: ++messageId };
    saySiege(r.reason ?? "That can't be done.", true);
    buzz([30, 30, 30]); play('refuse');
    return false;
  }
  batch(() => {
    if (undoable) history.value = [...history.value.slice(-99), s];
    siege.value = r.state;
    lastWave.value = null;
  });
  return true;
}

export function undo() {
  const h = history.value;
  if (!h.length || playing.value) return;
  batch(() => { siege.value = h[h.length - 1]!; history.value = h.slice(0, -1); selected.value = null; });
  buzz(5);
}

/** A stroke of planting brambles: the squares it has passed, and the season before it. */
let stroke: { seen: Set<number>; before: SiegeState } | null = null;

/** A press on a square: picks up what's there, puts down what's held, or starts planting brambles. */
export function pressField(cell: number) {
  const s = siege.value;
  if (!s || s.phase !== 'build' || playing.value) return;
  const here = s.placed.find((p) => p.cell === cell);
  if (here) { selected.value = selected.value === here.id ? null : here.id; return; }
  if (selected.value !== null) { selected.value = null; return; }
  stroke = { seen: new Set([cell]), before: s };
  plantAt(cell);
}

/** Dragging on: plants brambles on the empty squares the stroke passes. */
export function dragField(cell: number) {
  if (!stroke || stroke.seen.has(cell)) return;
  stroke.seen.add(cell);
  const s = siege.value;
  if (!s || s.placed.some((p) => p.cell === cell)) return;
  plantAt(cell);
}

function plantAt(cell: number) {
  if (doSiege({ type: 'plant', cell }, cell, false)) { play('place'); buzz(5); }
}

/** Ends a stroke: everything it planted is one undo step. */
export function releaseField() {
  if (!stroke) return;
  const { before } = stroke;
  stroke = null;
  if (siege.value !== before) history.value = [...history.value.slice(-99), before];
}

export function growSelected(into: DefenderId) {
  const id = selected.value;
  if (id !== null && doSiege({ type: 'grow', id, into })) { play('seal'); buzz(12); }
}
export function upgradeSelected() {
  const id = selected.value;
  if (id !== null && doSiege({ type: 'upgrade', id })) { play('buy'); buzz(10); }
}
export function sellSelected() {
  const id = selected.value;
  if (id !== null && doSiege({ type: 'sell', id })) { selected.value = null; play('pick'); }
}
export function unlockElement(e: Element) {
  if (doSiege({ type: 'unlock', element: e })) {
    play('seal'); buzz([10, 30, 10]);
    saySiege(`${ELEMENTS[e].name} unlocked: grow brambles into ${DEFENDERS[ELEMENTS[e].defender].name.toLowerCase()}s.`);
  }
}

/** Lets the next wave come: it plays out on the field, stepped by `advance`. */
export function beginWave() {
  const s = siege.value;
  if (!s || s.phase !== 'build' || playing.value) return;
  batch(() => {
    selected.value = null; lastWave.value = null; paused.value = false; siegeMessage.value = null; history.value = [];
    playing.value = { sim: startWave(s), before: s, id: ++messageId, strikes: [] };
  });
  play('fall');
}

/** Moves the wave on by `ms` of real time, at the chosen speed. Returns false once it's over. */
let carry = 0;
export function advance(ms: number, now: number): boolean {
  const p = playing.value;
  if (!p) return false;
  if (paused.value) return true;
  carry += (ms / 1000) * speed.value / SIEGE.tick;
  let steps = Math.floor(carry);
  carry -= steps;
  // A long gap between frames (the phone slept) doesn't fast-forward more than a few seconds of the wave.
  steps = Math.min(steps, Math.round(4 / SIEGE.tick));
  for (let i = 0; i < steps && !p.sim.done; i++) {
    stepWave(p.sim);
    for (const st of p.sim.strikes) p.strikes.push({ s: st, until: now + 140 });
  }
  p.strikes = p.strikes.filter((x) => x.until > now);
  frame.value++;
  if (p.sim.done) { endWave(); return false; }
  return true;
}

/** Plays the rest of the wave at once. */
export function finishNow() {
  const p = playing.value;
  if (!p) return;
  runWave(p.sim);
  endWave();
}

function endWave() {
  const p = playing.value;
  if (!p) return;
  const { state, record } = finishWave(p.before, p.sim);
  batch(() => {
    siege.value = state;
    playing.value = null;
    lastWave.value = record;
    carry = 0;
    if (state.phase !== 'build') siegeBest.value = Math.max(siegeBest.value, siegeScore(state).total);
  });
  if (state.phase === 'lost') play('lose');
  else if (state.phase === 'won') play('win');
  else if (record.eaten) { play('refuse'); buzz([40, 40]); } else play('seal');
}

/** Where the season stands, for the title. */
export const siegeNote = computed(() => {
  const s = siege.value;
  if (s && s.phase === 'build') return `Wave ${s.wave} of ${WAVES.length}, ${s.seedlings} seedlings, ${s.coins} coins.`;
  return siegeBest.value ? `Best season ${siegeBest.value}.` : '';
});

// Automated tests drive the season through these hooks.
if (typeof location === 'object' && new URLSearchParams(location.search).has('test')) {
  (window as unknown as { __siege: unknown }).__siege = {
    state: () => siege.value,
    act: (a: SiegeAction) => doSiege(a),
    press: pressField,
    start: startSiege,
    wave: beginWave,
    finish: finishNow,
    playing: () => playing.value !== null,
    /** Sets coins, to try things the season wouldn't afford yet. */
    coins: (n: number) => { siege.value = { ...siege.value!, coins: n }; },
  };
}
