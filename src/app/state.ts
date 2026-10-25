import { batch, computed, effect, signal } from '@preact/signals';
import { CELLS, colOf, rowOf } from '../core/grid';
import { type Page, generatePage } from '../core/page';
import { boardValues, hintFor, isLegal, sealedCages } from '../core/rules';
import type { CellHint } from './PageView';
import { normalizeSeed, seedFromInts } from '../core/seed';
import { drag } from './input';
import { sheet } from './nav';
export { sheet };
import { readJson, storage, writeJson } from './storage';

/** What the player is holding: a number from the tray, or a number already on the page. */
export type Selection = { kind: 'tray'; n: number } | { kind: 'cell'; cell: number };
export type ThemeChoice = 'system' | 'light' | 'dark' | 'newsprint' | 'neon';

const SAVE_KEY = 'cagebreakers.m1.page';
const PREFS_KEY = 'cagebreakers.prefs';
const HISTORY_LIMIT = 80;

interface SaveFile { v: 1; seed: string; placed: number[]; history: number[][] }
interface Prefs { theme: ThemeChoice; seenIntro: boolean }

export function freshSeed(): string {
  const ints = new Uint32Array(6);
  try { crypto.getRandomValues(ints); } catch { for (let i = 0; i < 6; i++) ints[i] = Math.floor(Math.random() * 1e9); }
  return seedFromInts(ints);
}

function initialPage(): { page: Page; placed: number[]; history: number[][] } {
  const fromUrl = normalizeSeed(new URLSearchParams(location.search).get('seed') ?? '');
  const saved = readJson<SaveFile>(SAVE_KEY);
  if (fromUrl && saved?.seed !== fromUrl) return { page: generatePage(fromUrl), placed: new Array(CELLS).fill(0), history: [] };
  if (saved?.v === 1 && normalizeSeed(saved.seed) && saved.placed?.length === CELLS) {
    return { page: generatePage(saved.seed), placed: saved.placed, history: saved.history ?? [] };
  }
  return { page: generatePage(fromUrl ?? freshSeed()), placed: new Array(CELLS).fill(0), history: [] };
}

const prefsSaved = readJson<Partial<Prefs>>(PREFS_KEY);
const init = initialPage();

export const page = signal<Page>(init.page);
export const placed = signal<number[]>(init.placed);
export const history = signal<number[][]>(init.history);
export const selection = signal<Selection | null>(null);
export const message = signal<{ text: string; warn: boolean; id: number } | null>(null);
/** Cages that sealed on the last move, for the gold sheen; cleared after it plays. */
export const justSealed = signal<Set<number>>(new Set());
/** The cell that just received a number, for the stamp animation. */
export const justPlaced = signal<number>(-1);
/** A cell that just refused a number, for the red flash. */
export const refused = signal<{ cell: number; id: number } | null>(null);
export const theme = signal<ThemeChoice>(prefsSaved?.theme ?? 'system');
export const seenIntro = signal<boolean>(prefsSaved?.seenIntro ?? false);

export const values = computed(() => boardValues(page.value, placed.value));
export const sealed = computed(() => sealedCages(page.value, values.value));
export const complete = computed(() => sealed.value.size === page.value.cages.length);
export const placedCount = computed(() => placed.value.filter((v) => v > 0).length);

/** The number in hand, and the cell it is leaving (when moving a placed number). */
export const holding = computed<{ n: number; origin: number } | null>(() => {
  const d = drag.value;
  if (d) {
    if (d.from.kind === 'item') return { n: Number(d.from.key), origin: -1 };
    const n = placed.value[d.from.cell] ?? 0;
    return n ? { n, origin: d.from.cell } : null;
  }
  const sel = selection.value;
  if (!sel) return null;
  if (sel.kind === 'tray') return { n: sel.n, origin: -1 };
  const n = placed.value[sel.cell] ?? 0;
  return n ? { n, origin: sel.cell } : null;
});

/** Where the number in hand can go: bright cells take it (gold ones seal their cage); shaded ones can't. */
export const hints = computed<(CellHint | null)[]>(() => {
  const h = holding.value;
  const vals = values.value;
  return Array.from({ length: CELLS }, (_, cell) => {
    if (!h || cell === h.origin) return null;
    if (page.value.stones[cell]) return 'blocked';
    if (placed.value[cell]) return null;
    const hint = hintFor(page.value, vals, cell, h.n, h.origin);
    return hint === 'blocked' ? 'blocked' : hint === 'seals' ? 'seals' : 'open';
  });
});

/** The cells holding the same number as the one in hand: what blocks the shaded cells. */
export const blockers = computed(() => {
  const h = holding.value;
  if (!h) return undefined;
  const vals = values.value;
  return new Set(Array.from({ length: CELLS }, (_, c) => c).filter((c) => c !== h.origin && vals[c] === h.n));
});

effect(() => {
  writeJson(SAVE_KEY, { v: 1, seed: page.value.seed, placed: placed.value, history: history.value.slice(-HISTORY_LIMIT) } satisfies SaveFile);
});
effect(() => {
  writeJson(PREFS_KEY, { theme: theme.value, seenIntro: seenIntro.value } satisfies Prefs);
});

let messageId = 0;
let messageTimer: ReturnType<typeof setTimeout> | undefined;
export function say(text: string, warn = false, ms = 2600) {
  message.value = { text, warn, id: ++messageId };
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => (message.value = null), ms);
}

import { buzz } from './settings';
import { play } from './sound';

