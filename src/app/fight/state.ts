import { batch, computed, effect, signal } from '@preact/signals';
import { FIRST_BLOOD } from '../../content/encounters';
import { speciesById } from '../../content/species';
import { type ClashResult, type UnitSpec, simulateClash, tallyTraits } from '../../core/clash';
import { CELLS, colOf, rowOf } from '../../core/grid';
import { generatePage } from '../../core/page';
import { type Hint, boardValues, hintFor, isLegal, sealedCages } from '../../core/rules';
import { drag } from '../input';
import { readJson, writeJson } from '../storage';

export const encounter = FIRST_BLOOD;
export const playerPage = generatePage(encounter.playerSeed);
export const enemyPage = generatePage(encounter.enemySeed);
export const roster = encounter.roster;
export const rosterById = new Map(roster.map((u) => [u.uid, u]));

const SAVE_KEY = 'cagebreakers.m2.layout';
type Layout = Record<string, number>;

function loadLayout(): Layout {
  const saved = readJson<{ v: 1; layout: Layout }>(SAVE_KEY);
  if (saved?.v !== 1) return {};
  const ok: Layout = {};
  for (const [uid, cell] of Object.entries(saved.layout)) if (rosterById.has(uid) && cell >= 0 && cell < CELLS) ok[uid] = cell;
  return ok;
}

/** Which cell each placed unit stands on. Units without an entry are on the bench. */
export const layout = signal<Layout>(loadLayout());
export const history = signal<Layout[]>([]);
export type FightSelection = { kind: 'bench'; uid: string } | { kind: 'cell'; cell: number };
export const selection = signal<FightSelection | null>(null);
export const phase = signal<'plan' | 'clash'>('plan');
export const result = signal<ClashResult | null>(null);
export const message = signal<{ text: string; warn: boolean; id: number } | null>(null);
export const justPlaced = signal<string>('');
export const justSealed = signal<Set<number>>(new Set());
export const refused = signal<{ cell: number; id: number } | null>(null);

effect(() => { writeJson(SAVE_KEY, { v: 1, layout: layout.value }); });

export const units = computed<UnitSpec[]>(() =>
  Object.entries(layout.value).map(([uid, cell]) => ({ ...rosterById.get(uid)!, cell })));
export const unitAt = computed<(string | null)[]>(() => {
  const out = new Array<string | null>(CELLS).fill(null);
  for (const [uid, cell] of Object.entries(layout.value)) out[cell] = uid;
  return out;
});
export const bench = computed(() => roster.filter((u) => layout.value[u.uid] === undefined));
const numbers = computed(() => {
  const out = new Array<number>(CELLS).fill(0);
  for (const u of units.value) out[u.cell] = u.n;
  return out;
});
export const values = computed(() => boardValues(playerPage, numbers.value));
export const sealed = computed(() => {
  // A cage seals only when units fill every open cell, not the player's empty intentions.
  const s = sealedCages(playerPage, values.value);
  return s;
});
export const traits = computed(() => tallyTraits(units.value));
export const enemyTraits = tallyTraits(encounter.enemy);
export const enemySealed = (() => {
  const placed = new Array<number>(CELLS).fill(0);
  for (const u of encounter.enemy) placed[u.cell] = u.n;
  return sealedCages(enemyPage, boardValues(enemyPage, placed));
})();

/** The unit in hand (selected or dragged) and the cell it's leaving. */
export const holding = computed<{ uid: string; n: number; origin: number } | null>(() => {
  const d = drag.value;
  if (d) {
    if (d.from.kind === 'item') { const u = rosterById.get(d.from.key); return u ? { uid: u.uid, n: u.n, origin: -1 } : null; }
    const uid = unitAt.value[d.from.cell];
    return uid ? { uid, n: rosterById.get(uid)!.n, origin: d.from.cell } : null;
  }
  const sel = selection.value;
  if (!sel) return null;
  if (sel.kind === 'bench') { const u = rosterById.get(sel.uid)!; return { uid: u.uid, n: u.n, origin: -1 }; }
  const uid = unitAt.value[sel.cell];
  return uid ? { uid, n: rosterById.get(uid)!.n, origin: sel.cell } : null;
});

