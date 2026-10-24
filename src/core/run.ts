/**
 * A run is a pure state machine: (state, action) → state. Every rule of the shop, the bench,
 * claiming and the clash lives here, so bots can play thousands of runs headlessly and a run
 * can be saved, resumed and replayed exactly from its seed and actions.
 */
import { RUN, unitValue } from '../content/balance';
import { speciesById } from '../content/species';
import { type ClashResult, ENEMY, PLAYER, type Team, type UnitSpec, simulateClash } from './clash';
import { CELLS, PEERS, rowOf } from './grid';
import { type Opponent, generateOpponent, keeperFor, pickSpecies, rollTier } from './opponent';
import { type Page, generatePage } from './page';
import { boardValues, isLegal, sealedCages } from './rules';
import { stream } from './rng';

export interface OwnedUnit {
  uid: string;
  species: string;
  n: number;
  stars: 1 | 2 | 3;
  /** -1 while on the bench. */
  cell: number;
}

export interface Offer { species: string; n: number; sold: boolean }

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

export type RunPhase = 'first-claim' | 'plan' | 'merge' | 'won' | 'lost';

export interface RunState {
  v: 1;
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
}

export type RunAction =
  | { type: 'first-claim'; cage: number }
  | { type: 'buy'; offer: number }
  | { type: 'sell'; uid: string }
  | { type: 'reroll' }
  | { type: 'lock' }
  | { type: 'claim'; cage: number }
  | { type: 'place'; uid: string; cell: number }
  | { type: 'merge'; keep: string }
  | { type: 'clash' };

export interface ActResult {
  state: RunState;
  ok: boolean;
  /** Why an action was refused, in the player's terms. */
  reason?: string;
  /** Set when the action fought a clash. */
  fought?: { result: ClashResult; opponent: Opponent; record: ClashRecord };
}

// ---- Derived facts ------------------------------------------------------------------------

const pages = new Map<string, Page>();
export function pageOf(seed: string): Page {
  let p = pages.get(seed);
  if (!p) { p = generatePage(seed); pages.set(seed, p); if (pages.size > 8) pages.delete(pages.keys().next().value!); }
  return p;
}

export const openCells = (page: Page, cage: number) => page.cages[cage]!.cells.filter((c) => !page.stones[c]);
export const reach = (s: RunState) => s.claimed.reduce((n, id) => n + openCells(pageOf(s.seed), id).length, 0);
export const onBoard = (s: RunState) => s.units.filter((u) => u.cell >= 0);
export const onBench = (s: RunState) => s.units.filter((u) => u.cell < 0);
export const claimCost = (s: RunState, cage: number) => openCells(pageOf(s.seed), cage).length + s.claimed.length;
export const isClaimed = (s: RunState, cell: number) => s.claimed.includes(pageOf(s.seed).cageOf[cell]!);

export function boardNumbers(s: RunState): number[] {
  const out = new Array<number>(CELLS).fill(0);
  for (const u of onBoard(s)) out[u.cell] = u.n;
  return out;
}
export const values = (s: RunState) => boardValues(pageOf(s.seed), boardNumbers(s));
export const sealedNow = (s: RunState) => {
  const page = pageOf(s.seed);
  const set = sealedCages(page, values(s));
  for (const id of [...set]) if (!s.claimed.includes(id)) set.delete(id);
  return set;
};
export const toSpecs = (units: OwnedUnit[]): UnitSpec[] => units.map(({ uid, species, n, stars, cell }) => ({ uid, species, n, stars, cell }));

export function sellValue(u: OwnedUnit): number {
  const v = unitValue(speciesById(u.species).tier, u.stars);
  return u.stars > 1 ? v - 1 : v;
}

