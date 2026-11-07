/**
 * A season of Garden Siege as a pure state machine. Between waves you plant brambles (the maze),
 * unlock elements, grow brambles into those elements' defenders, upgrade them, grow a defender at its
 * best into a hybrid of its element and another you've unlocked, and sell. Then a wave plays out.
 * The same seed and actions always give the same season.
 */
import { DEFENDERS, type DefenderId, type Element, ELEMENTS, ELEMENT_IDS, HYBRIDS, SIEGE, WAVES } from '../../content/siege';
import { CELLS, ENTRY, EXIT, walkOf } from './field';
import { type WaveSim, newWaveSim, runWave } from './sim';

export interface Placed {
  id: number;
  kind: DefenderId;
  cell: number;
  /** 0, 1 or 2 (a bramble stays 0). */
  level: number;
  /** Coins spent on this square, for selling. */
  spent: number;
}

export interface WaveRecord {
  wave: number;
  eaten: number;
  stopped: number;
  leaked: number;
  /** Coins from pests stopped, the wave's bonus, and interest on coins kept through it. */
  earned: number;
  bonus: number;
  interest: number;
}

export interface SiegeState {
  v: 2;
  id: string;
  seed: string;
  /** The next wave to come (or the last one, once the season is over). */
  wave: number;
  phase: 'build' | 'won' | 'lost';
  coins: number;
  seedlings: number;
  placed: Placed[];
  nextId: number;
  /** Elements unlocked, in the order they were. */
  elements: Element[];
  records: WaveRecord[];
}

export type SiegeAction =
  /** Plants a bramble. */
  | { type: 'plant'; cell: number }
  /** Grows a bramble into an element's defender, or a defender at its best into a hybrid. */
  | { type: 'grow'; id: number; into: DefenderId }
  | { type: 'upgrade'; id: number }
  | { type: 'sell'; id: number }
  | { type: 'unlock'; element: Element }
  /** Plays the next wave to its end. */
  | { type: 'wave' };

export interface SiegeResult { state: SiegeState; ok: boolean; reason?: string; record?: WaveRecord }

export function newSiege(seed: string, id = seed): SiegeState {
  return { v: 2, id, seed, wave: 1, phase: 'build', coins: SIEGE.startCoins, seedlings: SIEGE.seedlings, placed: [], nextId: 1, elements: [], records: [] };
}

export const costOf = (kind: DefenderId, level = 0): number => DEFENDERS[kind].levels[level]!.cost;
/** Coins to unlock the next element, or null when all four are. */
export const unlockPrice = (s: Pick<SiegeState, 'elements'>): number | null => SIEGE.elementPrices[s.elements.length] ?? null;
export const blockedBy = (placed: readonly Pick<Placed, 'cell'>[]) => new Set(placed.map((p) => p.cell));
/** The squares pests walk this wave. A season always has a way through: planting refuses to close it. */
export const walkNow = (s: Pick<SiegeState, 'placed'>): number[] => walkOf(blockedBy(s.placed))!;
export const refundOf = (p: Pick<Placed, 'spent'>) => Math.floor(p.spent * SIEGE.sell);
export const maxLevel = (kind: DefenderId) => DEFENDERS[kind].levels.length - 1;

/** The hybrid of two elements. */
export function hybridOf(a: Element, b: Element): DefenderId | null {
  return HYBRIDS.find((h) => DEFENDERS[h].elements.includes(a) && DEFENDERS[h].elements.includes(b) && a !== b) ?? null;
}

/**
 * Everything a piece could grow into, unlocked or not: a bramble into each element's defender, a
 * defender at its best into the hybrids of its element. `open` says whether it can now.
 */
export function growthsOf(s: Pick<SiegeState, 'elements'>, p: Pick<Placed, 'kind' | 'level'>): { into: DefenderId; open: boolean; needs: Element[] }[] {
  const def = DEFENDERS[p.kind];
  if (def.tier === 0) return ELEMENT_IDS.map((e) => ({ into: ELEMENTS[e].defender, open: s.elements.includes(e), needs: [e] }));
  if (def.tier === 1 && p.level === maxLevel(p.kind)) {
    const own = def.elements[0]!;
    return ELEMENT_IDS.filter((e) => e !== own).map((e) => ({ into: hybridOf(own, e)!, open: s.elements.includes(e), needs: [e] }));
  }
  return [];
}

/** Why a bramble can't go on a square, or null. */
export function plantBlocker(s: SiegeState, cell: number): string | null {
  if (cell < 0 || cell >= CELLS) return 'Choose a square in the garden';
  if (cell === ENTRY) return 'Pests come in there: leave the gap open';
  if (cell === EXIT) return 'That square leads to the bed: leave it open';
  if (s.placed.some((p) => p.cell === cell)) return 'Something is already there';
  const cost = costOf('bramble');
  if (s.coins < cost) return `A bramble costs ${cost} coins`;
  const blocked = blockedBy(s.placed);
  blocked.add(cell);
  if (!walkOf(blocked)) return 'That would close the way to the bed';
  return null;
}

