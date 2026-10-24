/**
 * A run is a pure state machine: (state, action) → state. Every rule of the shop, the bench,
 * claiming, items and the clash lives here, so bots can play thousands of runs headlessly and a
 * run can be saved, resumed and replayed exactly from its seed and actions.
 */
import { RUN, unitValue } from '../content/balance';
import { ALL_ITEMS, ITEMS, PICK_SIZE, isRelic } from '../content/items';
import { speciesById } from '../content/species';
import type { ItemId, RelicId } from '../content/types';
import { type ClashResult, ENEMY, PLAYER, type Team, type UnitSpec, simulateClash } from './clash';
import { CELLS, PEERS, rowOf } from './grid';
import { type Opponent, generateOpponent, keeperFor, pickSpecies, rollTier } from './opponent';
import { type Op, type Page, evaluate, generatePage } from './page';
import { DOMINO_TURNS, besideCell, cellsOf, pieceKind, writeUnits } from './pieces';
import { boardValues, isLegal, sealedCages } from './rules';
import { stream } from './rng';

export interface OwnedUnit {
  uid: string;
  species: string;
  /** 0 for the Blank, which has no number. */
  n: number;
  /** The Domino's second number. */
  n2?: number;
  stars: 1 | 2 | 3;
  /** -1 while on the bench. */
  cell: number;
  /** The Domino's second cell, while on the page. */
  cell2?: number;
  relic?: RelicId;
}

export interface Offer { species: string; n: number; n2?: number; sold: boolean }

export interface ClashRecord {
  clash: number;
  winner: Team | 'draw';
  lifeLost: number;
  enemyName: string;
  sealed: number;
  enemySealed: number;
  seconds: number;
}

export interface Income { base: number; interest: number; streak: number; win: number }

export type RunPhase = 'first-claim' | 'pick' | 'plan' | 'merge' | 'won' | 'lost';

export interface RunState {
  v: 2;
  seed: string;
  /** The clash being prepared for, 1–15. */
  clash: number;
  phase: RunPhase;
  life: number;
  gold: number;
  /** Positive for consecutive wins, negative for consecutive losses. */
  streak: number;
  claimed: number[];
  units: OwnedUnit[];
  nextUid: number;
  offers: Offer[];
  locked: boolean;
  rerolls: number;
  merge: { species: string; stars: number; uids: string[] } | null;
  records: ClashRecord[];
  lastIncome: Income | null;
  /** The army fielded in the previous clash; the Mirror Scribe copies it. */
  lastArmy: UnitSpec[];
  /** Tools and unattached relics. */
  satchel: ItemId[];
  /** The item pick on the table, and how many more are owed after it. */
  pick: ItemId[] | null;
  picksOwed: number;
  /** Picks rolled so far in the run, so each one is fresh. */
  pickCount: number;
  /** Stones removed by the Eraser. */
  erased: number[];
  /** Cages switched between + and × by the Inkpot. */
  inked: number[];
  /** Cells whose hidden number the Lens has shown. */
  revealed: number[];
  /** Run modifiers. `banned` species never appear in your shop (the bot lab uses this to measure each species). */
  mods?: { banned?: readonly string[] };
  /** Set on a Daily Page run: the calendar day it belongs to. */
  daily?: string;
}

export type UseTarget = { uid?: string; half?: 0 | 1; dir?: 1 | -1; cell?: number; cage?: number };

export type RunAction =
  | { type: 'first-claim'; cage: number }
  | { type: 'pick'; choice: number }
  | { type: 'buy'; offer: number }
  | { type: 'sell'; uid: string }
  | { type: 'reroll' }
  | { type: 'lock' }
  | { type: 'claim'; cage: number }
  | { type: 'place'; uid: string; cell: number; cell2?: number }
  | { type: 'turn'; uid: string }
  | { type: 'use'; slot: number } & UseTarget
  | { type: 'merge'; keep: string }
  | { type: 'clash' };

export interface ActResult {
  state: RunState;
  ok: boolean;
  /** Why an action was refused, in the player's terms. */
  reason?: string;
  /** What the action did, when it's worth saying. */
  note?: string;
  /** Set when the action fought a clash. */
  fought?: { result: ClashResult; opponent: Opponent; record: ClashRecord };
}