/** Numbers that could stand somewhere open in the cages you hold right now. */
export function fittingNumbers(s: RunState): number[] {
  const page = pageOf(s.seed), vals = values(s);
  const fits = new Set<number>();
  for (const id of s.claimed) for (const c of openCells(page, id)) {
    if (vals[c]) continue;
    for (let n = 1; n <= 6; n++) if (isLegal(page, vals, c, n)) fits.add(n);
  }
  return [...fits].sort();
}

function rollOffers(s: RunState): Offer[] {
  const rng = stream(s.seed, `shop:${s.clash}:${s.rerolls}`);
  const r = reach(s);
  const offers: Offer[] = Array.from({ length: RUN.shopSize }, () => ({
    species: pickSpecies(rng, rollTier(rng, r)).id, n: rng.int(1, 6), sold: false,
  }));
  // The pity rule: at least one offer always fits an open cell you hold.
  const fits = fittingNumbers(s);
  if (fits.length && !offers.some((o) => fits.includes(o.n))) offers[rng.int(0, offers.length - 1)]!.n = rng.pick(fits);
  return offers;
}

// ---- Starting ----------------------------------------------------------------------------

export function newRun(seed: string): RunState {
  return {
    v: 1, seed, clash: 1, phase: 'first-claim', life: RUN.startLife, gold: RUN.startGold, streak: 0,
    claimed: [], units: [], nextUid: 1, offers: [], locked: false, rerolls: 0, merge: null, records: [], lastIncome: null,
    lastArmy: [],
  };
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

/** Combines three copies into one with another star, keeping the chosen copy's number. */
function doMerge(s: RunState, keepUid: string): RunState {
  const m = s.merge!;
  const copies = m.uids.map((id) => s.units.find((u) => u.uid === id)!);
  const keep = copies.find((u) => u.uid === keepUid) ?? copies[0]!;
  const rest = s.units.filter((u) => !m.uids.includes(u.uid));
  const page = pageOf(s.seed);
  const without = { ...s, units: rest };
  const vals = values(without);
  // Stand where the kept copy stood, else where another copy stood, else on the bench.
  const spots = [keep.cell, ...copies.map((u) => u.cell)].filter((c) => c >= 0);
  const cell = spots.find((c) => isLegal(page, vals, c, keep.n)) ?? -1;
  const merged: OwnedUnit = { uid: `u${s.nextUid}`, species: m.species, n: keep.n, stars: (m.stars + 1) as 2 | 3, cell };
  const next: RunState = { ...s, units: [...rest, merged], nextUid: s.nextUid + 1, merge: null, phase: 'plan' };
  return settleMerges(next);
}

/** Starts the next merge, auto-resolving when every copy carries the same number. */
function settleMerges(s: RunState): RunState {
  const m = findMerge(s);
  if (!m) return { ...s, merge: null, phase: 'plan' };
  const ns = new Set(m.uids.map((id) => s.units.find((u) => u.uid === id)!.n));
  const withMerge = { ...s, merge: m, phase: 'merge' as const };
  return ns.size === 1 ? doMerge(withMerge, m.uids[0]!) : withMerge;
}

function why(s: RunState, cell: number, n: number, origin: number): string {
  const page = pageOf(s.seed), vals = values(s);
  if (page.stones[cell]) return 'That number is printed on the page.';
  for (const p of PEERS[cell]!) {
    if (p === origin || vals[p] !== n) continue;
    return rowOf(p) === rowOf(cell) ? `There's already a ${n} in this row.` : `There's already a ${n} in this column.`;
  }
  return `A ${n} can't stand there.`;
}

export function act(s: RunState, a: RunAction): ActResult {
  if (s.phase === 'won' || s.phase === 'lost') return no(s, 'This run is over.');
  if (s.phase === 'merge' && a.type !== 'merge') return no(s, 'Choose which number the combined unit keeps.');
  const page = pageOf(s.seed);

  switch (a.type) {
    case 'first-claim': {
      if (s.phase !== 'first-claim') return no(s, 'Your first cage is already claimed.');
      const cage = page.cages[a.cage];
      if (!cage || cage.cells.length !== 2) return no(s, 'Pick a cage of two cells for your free claim.');
      const next: RunState = { ...s, claimed: [a.cage], phase: 'plan' };
      return { state: { ...next, offers: rollOffers(next) }, ok: true };
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
      return { state: { ...s, gold: s.gold + sellValue(u), units: s.units.filter((x) => x.uid !== a.uid) }, ok: true };
    }

    case 'claim': {
      if (s.phase !== 'plan') return no(s, 'Claim your first cage first.');
      if (!page.cages[a.cage]) return no(s, 'No such cage.');
      if (s.claimed.includes(a.cage)) return no(s, 'You already hold that cage.');
      const cost = claimCost(s, a.cage);
      if (s.gold < cost) return no(s, `Claiming this cage costs ${cost} gold.`);
      return { state: { ...s, gold: s.gold - cost, claimed: [...s.claimed, a.cage] }, ok: true };
    }

    case 'place': {
      const u = s.units.find((x) => x.uid === a.uid);
      if (!u) return no(s, 'That unit is gone.');
      if (a.cell === u.cell) return { state: s, ok: true };
      if (a.cell < 0) {
        if (onBench(s).length >= RUN.benchSize) return no(s, 'Your bench is full.');
        return { state: { ...s, units: s.units.map((x) => (x.uid === u.uid ? { ...x, cell: -1 } : x)) }, ok: true };
      }
      if (a.cell >= CELLS) return no(s, 'That is off the page.');
      if (page.stones[a.cell]) return no(s, 'That number is printed on the page.');
      if (!isClaimed(s, a.cell)) return no(s, 'Claim this cage before placing units in it.');
      const occupant = s.units.find((x) => x.cell === a.cell && x.uid !== u.uid);
      const vals = values(s);
      if (occupant) vals[a.cell] = 0;
      if (!isLegal(page, vals, a.cell, u.n, u.cell)) return no(s, why(s, a.cell, u.n, u.cell));
      if (u.cell < 0 && !occupant && onBoard(s).length >= reach(s)) return no(s, 'Your army is full. Claim another cage to field more units.');
      let units = s.units.map((x) => (x.uid === u.uid ? { ...x, cell: a.cell } : x));
      if (occupant) {
        // The occupant swaps into the mover's old cell if it may stand there; otherwise it goes to the bench.
        const after = boardValues(page, (() => { const b = new Array<number>(CELLS).fill(0); for (const x of units) if (x.cell >= 0 && x.uid !== occupant.uid) b[x.cell] = x.n; return b; })());
        const back = u.cell >= 0 && isLegal(page, after, u.cell, occupant.n) ? u.cell : -1;
        if (back < 0 && units.filter((x) => x.cell < 0 && x.uid !== occupant.uid).length >= RUN.benchSize) return no(s, 'Your bench is full.');
        units = units.map((x) => (x.uid === occupant.uid ? { ...x, cell: back } : x));
      }
      return { state: { ...s, units }, ok: true };
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
      const base: RunState = { ...s, life, streak, records: [...s.records, record], lastArmy: units };
      if (life <= 0) return { state: { ...base, phase: 'lost' }, ok: true, fought: { result, opponent, record } };
      if (s.clash >= RUN.clashes) return { state: { ...base, phase: 'won' }, ok: true, fought: { result, opponent, record } };

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
      return { state: { ...next, offers }, ok: true, fought: { result, opponent, record } };
    }
  }
}

/** The opponent you'll face next, for scouting. Deterministic for the run seed and clash. */
export function scout(s: RunState): Opponent {
  return generateOpponent(s.seed, s.clash, { page: pageOf(s.seed), units: s.lastArmy.length ? s.lastArmy : toSpecs(onBoard(s)) });
}

export function runScore(s: RunState): { won: number; reached: number; life: number } {
  return { won: s.records.filter((r) => r.winner === PLAYER).length, reached: s.records.length, life: s.life };
}