/** Explains why a number can't go somewhere, in the player's terms. */
function refusal(cell: number, n: number, origin: number): string {
  if (page.value.stones[cell]) return 'That number is printed on the page.';
  const vals = values.value;
  for (let i = 0; i < 6; i++) {
    const inRow = rowOf(cell) * 6 + i, inCol = i * 6 + colOf(cell);
    if (inRow !== cell && inRow !== origin && vals[inRow] === n) return `There's already a ${n} in this row.`;
    if (inCol !== cell && inCol !== origin && vals[inCol] === n) return `There's already a ${n} in this column.`;
  }
  return `A ${n} can't go there.`;
}

function commit(next: number[], cell: number) {
  const before = sealed.value;
  batch(() => {
    history.value = [...history.value, placed.value].slice(-HISTORY_LIMIT);
    placed.value = next;
    justPlaced.value = cell;
  });
  const after = sealed.value;
  const newly = new Set([...after].filter((id) => !before.has(id)));
  if (newly.size) {
    justSealed.value = newly;
    buzz([12, 40, 18]); play('seal');
    if (!seenIntro.value) seenIntro.value = true;
    setTimeout(() => { if (justSealed.value === newly) justSealed.value = new Set(); }, 1200);
  } else {
    buzz(8); play('place');
  }
}

/** Puts `n` in `cell`, moving it from `origin` when it came from the page. Returns false if refused. */
export function place(cell: number, n: number, origin = -1): boolean {
  if (cell === origin) return true;
  if (!isLegal(page.value, values.value, cell, n, origin) || page.value.stones[cell]) {
    refused.value = { cell, id: Date.now() };
    say(refusal(cell, n, origin), true);
    buzz([30, 30, 30]); play('refuse');
    return false;
  }
  const next = placed.value.slice();
  if (origin >= 0) next[origin] = 0;
  next[cell] = n;
  commit(next, cell);
  return true;
}

export function removeAt(cell: number) {
  if (!placed.value[cell]) return;
  const next = placed.value.slice();
  next[cell] = 0;
  commit(next, -1);
}

export function undo() {
  const h = history.value;
  if (!h.length) return;
  batch(() => {
    placed.value = h[h.length - 1]!;
    history.value = h.slice(0, -1);
    selection.value = null;
    justPlaced.value = -1;
  });
}

export function newPage(seed?: string) {
  batch(() => {
    page.value = generatePage(seed ?? freshSeed());
    placed.value = new Array(CELLS).fill(0);
    history.value = [];
    selection.value = null;
    sheet.value = null;
    justSealed.value = new Set();
    justPlaced.value = -1;
  });
  // Drop a ?seed= from the address so a reload doesn't bring the old page back.
  const params = new URLSearchParams(location.search);
  if (params.has('seed')) {
    params.delete('seed');
    const query = params.toString();
    window.history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''));
  }
}

export function clearPage() {
  if (!placedCount.value) return;
  commit(new Array(CELLS).fill(0), -1);
  selection.value = null;
}

/** Test hook: only present when the page is opened with ?test, so end-to-end tests can play. */
export function exposeTestHooks() {
  if (!new URLSearchParams(location.search).has('test')) return;
  (window as unknown as { __cb: unknown }).__cb = {
    page: () => page.value,
    placed: () => placed.value.slice(),
    sealed: () => [...sealed.value],
    place,
    newPage,
  };
  void Promise.all([import('./run/state'), import('../core/run'), import('../core/commission'), import('../core/rng'), import('./meta')]).then(([r, core, cm, rng, m]) => {
    (window as unknown as { __run: unknown }).__run = {
      state: () => r.run.value,
      dispatch: r.dispatch,
      startRun: r.startRun,
      startStation: r.startStation,
      /** The scriptorium profile, and a way to set it for tests. */
      profile: () => m.profile.value,
      setProfile(p: unknown) { m.profile.value = p as never; },
      page: () => (r.run.value ? core.runPage(r.run.value) : null),
      /** Cells a number could move to, for test autopilots. */
      legalCells: (id: number) => core.legalCells(r.run.value!, id),
      /** Puts every number in hand onto a cell where the hidden solution has it. */
      solveHand() {
        let st = r.run.value!;
        const p = core.runPage(st);
        for (const t of st.tokens.filter((x) => x.cell < 0)) {
          const cell = Array.from({ length: 36 }, (_, c) => c).find((c) => !p.stones[c] && p.solution[c] === t.n && !st.tokens.some((o) => o.cell === c));
          if (cell !== undefined && r.dispatch({ type: 'place', id: t.id, cell })) st = r.run.value!;
        }
      },
      /** Milliseconds to post this round's commissions afresh, averaged, for timing on the phone. */
      benchPost(times = 10) {
        const st = r.run.value!;
        const p = core.runPage(st);
        const holding = { kept: st.tokens.filter((t) => t.round < st.round).map((t) => t.n), dealt: core.dealtThisRound(st).map((t) => t.n), need: st.need };
        const now = cm.viewOf(p, core.valuesOf({ ...st, tokens: st.tokens.filter((t) => t.round < st.round) }));
        const t0 = performance.now();
        for (let i = 0; i < times; i++) cm.postCommissions({ page: p, round: Math.max(3, st.round), final: false, holding, now }, rng.createRng(`bench${i}`));
        return (performance.now() - t0) / times;
      },
      /** Replaces the run outright, for tests that need a particular state. */
      load(st: unknown) { r.run.value = st as never; },
    };
  });
}

export function resetStorageForTests() {
  storage.remove(SAVE_KEY);
}
