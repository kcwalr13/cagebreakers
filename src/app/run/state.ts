import { batch, computed, effect, signal } from '@preact/signals';
import { ITEMS } from '../../content/items';
import { speciesById } from '../../content/species';
import type { ItemId } from '../../content/types';
import { type ClashResult, tallyTraits } from '../../core/clash';
import { CELLS } from '../../core/grid';
import type { Opponent } from '../../core/opponent';
import { cellsOf, pieceKind } from '../../core/pieces';
import { BLANK, type Hint, SMUDGE, blankValues, hintFor, isLegal, isSealed } from '../../core/rules';
import {
  type ClashRecord, type OwnedUnit, type RunAction, type RunState, act, dominoSpots, isClaimed, migrateRun, newRun, onBench, onBoard,
  reach, runPage, scout, sealedNow, toSpecs, values,
} from '../../core/run';
import { normalizeSeed } from '../../core/seed';
import { drag } from '../input';
import { sheet } from '../nav';
import { freshSeed } from '../state';
import { readJson, storage, writeJson } from '../storage';

const SAVE_KEY = 'cagebreakers.run';

function load(): RunState | null {
  const s = migrateRun(readJson<unknown>(SAVE_KEY));
  if (!s || !normalizeSeed(s.seed)) return null;
  return { ...s, lastArmy: s.lastArmy ?? [] };
}

export const run = signal<RunState | null>(load());
/** Earlier layouts this planning phase, for undoing placements (never purchases). */
export const undoStack = signal<RunState[]>([]);
export const view = signal<'plan' | 'clash'>('plan');
export const lastFight = signal<{ result: ClashResult; opponent: Opponent; record: ClashRecord; before: RunState } | null>(null);
export type RunSelection = { kind: 'bench' | 'cell'; uid: string } | { kind: 'offer'; index: number };
export const selection = signal<RunSelection | null>(null);
/** A tool or relic waiting for its target. */
export const itemMode = signal<{ slot: number; item: ItemId } | null>(null);
export const message = signal<{ text: string; warn: boolean; id: number } | null>(null);
export const justPlaced = signal('');
export const justSealed = signal<Set<number>>(new Set());
export const refused = signal<{ cell: number; id: number } | null>(null);

effect(() => {
  const s = run.value;
  if (s) writeJson(SAVE_KEY, s); else storage.remove(SAVE_KEY);
});

export const page = computed(() => (run.value ? runPage(run.value) : null));
export const sealed = computed(() => (run.value ? sealedNow(run.value) : new Set<number>()));
export const traits = computed(() => tallyTraits(run.value ? toSpecs(onBoard(run.value)) : []));
export const scouted = computed(() => (run.value && run.value.phase !== 'first-claim' ? scout(run.value) : null));
/** The unit covering each cell (a Domino covers two). */
export const unitAt = computed(() => {
  const out = new Array<OwnedUnit | null>(CELLS).fill(null);
  if (run.value) for (const u of onBoard(run.value)) for (const c of cellsOf(u)) out[c] = u;
  return out;
});
/** The numbers Blanks stand for in sealed cages, by cell. */
export const blankShown = computed(() => {
  const s = run.value, p = page.value;
  const out = new Map<number, number>();
  if (!s || !p) return out;
  const vals = values(s);
  for (const id of sealed.value) for (const [c, v] of blankValues(p.cages[id]!, vals)) out.set(c, v);
  return out;
});
export const revealed = computed(() => {
  const s = run.value, p = page.value;
  return new Map((s?.revealed ?? []).map((c) => [c, p!.solution[c]!]));
});

/** What's in hand: the piece, and the cells it leaves when moved. */
interface Holding { species: string; n: number; n2?: number; uid?: string; origin: number[] }
export const holding = computed<Holding | null>(() => {
  const s = run.value;
  if (!s) return null;
  const fromUnit = (u: OwnedUnit | undefined | null): Holding | null => (u ? { species: u.species, n: u.n, n2: u.n2, uid: u.uid, origin: cellsOf(u) } : null);
  const fromOffer = (i: number): Holding | null => { const o = s.offers[i]; return o && !o.sold ? { species: o.species, n: o.n, n2: o.n2, origin: [] } : null; };
  const d = drag.value;
  if (d) {
    const from = d.from;
    if (from.kind === 'cell') return fromUnit(unitAt.value[from.cell]);
    if (from.key.startsWith('offer:')) return fromOffer(Number(from.key.slice(6)));
    return fromUnit(s.units.find((u) => u.uid === from.key));
  }
  const sel = selection.value;
  if (!sel) return null;
  if (sel.kind === 'offer') return fromOffer(sel.index);
  return fromUnit(s.units.find((u) => u.uid === sel.uid));
});