// ---- Pages --------------------------------------------------------------------------------

const pages = new Map<string, Page>();
export function pageOf(seed: string): Page {
  let p = pages.get(seed);
  if (!p) { p = generatePage(seed); pages.set(seed, p); if (pages.size > 8) pages.delete(pages.keys().next().value!); }
  return p;
}

const flipOp = (op: Op): Op => (op === '+' ? '×' : '+');

/** The run's page as the player has changed it: erased stones gone, inked cages switched. */
export function runPage(s: Pick<RunState, 'seed' | 'erased' | 'inked'>): Page {
  if (!s.erased.length && !s.inked.length) return pageOf(s.seed);
  const key = `${s.seed}|${s.erased.join(',')}|${s.inked.join(',')}`;
  const cached = pages.get(key);
  if (cached) return cached;
  const base = pageOf(s.seed);
  const stones = base.stones.slice();
  for (const c of s.erased) stones[c] = 0;
  const cages = base.cages.map((c) => {
    if (!s.inked.includes(c.id)) return c;
    const op = flipOp(c.op);
    return { ...c, op, target: evaluate(op, c.cells.map((x) => base.solution[x]!)) };
  });
  const p: Page = { ...base, stones, cages };
  pages.set(key, p);
  if (pages.size > 16) pages.delete(pages.keys().next().value!);
  return p;
}

// ---- Derived facts ------------------------------------------------------------------------

export const openCells = (page: Page, cage: number) => page.cages[cage]!.cells.filter((c) => !page.stones[c]);
export const reach = (s: RunState) => { const p = runPage(s); return s.claimed.reduce((n, id) => n + openCells(p, id).length, 0); };
export const onBoard = (s: RunState) => s.units.filter((u) => u.cell >= 0);
export const onBench = (s: RunState) => s.units.filter((u) => u.cell < 0);
export const claimCost = (s: RunState, cage: number) => openCells(runPage(s), cage).length + s.claimed.length;
export const isClaimed = (s: RunState, cell: number) => s.claimed.includes(runPage(s).cageOf[cell]!);
export const unitAtCell = (s: RunState, cell: number) => s.units.find((u) => cellsOf(u).includes(cell));

export const boardNumbers = (s: RunState): number[] => writeUnits(onBoard(s));
export const values = (s: RunState) => boardValues(runPage(s), boardNumbers(s));
export const sealedNow = (s: RunState) => {
  const set = sealedCages(runPage(s), values(s));
  for (const id of [...set]) if (!s.claimed.includes(id)) set.delete(id);
  return set;
};
export const toSpecs = (units: OwnedUnit[]): UnitSpec[] => units.map(({ uid, species, n, n2, stars, cell, cell2, relic }) => {
  const u: UnitSpec = { uid, species, n, stars, cell };
  if (n2 !== undefined) u.n2 = n2;
  if (cell2 !== undefined) u.cell2 = cell2;
  if (relic) u.relic = relic;
  return u;
});

export function sellValue(u: OwnedUnit): number {
  const v = unitValue(speciesById(u.species).tier, u.stars);
  return u.stars > 1 ? v - 1 : v;
}

/** Empty open cells in the cages you hold. */
export function emptyHeld(s: RunState): number[] {
  const page = runPage(s), vals = values(s);
  return s.claimed.flatMap((id) => openCells(page, id)).filter((c) => !vals[c]);
}

/** Numbers that could stand somewhere open in the cages you hold right now. */
export function fittingNumbers(s: RunState): number[] {
  const page = runPage(s), vals = values(s);
  const fits = new Set<number>();
  for (const c of emptyHeld(s)) for (let n = 1; n <= 6; n++) if (isLegal(page, vals, c, n)) fits.add(n);
  return [...fits].sort();
}