/** Starts the next wave, for the app to step through. */
export function startWave(s: SiegeState): WaveSim {
  return newWaveSim(s.wave, walkNow(s), s.placed);
}

/** What a finished wave leaves: seedlings eaten, coins earned, and the next wave. */
export function finishWave(prev: SiegeState, w: WaveSim): { state: SiegeState; record: WaveRecord } {
  const s: SiegeState = structuredClone(prev);
  const bonus = SIEGE.waveBonus + SIEGE.perWave * w.wave;
  const interest = Math.min(SIEGE.interestCap, Math.floor(prev.coins * SIEGE.interest));
  const record: WaveRecord = { wave: w.wave, eaten: Math.min(prev.seedlings, w.eaten), stopped: w.stopped, leaked: w.leaked, earned: w.earned, bonus, interest };
  s.records.push(record);
  s.seedlings -= record.eaten;
  s.coins += w.earned + bonus + interest;
  if (s.seedlings <= 0) s.phase = 'lost';
  else if (w.wave >= WAVES.length) s.phase = 'won';
  else s.wave = w.wave + 1;
  return { state: s, record };
}

const refuse = (state: SiegeState, reason: string): SiegeResult => ({ state, ok: false, reason });
const coins = (n: number) => `${n} ${n === 1 ? 'coin' : 'coins'}`;

export function actSiege(prev: SiegeState, a: SiegeAction): SiegeResult {
  if (prev.phase !== 'build') return refuse(prev, 'The season is over');
  const s: SiegeState = structuredClone(prev);
  switch (a.type) {
    case 'plant': {
      const why = plantBlocker(s, a.cell);
      if (why) return refuse(prev, why);
      const cost = costOf('bramble');
      s.coins -= cost;
      s.placed.push({ id: s.nextId++, kind: 'bramble', cell: a.cell, level: 0, spent: cost });
      return { state: s, ok: true };
    }
    case 'grow': {
      const p = s.placed.find((x) => x.id === a.id);
      if (!p) return refuse(prev, 'Nothing there');
      const g = growthsOf(s, p).find((x) => x.into === a.into);
      if (!g) return refuse(prev, DEFENDERS[p.kind].tier === 1 ? `Upgrade it to its best first` : `A ${DEFENDERS[p.kind].name.toLowerCase()} can't grow into that`);
      if (!g.open) return refuse(prev, `Unlock ${g.needs.map((e) => ELEMENTS[e].name.toLowerCase()).join(' and ')} first`);
      const cost = costOf(a.into);
      if (s.coins < cost) return refuse(prev, `That costs ${coins(cost)}`);
      s.coins -= cost;
      p.kind = a.into;
      p.level = 0;
      p.spent += cost;
      return { state: s, ok: true };
    }
    case 'upgrade': {
      const p = s.placed.find((x) => x.id === a.id);
      if (!p) return refuse(prev, 'Nothing there');
      if (p.level >= maxLevel(p.kind)) return refuse(prev, DEFENDERS[p.kind].tier === 0 ? 'Grow it into a defender instead' : 'Already at its best');
      const cost = costOf(p.kind, p.level + 1);
      if (s.coins < cost) return refuse(prev, `That costs ${coins(cost)}`);
      s.coins -= cost;
      p.level++;
      p.spent += cost;
      return { state: s, ok: true };
    }
    case 'sell': {
      const p = s.placed.find((x) => x.id === a.id);
      if (!p) return refuse(prev, 'Nothing there');
      s.placed = s.placed.filter((x) => x.id !== a.id);
      s.coins += refundOf(p);
      return { state: s, ok: true };
    }
    case 'unlock': {
      if (!ELEMENT_IDS.includes(a.element)) return refuse(prev, 'No such element');
      if (s.elements.includes(a.element)) return refuse(prev, 'Already unlocked');
      const price = unlockPrice(s)!;
      if (s.coins < price) return refuse(prev, `Your next element costs ${coins(price)}`);
      s.coins -= price;
      s.elements.push(a.element);
      return { state: s, ok: true };
    }
    case 'wave': {
      const { state, record } = finishWave(prev, runWave(startWave(prev)));
      return { state, ok: true, record };
    }
  }
}

/** Seedlings left, worth SIEGE.seedlingPoints each, plus coins kept. */
export const siegeScore = (s: Pick<SiegeState, 'seedlings' | 'coins'>) => ({
  seedlings: Math.max(0, s.seedlings) * SIEGE.seedlingPoints, coins: s.coins, total: Math.max(0, s.seedlings) * SIEGE.seedlingPoints + s.coins,
});