export const hints = computed<(Hint | null)[]>(() => {
  const h = holding.value;
  return Array.from({ length: CELLS }, (_, cell) => {
    if (!h || playerPage.stones[cell] || cell === h.origin || unitAt.value[cell]) return null;
    return hintFor(playerPage, values.value, cell, h.n, h.origin);
  });
});

let messageId = 0;
let messageTimer: ReturnType<typeof setTimeout> | undefined;
export function say(text: string, warn = false, ms = 2600) {
  message.value = { text, warn, id: ++messageId };
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => (message.value = null), ms);
}
const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };

function why(cell: number, n: number, origin: number): string {
  if (playerPage.stones[cell]) return 'That number is printed on the page.';
  for (let i = 0; i < 6; i++) {
    const inRow = rowOf(cell) * 6 + i, inCol = i * 6 + colOf(cell);
    if (inRow !== cell && inRow !== origin && values.value[inRow] === n) return `There's already a ${n} in this row.`;
    if (inCol !== cell && inCol !== origin && values.value[inCol] === n) return `There's already a ${n} in this column.`;
  }
  return `A ${n} can't stand there.`;
}

function commit(next: Layout, placedUid: string) {
  const before = sealed.value;
  batch(() => {
    history.value = [...history.value, layout.value].slice(-80);
    layout.value = next;
    justPlaced.value = placedUid;
  });
  const newly = new Set([...sealed.value].filter((id) => !before.has(id)));
  if (newly.size) {
    justSealed.value = newly;
    buzz([12, 40, 18]);
    setTimeout(() => { if (justSealed.value === newly) justSealed.value = new Set(); }, 1200);
  } else buzz(8);
}

/** Moves a unit onto a cell. A unit already there goes back to the bench. */
export function placeUnit(uid: string, cell: number): boolean {
  const u = rosterById.get(uid);
  if (!u) return false;
  const origin = layout.value[uid] ?? -1;
  if (origin === cell) return true;
  const occupant = unitAt.value[cell];
  // Treat the occupant as leaving, so a swap-in is judged against the board without it.
  const vals = values.value.slice();
  if (occupant) vals[cell] = 0;
  if (playerPage.stones[cell] || !isLegal(playerPage, vals, cell, u.n, origin)) {
    refused.value = { cell, id: Date.now() };
    say(why(cell, u.n, origin), true);
    buzz([30, 30, 30]);
    return false;
  }
  const next = { ...layout.value };
  if (occupant) delete next[occupant];
  next[uid] = cell;
  commit(next, uid);
  if (occupant) say(`${speciesById(rosterById.get(occupant)!.species).name} went back to the bench.`);
  return true;
}

export function benchUnit(uid: string) {
  if (layout.value[uid] === undefined) return;
  const next = { ...layout.value };
  delete next[uid];
  commit(next, '');
}

export function undo() {
  const h = history.value;
  if (!h.length) return;
  batch(() => { layout.value = h[h.length - 1]!; history.value = h.slice(0, -1); selection.value = null; });
}

export function clearLayout() {
  if (!Object.keys(layout.value).length) return;
  commit({}, '');
  selection.value = null;
}

export function startClash() {
  if (!units.value.length) { say('Place at least one unit on the page first.', true); return; }
  batch(() => {
    result.value = simulateClash({ page: playerPage, units: units.value }, { page: enemyPage, units: encounter.enemy });
    selection.value = null;
    phase.value = 'clash';
  });
}

export function backToPlan() {
  phase.value = 'plan';
}

/** Name of a unit for sentences: "your Shellguard", "their Coil Unmaker". */
export function unitName(uid: string, withOwner = true): string {
  const isPlayer = rosterById.has(uid);
  const spec = isPlayer ? rosterById.get(uid)! : encounter.enemy.find((u) => u.uid === uid);
  const name = spec ? speciesById(spec.species).name : uid;
  return withOwner ? `${isPlayer ? 'your' : 'their'} ${name}` : name;
}