/** Where a Domino could lie with its first half on `anchor`, given the board without it. */
export function dominoSpots(s: RunState, u: Pick<OwnedUnit, 'uid' | 'n' | 'n2'>, anchor: number): number[] {
  const page = runPage(s);
  const own = s.units.find((x) => x.uid === u.uid);
  const vals = values(s);
  for (const c of own ? cellsOf(own) : []) vals[c] = 0;
  const free = (c: number) => c >= 0 && !page.stones[c] && isClaimed(s, c) && !vals[c];
  if (!free(anchor) || !isLegal(page, vals, anchor, u.n)) return [];
  const withFirst = vals.slice();
  withFirst[anchor] = u.n;
  return DOMINO_TURNS.map((step) => besideCell(anchor, step)).filter((b) => free(b) && isLegal(page, withFirst, b, u.n2 ?? 0));
}

/** True when a shop offer could stand somewhere you hold right now. */
export function offerFits(s: RunState, o: Pick<Offer, 'species' | 'n' | 'n2'>): boolean {
  const kind = pieceKind(o.species);
  const empty = emptyHeld(s);
  if (kind === 'blank' || kind === 'smudge') return empty.length > 0;
  if (kind === 'domino') return empty.some((c) => dominoSpots(s, { uid: '', n: o.n, n2: o.n2 }, c).length > 0);
  return fittingNumbers(s).includes(o.n);
}

function rollOffers(s: RunState): Offer[] {
  const rng = stream(s.seed, `shop:${s.clash}:${s.rerolls}`);
  const r = reach(s);
  const offers: Offer[] = Array.from({ length: RUN.shopSize }, () => {
    const sp = pickSpecies(rng, rollTier(rng, r), undefined, s.mods?.banned);
    const n = rng.int(1, 6);
    if (sp.misprint === 'blank') return { species: sp.id, n: 0, sold: false };
    if (sp.misprint === 'domino') { let n2 = rng.int(1, 5); if (n2 >= n) n2++; return { species: sp.id, n, n2, sold: false }; }
    return { species: sp.id, n, sold: false };
  });
  // The pity rule: at least one offer always fits an open cell you hold, and can help a cage seal.
  const fits = fittingNumbers(s);
  const helps = (o: Offer) => pieceKind(o.species) !== 'smudge' && offerFits(s, o);
  const numbered = offers.map((o, i) => i).filter((i) => pieceKind(offers[i]!.species) === 'number');
  if (fits.length && numbered.length && !offers.some(helps)) offers[rng.pick(numbered)]!.n = rng.pick(fits);
  return offers;
}

function rollPick(s: RunState): ItemId[] {
  const rng = stream(s.seed, `pick:${s.pickCount}`);
  return rng.shuffle(ALL_ITEMS).slice(0, PICK_SIZE);
}

/** Puts the next owed pick on the table, or moves on to planning. */
function nextPick(s: RunState): RunState {
  if (s.picksOwed <= 0) return { ...s, pick: null, picksOwed: 0, phase: 'plan' };
  const withCount = { ...s, pickCount: s.pickCount + 1, picksOwed: s.picksOwed - 1 };
  return { ...withCount, pick: rollPick(s), phase: 'pick' };
}

// ---- Starting ----------------------------------------------------------------------------

export function newRun(seed: string): RunState {
  return {
    v: 2, seed, clash: 1, phase: 'first-claim', life: RUN.startLife, gold: RUN.startGold, streak: 0,
    claimed: [], units: [], nextUid: 1, offers: [], locked: false, rerolls: 0, merge: null, records: [], lastIncome: null,
    lastArmy: [], satchel: [], pick: null, picksOwed: 0, pickCount: 0, erased: [], inked: [], revealed: [],
  };
}

/** Brings a saved run from an earlier build up to date, or returns null if it can't be read. */
export function migrateRun(raw: unknown): RunState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<RunState> & { v?: number };
  if (s.v === 2) return s as RunState;
  if (s.v === 1) {
    return {
      ...(s as RunState), v: 2, satchel: [], pick: null, picksOwed: 0, pickCount: 0, erased: [], inked: [], revealed: [],
      units: (s.units ?? []).filter((u) => { try { speciesById(u.species); return true; } catch { return false; } }),
    };
  }
  return null;
}

// ---- Acting ------------------------------------------------------------------------------

