/**
 * Garden Siege in the app: the saved season, the tool in hand, the piece picked up, and the wave
 * being played. Every rule is asked of src/core/siege; a wave is stepped here only to be shown.
 */
import { batch, computed, effect, signal } from '@preact/signals';
import { DEFENDERS, type DefenderId, SIEGE } from '../../content/siege';
import { normalizeSeed } from '../../core/seed';
import {
  type PieceKind, type SiegeAction, type SiegeState, type WaveRecord, actSiege, costOf, finishWave, newSiege, refundOf, siegeScore, startWave,
} from '../../core/siege/run';
import { type Strike, type WaveSim, runWave, stepWave } from '../../core/siege/sim';
import { buzz } from '../settings';
import { play } from '../sound';
import { freshSeed } from '../state';
import { readJson, storage, writeJson } from '../storage';

export const SIEGE_KEY = 'cagebreakers.siege';
export const SIEGE_BEST_KEY = 'cagebreakers.siege.best';

function load(): SiegeState | null {
  const s = readJson<SiegeState>(SIEGE_KEY);
  return s && s.v === 1 && normalizeSeed(s.seed) && Array.isArray(s.placed) ? s : null;
}

export const siege = signal<SiegeState | null>(load());
effect(() => { const s = siege.value; if (s) writeJson(SIEGE_KEY, s); else storage.remove(SIEGE_KEY); });

export const siegeBest = signal<number>(readJson<{ best?: number }>(SIEGE_BEST_KEY)?.best ?? 0);
effect(() => writeJson(SIEGE_BEST_KEY, { best: siegeBest.value }));

/** What a tap on an empty square plants, or null to only pick pieces up. */
export const tool = signal<PieceKind | null>(null);
/** A planted piece picked up, by id: its reach shows, and it can be upgraded or sold. */
export const selected = signal<number | null>(null);
export const siegeMessage = signal<{ text: string; warn: boolean; id: number } | null>(null);
export const refusedAt = signal<{ cell: number; id: number } | null>(null);

/** The wave being played: stepped in the app, finished by the core. */
export interface Playing { sim: WaveSim; before: SiegeState; id: number; strikes: { s: Strike; until: number }[] }
export const playing = signal<Playing | null>(null);
export const speed = signal<1 | 2 | 4>(1);
export const paused = signal(false);
/** Bumped every time the wave moves on, so the field redraws. */
export const frame = signal(0);
/** The last wave's outcome, shown until the next build. */
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
    tool.value = null; selected.value = null; playing.value = null; siegeMessage.value = null; lastWave.value = null; paused.value = false;
  });
}

export function doSiege(a: SiegeAction, cell = -1): boolean {
  const s = siege.value;
  if (!s) return false;
  const r = actSiege(s, a);
  if (!r.ok) {
    if (cell >= 0) refusedAt.value = { cell, id: ++messageId };
    saySiege(r.reason ?? "That can't be done.", true);
    buzz([30, 30, 30]); play('refuse');
    return false;
  }
  siege.value = r.state;
  return true;
}

/** A tap on a square of the field. */
export function tapField(cell: number) {
  const s = siege.value;
  if (!s || s.phase !== 'build' || playing.value) return;
  const here = s.placed.find((p) => p.cell === cell);
  if (here) { selected.value = selected.value === here.id ? null : here.id; return; }
  selected.value = null;
  const t = tool.value;
  if (!t) { saySiege('Pick something to plant below, then tap a square.'); return; }
  if (doSiege({ type: 'build', kind: t, cell }, cell)) {
    play('place'); buzz(6);
    if (siege.value!.coins < costOf(t)) tool.value = null;
  }
}

export function upgradeSelected() {
  const id = selected.value;
  if (id !== null && doSiege({ type: 'upgrade', id })) { play('buy'); buzz(10); }
}
export function sellSelected() {
  const id = selected.value;
  if (id !== null && doSiege({ type: 'sell', id })) { selected.value = null; play('pick'); }
}
export function pickHybrid(kind: DefenderId) {
  if (doSiege({ type: 'pick', kind })) { tool.value = kind; play('seal'); saySiege(`${DEFENDERS[kind].name}s can be planted now.`); }
}

/** Lets the next wave come: it plays out on the field, stepped by `advance`. */
export function beginWave() {
  const s = siege.value;
  if (!s || s.phase !== 'build' || playing.value) return;
  batch(() => {
    selected.value = null; tool.value = null; lastWave.value = null; paused.value = false; siegeMessage.value = null;
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
  // A long pause between frames (the phone slept) doesn't fast-forward more than a second of the wave.
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
    if (state.phase === 'won' || state.phase === 'lost') siegeBest.value = Math.max(siegeBest.value, siegeScore(state).total);
  });
  if (state.phase === 'lost') play('lose');
  else if (state.phase === 'won') play('win');
  else if (record.eaten) { play('refuse'); buzz([40, 40]); } else play('seal');
}

export const pieceAt = (s: SiegeState, cell: number) => s.placed.find((p) => p.cell === cell) ?? null;
export const refundFor = refundOf;

/** Where the season stands, for the title. */
export const siegeNote = computed(() => {
  const s = siege.value;
  if (s && (s.phase === 'build' || s.phase === 'pick')) return `Wave ${s.wave} of 20, ${s.seedlings} seedlings, ${s.coins} coins.`;
  return siegeBest.value ? `Best season ${siegeBest.value}.` : '';
});

// Automated tests drive the season through these hooks.
if (typeof location === 'object' && new URLSearchParams(location.search).has('test')) {
  (window as unknown as { __siege: unknown }).__siege = {
    state: () => siege.value,
    act: (a: SiegeAction) => doSiege(a),
    tap: tapField,
    start: startSiege,
    wave: beginWave,
    finish: finishNow,
    playing: () => playing.value !== null,
    /** Sets coins, to try things the season wouldn't afford yet. */
    coins: (n: number) => { siege.value = { ...siege.value!, coins: n }; },
  };
}