/** Where a Domino in hand would put its second half if dropped on each cell. */
export const dominoLanding = computed<number[]>(() => {
  const s = run.value, h = holding.value;
  const out = new Array<number>(CELLS).fill(-1);
  if (!s || !h || pieceKind(h.species) !== 'domino') return out;
  for (let c = 0; c < CELLS; c++) out[c] = dominoSpots(s, { uid: h.uid ?? '', n: h.n, n2: h.n2 }, c)[0] ?? -1;
  return out;
});

export const hints = computed<(Hint | null)[]>(() => {
  const s = run.value, p = page.value, h = holding.value;
  if (!s || !p || !h) return new Array(CELLS).fill(null);
  const kind = pieceKind(h.species);
  const vals = values(s);
  for (const c of h.origin) vals[c] = 0;
  return Array.from({ length: CELLS }, (_, c) => {
    if (p.stones[c] || h.origin.includes(c) || unitAt.value[c] || !isClaimed(s, c)) return null;
    if (kind === 'domino') {
      const b = dominoLanding.value[c]!;
      if (b < 0) return 'blocked';
      const next = vals.slice(); next[c] = h.n; next[b] = h.n2 ?? 0;
      return [p.cageOf[c]!, p.cageOf[b]!].some((id) => isSealed(p.cages[id]!, next)) ? 'seals' : 'open';
    }
    const mark = kind === 'blank' ? BLANK : kind === 'smudge' ? SMUDGE : h.n;
    return hintFor(p, vals, c, mark);
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
    if (a.type === 'place' || a.type === 'turn') undoStack.value = [...undoStack.value, s].slice(-40);
    else if (a.type !== 'lock') undoStack.value = [];
    run.value = r.state;
    if (a.type === 'place') justPlaced.value = a.uid;
  });
  if (r.note) say(r.note, false, 3600);
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
    itemMode.value = null;
    lastFight.value = null;
    view.value = 'plan';
  });
}

export function abandonRun() {
  batch(() => { run.value = null; undoStack.value = []; lastFight.value = null; itemMode.value = null; view.value = 'plan'; });
}

export function finishClash() {
  view.value = 'plan';
  const s = run.value;
  if (s?.lastIncome && s.phase !== 'won' && s.phase !== 'lost') {
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

/** Spends the item waiting for a target on what was tapped. Returns true when the tap was used. */
export function useOn(target: { uid?: string; cell?: number }): boolean {
  const m = itemMode.value, s = run.value, p = page.value;
  if (!m || !s || !p) return false;
  const item = m.item;
  const name = ITEMS[item].name;
  if (ITEMS[item].family === 'relic' || item === 'chisel' || item === 'flip') {
    if (!target.uid) { say(`Tap a unit for the ${name}.`, true); return true; }
    const u = s.units.find((x) => x.uid === target.uid)!;
    // The Chisel asks which way; a Domino asks which half.
    if (item === 'chisel' || (item === 'flip' && pieceKind(u.species) === 'domino')) {
      sheet.value = { kind: 'tool', slot: m.slot, uid: u.uid };
      return true;
    }
    if (dispatch({ type: 'use', slot: m.slot, uid: u.uid })) {
      if (ITEMS[item].family === 'relic') say(`${speciesById(u.species).name} now carries the ${name}.`);
      itemMode.value = null;
    }
    return true;
  }
  const cell = target.cell ?? -1;
  if (cell < 0) { say(`Tap a cell on the page for the ${name}.`, true); return true; }
  const a: RunAction = item === 'inkpot' ? { type: 'use', slot: m.slot, cage: p.cageOf[cell]! } : { type: 'use', slot: m.slot, cell };
  if (dispatch(a, cell)) itemMode.value = null;
  return true;
}

/** Cells a waiting tool can be used on, for ringing on the page. */
export const toolTargets = computed<Set<number> | undefined>(() => {
  const m = itemMode.value, s = run.value, p = page.value;
  if (!m || !s || !p) return undefined;
  if (m.item === 'eraser') return new Set(p.stones.map((v, c) => (v ? c : -1)).filter((c) => c >= 0));
  if (m.item === 'lens') return new Set(p.stones.map((v, c) => (!v && !s.revealed.includes(c) && !unitAt.value[c] ? c : -1)).filter((c) => c >= 0));
  if (m.item === 'inkpot') {
    const out = new Set<number>();
    for (const cage of p.cages) if ((cage.op === '+' || cage.op === '×') && !sealed.value.has(cage.id)) for (const c of cage.cells) out.add(c);
    return out;
  }
  return new Set(onBoard(s).flatMap(cellsOf));
});

export const unitName = (u: { species: string }) => speciesById(u.species).name;
export const benchUnits = computed(() => (run.value ? onBench(run.value) : []));
export const armyCount = computed(() => (run.value ? onBoard(run.value).length : 0));
export const armyLimit = computed(() => (run.value ? reach(run.value) : 0));
export { isLegal };