const no = (state: RunState, reason: string): ActResult => ({ state, ok: false, reason });

function findMerge(s: RunState): RunState['merge'] {
  const groups = new Map<string, OwnedUnit[]>();
  for (const u of s.units) {
    if (u.stars >= 3) continue;
    const key = `${u.species}:${u.stars}`;
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }
  for (const [key, us] of groups) {
    if (us.length >= 3) {
      const [species, stars] = key.split(':');
      // Board copies first, so the merged unit keeps a place on the page when it can.
      const three = us.slice().sort((a, b) => Number(b.cell >= 0) - Number(a.cell >= 0)).slice(0, 3);
      return { species: species!, stars: Number(stars), uids: three.map((u) => u.uid) };
    }
  }
  return null;
}

/** Whether a unit with these numbers may stand on these cells, given the board without it. */
function canStand(s: RunState, u: OwnedUnit, cells: number[]): boolean {
  const page = runPage(s);
  const vals = values({ ...s, units: s.units.filter((x) => x.uid !== u.uid) });
  const kind = pieceKind(u.species);
  if (cells.some((c) => c < 0 || page.stones[c] || vals[c] || !isClaimed(s, c))) return false;
  if (kind === 'blank' || kind === 'smudge') return cells.length === 1;
  if (kind === 'domino') {
    if (cells.length !== 2 || !DOMINO_TURNS.some((st) => besideCell(cells[0]!, st) === cells[1])) return false;
    if (!isLegal(page, vals, cells[0]!, u.n)) return false;
    vals[cells[0]!] = u.n;
    return isLegal(page, vals, cells[1]!, u.n2 ?? 0);
  }
  return cells.length === 1 && isLegal(page, vals, cells[0]!, u.n);
}

const standAt = (u: OwnedUnit, cells: number[]): OwnedUnit => {
  const out: OwnedUnit = { ...u, cell: cells[0] ?? -1 };
  if (cells.length > 1) out.cell2 = cells[1]; else delete out.cell2;
  return out;
};

/** Combines three copies into one with another star, keeping the chosen copy's numbers. */
function doMerge(s: RunState, keepUid: string): RunState {
  const m = s.merge!;
  const copies = m.uids.map((id) => s.units.find((u) => u.uid === id)!);
  const keep = copies.find((u) => u.uid === keepUid) ?? copies[0]!;
  const rest = s.units.filter((u) => !m.uids.includes(u.uid));
  const relics = copies.map((u) => u.relic).filter((r): r is RelicId => !!r);
  const relic = keep.relic ?? relics[0];
  const spare = relics.slice(); if (relic) spare.splice(spare.indexOf(relic), 1);
  const merged: OwnedUnit = { uid: `u${s.nextUid}`, species: m.species, n: keep.n, stars: (m.stars + 1) as 2 | 3, cell: -1 };
  if (keep.n2 !== undefined) merged.n2 = keep.n2;
  if (relic) merged.relic = relic;
  const without: RunState = { ...s, units: rest };
  // Stand where the kept copy stood, else where another copy stood, else on the bench.
  const spots = [keep, ...copies].map(cellsOf).filter((cs) => cs.length);
  const spot = spots.find((cs) => canStand(without, merged, cs)) ?? [];
  const next: RunState = {
    ...s, units: [...rest, standAt(merged, spot)], nextUid: s.nextUid + 1, merge: null, phase: 'plan',
    satchel: [...s.satchel, ...spare],
  };
  return settleMerges(next);
}

/** Starts the next merge, auto-resolving when every copy carries the same numbers. */
function settleMerges(s: RunState): RunState {
  const m = findMerge(s);
  if (!m) return { ...s, merge: null, phase: 'plan' };
  const ns = new Set(m.uids.map((id) => { const u = s.units.find((x) => x.uid === id)!; return `${u.n}:${u.n2 ?? ''}`; }));
  const withMerge = { ...s, merge: m, phase: 'merge' as const };
  return ns.size === 1 ? doMerge(withMerge, m.uids[0]!) : withMerge;
}

