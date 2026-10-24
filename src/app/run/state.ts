import { batch, computed, effect, signal } from '@preact/signals';
import { speciesById } from '../../content/species';
import { type ClashResult, tallyTraits } from '../../core/clash';
import { CELLS } from '../../core/grid';
import type { Opponent } from '../../core/opponent';
import { type Hint, hintFor, isLegal } from '../../core/rules';
import {
  type ClashRecord, type OwnedUnit, type RunAction, type RunState, act, isClaimed, newRun, onBench, onBoard,
  pageOf, reach, scout, sealedNow, toSpecs, values,
} from '../../core/run';
import { normalizeSeed } from '../../core/seed';
import { drag } from '../input';
import { freshSeed } from '../state';
import { readJson, storage, writeJson } from '../storage';

const SAVE_KEY = 'cagebreakers.run';

function load(): RunState | null {
  const s = readJson<RunState>(SAVE_KEY);
  if (!s || s.v !== 1 || !normalizeSeed(s.seed)) return null;
  return { ...s, lastArmy: s.lastArmy ?? [] };
}

export const run = signal<RunState | null>(load());
/** Earlier layouts this planning phase, for undoing placements (never purchases). */
export const undoStack = signal<RunState[]>([]);
export const view = signal<'plan' | 'clash'>('plan');
export const lastFight = signal<{ result: ClashResult; opponent: Opponent; record: ClashRecord; before: RunState } | null>(null);
export type RunSelection = { kind: 'bench' | 'cell'; uid: string } | { kind: 'offer'; index: number };
export const selection = signal<RunSelection | null>(null);
export const message = signal<{ text: string; warn: boolean; id: number } | null>(null);
export const justPlaced = signal('');
export const justSealed = signal<Set<number>>(new Set());
export const refused = signal<{ cell: number; id: number } | null>(null);

effect(() => {
  const s = run.value;
  if (s) writeJson(SAVE_KEY, s); else storage.remove(SAVE_KEY);
});

export const page = computed(() => (run.value ? pageOf(run.value.seed) : null));
export const sealed = computed(() => (run.value ? sealedNow(run.value) : new Set<number>()));
export const traits = computed(() => tallyTraits(run.value ? toSpecs(onBoard(run.value)) : []));
export const scouted = computed(() => (run.value && run.value.phase !== 'first-claim' ? scout(run.value) : null));
export const unitAt = computed(() => {
  const out = new Array<OwnedUnit | null>(CELLS).fill(null);
  if (run.value) for (const u of onBoard(run.value)) out[u.cell] = u;
  return out;
});

/** The unit in hand: n for hints, origin cell when moving one already on the page. */
export const holding = computed<{ n: number; origin: number } | null>(() => {
  const s = run.value;
  if (!s) return null;
  const unitN = (uid: string) => s.units.find((u) => u.uid === uid);
  const d = drag.value;
  if (d) {
    if (d.from.kind === 'cell') { const u = unitAt.value[d.from.cell]; return u ? { n: u.n, origin: u.cell } : null; }
    if (d.from.key.startsWith('offer:')) { const o = s.offers[Number(d.from.key.slice(6))]; return o ? { n: o.n, origin: -1 } : null; }
    const u = unitN(d.from.key); return u ? { n: u.n, origin: u.cell } : null;
  }
  const sel = selection.value;
  if (!sel) return null;
  if (sel.kind === 'offer') { const o = s.offers[sel.index]; return o && !o.sold ? { n: o.n, origin: -1 } : null; }
  const u = unitN(sel.uid);
  return u ? { n: u.n, origin: u.cell } : null;
});

export const hints = computed<(Hint | null)[]>(() => {
  const s = run.value, p = page.value, h = holding.value;
  return Array.from({ length: CELLS }, (_, c) => {
    if (!s || !p || !h || p.stones[c] || c === h.origin || unitAt.value[c] || !isClaimed(s, c)) return null;
    return hintFor(p, values(s), c, h.n, h.origin);
  });
});

let messageId = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
export function say(text: string, warn = false, ms = 2800) {
  message.value = { text, warn, id: ++messageId };
  clearTimeout(timer);
  timer = setTimeout(() => (message.value = null), ms);
}
const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };

/** Applies an action. Refusals explain themselves; seals that form are celebrated. */
export function dispatch(a: RunAction, cell = -1): boolean {
  const s = run.value;
  if (!s) return false;
  const r = act(s, a);
  if (!r.ok) {
    if (cell >= 0) refused.value = { cell, id: Date.now() };
    say(r.reason ?? "That can't be done.", true);
    buzz([30, 30, 30]);
    return false;
  }
  const before = sealed.value;
  batch(() => {
    if (a.type === 'place') undoStack.value = [...undoStack.value, s].slice(-40);
    else if (a.type !== 'lock') undoStack.value = [];
    run.value = r.state;
    if (a.type === 'place') justPlaced.value = a.uid;
  });
  const newly = new Set([...sealed.value].filter((id) => !before.has(id)));
  if (newly.size) {
    justSealed.value = newly;
    buzz([12, 40, 18]);
    setTimeout(() => { if (justSealed.value === newly) justSealed.value = new Set(); }, 1200);
  } else if (a.type === 'place' || a.type === 'buy') buzz(8);
  if (r.fought) {
    lastFight.value = { ...r.fought, before: s };
    view.value = 'clash';
  }
  return true;
}

export function undo() {
  const st = undoStack.value;
  if (!st.length) return;
  batch(() => { run.value = st[st.length - 1]!; undoStack.value = st.slice(0, -1); selection.value = null; });
}

export function startRun(seed = freshSeed()) {
  batch(() => {
    run.value = newRun(seed);
    undoStack.value = [];
    selection.value = null;
    lastFight.value = null;
    view.value = 'plan';
  });
}

export function abandonRun() {
  batch(() => { run.value = null; undoStack.value = []; lastFight.value = null; view.value = 'plan'; });
}

export function finishClash() {
  view.value = 'plan';
  const s = run.value;
  if (s?.lastIncome && s.phase === 'plan') {
    const i = s.lastIncome;
    const parts = [`+${i.base} gold`];
    if (i.interest) parts.push(`+${i.interest} interest`);
    if (i.streak) parts.push(`+${i.streak} streak`);
    if (i.win) parts.push(`+${i.win} for the win`);
    say(parts.join(', '), false, 4000);
  }
}

/** Places a unit (or buys an offer straight onto a cell). */
export function placeOnCell(source: RunSelection, cell: number): boolean {
  const s = run.value;
  if (!s) return false;
  if (source.kind === 'offer') {
    const before = s.units.length;
    if (!dispatch({ type: 'buy', offer: source.index }, cell)) return false;
    const after = run.value!;
    if (after.phase === 'merge' || after.units.length <= before) return true;
    const fresh = after.units[after.units.length - 1]!;
    dispatch({ type: 'place', uid: fresh.uid, cell }, cell);
    return true;
  }
  return dispatch({ type: 'place', uid: source.uid, cell }, cell);
}

export const unitName = (u: { species: string }) => speciesById(u.species).name;
export const benchUnits = computed(() => (run.value ? onBench(run.value) : []));
export const armyCount = computed(() => (run.value ? onBoard(run.value).length : 0));
export const armyLimit = computed(() => (run.value ? reach(run.value) : 0));
export { isLegal };