function why(s: RunState, cell: number, n: number, ignore: number[]): string {
  const page = runPage(s), vals = values(s);
  if (page.stones[cell]) return 'That number is printed on the page.';
  if (!isClaimed(s, cell)) return 'Claim this cage before placing units in it.';
  for (const p of PEERS[cell]!) {
    if (ignore.includes(p) || vals[p] !== n) continue;
    return rowOf(p) === rowOf(cell) ? `There's already a ${n} in this row.` : `There's already a ${n} in this column.`;
  }
  return `A ${n} can't stand there.`;
}

function placeDomino(s: RunState, u: OwnedUnit, anchor: number, second?: number): ActResult {
  const page = runPage(s);
  if (page.stones[anchor]) return no(s, 'That number is printed on the page.');
  if (!isClaimed(s, anchor)) return no(s, 'Claim this cage before placing units in it.');
  const other = unitAtCell(s, anchor);
  if (other && other.uid !== u.uid) return no(s, 'Clear that cell before laying the Domino there.');
  const spots = dominoSpots(s, u, anchor);
  const pick = second !== undefined ? spots.find((c) => c === second) : spots[0];
  if (pick === undefined) {
    const vals = values({ ...s, units: s.units.filter((x) => x.uid !== u.uid) });
    if (!isLegal(page, vals, anchor, u.n)) return no(s, why(s, anchor, u.n, cellsOf(u)));
    return no(s, `The Domino's ${u.n2} has no free cell beside it that it can stand in.`);
  }
  return { state: { ...s, units: s.units.map((x) => (x.uid === u.uid ? standAt(x, [anchor, pick]) : x)) }, ok: true };
}

function placeSingle(s: RunState, u: OwnedUnit, cell: number): ActResult {
  const page = runPage(s);
  if (page.stones[cell]) return no(s, 'That number is printed on the page.');
  if (!isClaimed(s, cell)) return no(s, 'Claim this cage before placing units in it.');
  const occupant = unitAtCell(s, cell);
  if (occupant && occupant.uid !== u.uid && pieceKind(occupant.species) === 'domino') return no(s, 'The Domino lies there. Move it first.');
  const vals = values(s);
  if (occupant) vals[cell] = 0;
  if (pieceKind(u.species) === 'number' && !isLegal(page, vals, cell, u.n, u.cell)) return no(s, why(s, cell, u.n, [u.cell]));
  if (u.cell < 0 && !occupant && onBoard(s).length >= reach(s)) return no(s, 'Your army is full. Claim another cage to field more units.');
  let units = s.units.map((x) => (x.uid === u.uid ? standAt(x, [cell]) : x));
  if (occupant && occupant.uid !== u.uid) {
    // The occupant swaps into the mover's old cell if it may stand there; otherwise it goes to the bench.
    const after: RunState = { ...s, units: units.filter((x) => x.uid !== occupant.uid) };
    const back = u.cell >= 0 && canStand(after, occupant, [u.cell]) ? u.cell : -1;
    if (back < 0 && units.filter((x) => x.cell < 0 && x.uid !== occupant.uid).length >= RUN.benchSize) return no(s, 'Your bench is full.');
    units = units.map((x) => (x.uid === occupant.uid ? standAt(x, back >= 0 ? [back] : []) : x));
  }
  return { state: { ...s, units }, ok: true };
}

/** Moves a unit to the bench, if there's room. */
function bench(s: RunState, uid: string): RunState | null {
  if (onBench(s).length >= RUN.benchSize) return null;
  return { ...s, units: s.units.map((x) => (x.uid === uid ? standAt(x, []) : x)) };
}

function useItem(s: RunState, a: { slot: number } & UseTarget): ActResult {
  const item = s.satchel[a.slot];
  if (!item) return no(s, 'That item is gone.');
  const page = runPage(s);
  const spend = (next: RunState, note?: string): ActResult => ({
    state: { ...next, satchel: next.satchel.filter((_, i) => i !== a.slot) }, ok: true, ...(note ? { note } : {}),
  });
  const unit = a.uid ? s.units.find((x) => x.uid === a.uid) : undefined;

  if (isRelic(item)) {
    if (!unit) return no(s, `Choose a unit to carry the ${ITEMS[item].name}.`);
    if (unit.relic) return no(s, `${speciesById(unit.species).name} already carries the ${ITEMS[unit.relic].name}.`);
    return spend({ ...s, units: s.units.map((x) => (x.uid === unit.uid ? { ...x, relic: item } : x)) });
  }

  switch (item) {
    case 'chisel':
    case 'flip': {
      if (!unit) return no(s, `Choose a unit to ${item === 'chisel' ? 'chisel' : 'flip'}.`);
      const kind = pieceKind(unit.species);
      if (kind === 'blank') return no(s, 'The Blank has no number to change.');
      const half = kind === 'domino' && a.half === 1 ? 1 : 0;
      const from = half ? unit.n2! : unit.n;
      const to = item === 'flip' ? 7 - from : from + (a.dir ?? 1);
      if (to < 1 || to > 6) return no(s, `A ${from} can't go ${to > 6 ? 'higher' : 'lower'}.`);
      if (kind === 'domino' && to === (half ? unit.n : unit.n2)) return no(s, `Both halves of the Domino would read ${to}.`);
      const changed: OwnedUnit = half ? { ...unit, n2: to } : { ...unit, n: to };
      let next: RunState = { ...s, units: s.units.map((x) => (x.uid === unit.uid ? changed : x)) };
      let note = `The ${from} is now a ${to}.`;
      if (unit.cell >= 0 && !canStand(next, changed, cellsOf(changed))) {
        const benched = bench(next, unit.uid);
        if (!benched) return no(s, `A ${to} can't stand there, and your bench is full.`);
        next = benched; note = `The ${from} is now a ${to}. It can't stand where it was, so it went to your bench.`;
      }
      return spend(next, note);
    }
    case 'eraser': {
      const c = a.cell ?? -1;
      if (c < 0 || c >= CELLS || !page.stones[c]) return no(s, 'Choose a stone to erase.');
      return spend({ ...s, erased: [...s.erased, c] }, `Erased the ${page.stones[c]}. The cell is open.`);
    }
    case 'inkpot': {
      const cage = a.cage !== undefined ? page.cages[a.cage] : undefined;
      if (!cage) return no(s, 'Choose a cage to ink.');
      if (cage.op !== '+' && cage.op !== '×') return no(s, 'The Inkpot only switches + and × cages.');
      if (sealedCages(page, values(s)).has(cage.id)) return no(s, 'That cage is sealed. The Inkpot needs an unsealed cage.');
      const inked = s.inked.includes(cage.id) ? s.inked.filter((x) => x !== cage.id) : [...s.inked, cage.id];
      const next = { ...s, inked };
      const now = runPage(next).cages[cage.id]!;
      return spend(next, `The cage now reads ${now.target}${now.op}.`);
    }
    case 'lens': {
      const c = a.cell ?? -1;
      if (c < 0 || c >= CELLS || page.stones[c]) return no(s, 'Choose an open cell to look through.');
      if (s.revealed.includes(c)) return no(s, 'The Lens already showed that cell.');
      return spend({ ...s, revealed: [...s.revealed, c] }, `The hidden number there is ${page.solution[c]}.`);
    }
  }
  return no(s, 'That item does nothing here.');
}

export function act(s: RunState, a: RunAction): ActResult {
  if (s.phase === 'won' || s.phase === 'lost') return no(s, 'This run is over.');
  if (s.phase === 'merge' && a.type !== 'merge') return no(s, 'Choose which number the combined unit keeps.');
  if (s.phase === 'pick' && a.type !== 'pick') return no(s, 'Choose an item first.');

  switch (a.type) {
    case 'first-claim': {
      if (s.phase !== 'first-claim') return no(s, 'Your first cage is already claimed.');
      const cage = runPage(s).cages[a.cage];
      if (!cage || cage.cells.length !== 2) return no(s, 'Pick a cage of two cells for your free claim.');
      const next: RunState = { ...s, claimed: [a.cage], picksOwed: 1 };
      return { state: nextPick({ ...next, offers: rollOffers(next) }), ok: true };
    }

    case 'pick': {
      if (s.phase !== 'pick' || !s.pick) return no(s, 'There is nothing to pick.');
      const item = s.pick[a.choice];
      if (!item) return no(s, 'Choose one of the three.');
      return { state: nextPick({ ...s, satchel: [...s.satchel, item] }), ok: true };
    }

    case 'reroll': {
      if (s.phase !== 'plan') return no(s, 'Claim your first cage first.');
      if (s.gold < RUN.rerollCost) return no(s, `A reroll costs ${RUN.rerollCost} gold.`);
      const next = { ...s, gold: s.gold - RUN.rerollCost, rerolls: s.rerolls + 1, locked: false };
      return { state: { ...next, offers: rollOffers(next) }, ok: true };
    }

    case 'lock':
      return { state: { ...s, locked: !s.locked }, ok: true };

    case 'buy': {
      if (s.phase !== 'plan') return no(s, 'Claim your first cage first.');
      const offer = s.offers[a.offer];
      if (!offer || offer.sold) return no(s, 'That offer is gone.');
      const sp = speciesById(offer.species);
      if (s.gold < sp.tier) return no(s, `${sp.name} costs ${sp.tier} gold.`);
      const unit: OwnedUnit = { uid: `u${s.nextUid}`, species: offer.species, n: offer.n, stars: 1, cell: -1 };
      if (offer.n2 !== undefined) unit.n2 = offer.n2;
      const offers = s.offers.map((o, i) => (i === a.offer ? { ...o, sold: true } : o));
      const bought: RunState = { ...s, gold: s.gold - sp.tier, units: [...s.units, unit], nextUid: s.nextUid + 1, offers };
      const benchFull = onBench(s).length >= RUN.benchSize;
      const completesMerge = s.units.filter((u) => u.species === offer.species && u.stars === 1).length >= 2;
      if (benchFull && !completesMerge) return no(s, 'Your bench is full. Sell or place a unit first.');
      return { state: settleMerges(bought), ok: true };
    }

    case 'sell': {
      const u = s.units.find((x) => x.uid === a.uid);
      if (!u) return no(s, 'That unit is gone.');
      const satchel = u.relic ? [...s.satchel, u.relic] : s.satchel;
      return {
        state: { ...s, gold: s.gold + sellValue(u), units: s.units.filter((x) => x.uid !== a.uid), satchel }, ok: true,
        ...(u.relic ? { note: `The ${ITEMS[u.relic].name} went back to your satchel.` } : {}),
      };
    }

    case 'claim': {
      if (s.phase !== 'plan') return no(s, 'Claim your first cage first.');
      if (!runPage(s).cages[a.cage]) return no(s, 'No such cage.');
      if (s.claimed.includes(a.cage)) return no(s, 'You already hold that cage.');
      const cost = claimCost(s, a.cage);
      if (s.gold < cost) return no(s, `Claiming this cage costs ${cost} gold.`);
      return { state: { ...s, gold: s.gold - cost, claimed: [...s.claimed, a.cage] }, ok: true };
    }

    case 'place': {
      const u = s.units.find((x) => x.uid === a.uid);
      if (!u) return no(s, 'That unit is gone.');
      if (a.cell === u.cell && (a.cell2 === undefined || a.cell2 === u.cell2)) return { state: s, ok: true };
      if (a.cell < 0) {
        const b = bench(s, u.uid);
        return b ? { state: b, ok: true } : no(s, 'Your bench is full.');
      }
      if (a.cell >= CELLS) return no(s, 'That is off the page.');
      return pieceKind(u.species) === 'domino' ? placeDomino(s, u, a.cell, a.cell2) : placeSingle(s, u, a.cell);
    }

    case 'turn': {
      const u = s.units.find((x) => x.uid === a.uid);
      if (!u || pieceKind(u.species) !== 'domino' || u.cell < 0) return no(s, 'Only a Domino on the page can turn.');
      const spots = dominoSpots(s, u, u.cell);
      const steps = DOMINO_TURNS.map((st) => besideCell(u.cell, st));
      const at = steps.indexOf(u.cell2 ?? -1);
      for (let k = 1; k <= 4; k++) {
        const b = steps[(at + k) % 4]!;
        if (b === u.cell2) break;
        if (spots.includes(b)) return { state: { ...s, units: s.units.map((x) => (x.uid === u.uid ? standAt(x, [u.cell, b]) : x)) }, ok: true };
      }
      return no(s, "The Domino can't turn here. Its other half has nowhere else to go.");
    }

    case 'use': {
      if (s.phase !== 'plan') return no(s, 'Claim your first cage first.');
      return useItem(s, a);
    }

    case 'merge': {
      if (s.phase !== 'merge' || !s.merge) return no(s, 'Nothing to combine.');
      if (!s.merge.uids.includes(a.keep)) return no(s, 'Choose one of the three copies.');
      return { state: doMerge(s, a.keep), ok: true };
    }

    case 'clash': {
      if (s.phase !== 'plan') return no(s, 'Claim your first cage first.');
      const units = toSpecs(onBoard(s));
      if (!units.length) return no(s, 'Place at least one unit on the page first.');
      const page = runPage(s);
      const opponent = generateOpponent(s.seed, s.clash, { page, units: s.lastArmy.length ? s.lastArmy : units });
      const result = simulateClash(
        { page, units, rules: opponent.playerRules },
        { page: opponent.page, units: opponent.units, rules: opponent.rules },
      );
      const keeper = !!keeperFor(s.clash);
      const survivors = result.survivors.filter((uid) => result.fighters.find((f) => f.uid === uid)?.team === ENEMY).length;
      const lifeLost = result.winner === PLAYER ? 0
        : result.winner === 'draw' ? RUN.drawLoss
          : Math.round((RUN.lossBase + survivors) * (keeper ? RUN.keeperLossMult : 1));
      const life = Math.max(0, s.life - lifeLost);
      const streak = result.winner === PLAYER ? (s.streak > 0 ? s.streak + 1 : 1)
        : result.winner === ENEMY ? (s.streak < 0 ? s.streak - 1 : -1) : 0;
      const record: ClashRecord = {
        clash: s.clash, winner: result.winner, lifeLost, enemyName: opponent.name,
        sealed: result.sealedAtStart[PLAYER].length, enemySealed: result.sealedAtStart[ENEMY].length, seconds: result.beats / 10,
      };
      const fought = { result, opponent, record };
      const base: RunState = { ...s, life, streak, records: [...s.records, record], lastArmy: units };
      if (life <= 0) return { state: { ...base, phase: 'lost' }, ok: true, fought };
      if (s.clash >= RUN.clashes) return { state: { ...base, phase: 'won' }, ok: true, fought };

      const streakLen = Math.abs(streak);
      const income: Income = {
        base: RUN.income,
        interest: Math.min(RUN.interestMax, Math.floor(s.gold / RUN.interestPer)),
        streak: RUN.streakBonus.reduce((g, [len, bonus]) => (streakLen >= len ? bonus : g), 0),
        win: result.winner === PLAYER ? RUN.winBonus : 0,
      };
      const gold = s.gold + income.base + income.interest + income.streak + income.win;
      const next: RunState = { ...base, clash: s.clash + 1, gold, rerolls: 0, lastIncome: income, locked: false };
      const offers = s.locked ? s.offers : rollOffers(next);
      // A new chapter brings a pick, and beating a Keeper earns a second.
      const chapterStart = (s.clash + 1) % RUN.chapterLength === 1;
      const owed = chapterStart ? 1 + (keeper && result.winner === PLAYER ? 1 : 0) : 0;
      return { state: nextPick({ ...next, offers, picksOwed: owed }), ok: true, fought };
    }
  }
}

/** The opponent you'll face next, for scouting. Deterministic for the run seed and clash. */
export function scout(s: RunState): Opponent {
  return generateOpponent(s.seed, s.clash, { page: runPage(s), units: s.lastArmy.length ? s.lastArmy : toSpecs(onBoard(s)) });
}

export function runScore(s: RunState): { won: number; reached: number; life: number } {
  return { won: s.records.filter((r) => r.winner === PLAYER).length, reached: s.records.length, life: s.life };
}
