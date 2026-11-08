/**
 * A season of Garden Siege as a pure state machine. Between waves you plant brambles (the maze),
 * unlock elements, grow brambles into those elements' defenders, upgrade them, grow a defender at its
 * best into a hybrid of its element and another you've unlocked, and sell. Then a wave plays out.
 * The same seed and actions always give the same season.
 */
import { DEFENDERS, type DefenderId, type Element, ELEMENTS, ELEMENT_IDS, HYBRIDS, SHED, SHED_EFFECT, SHED_IDS, SIEGE, type ShedId, WAVES } from '../../content/siege';
import { MAPS, mapById } from '../../content/siege-maps';
import { type Field, fieldOf, walksOf } from './field';
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
  /** Coins from pests stopped, the wave's bonus, interest on coins kept through it, and beehives' honey. */
  earned: number;
  bonus: number;
  interest: number;
  honey: number;
}

export interface SiegeState {
  v: 3;
  id: string;
  seed: string;
  /** The garden: a map's id. */
  map: string;
  /** The next wave to come (or the last one, once the season is over). */
  wave: number;
  phase: 'build' | 'won' | 'lost';
  coins: number;
  seedlings: number;
  placed: Placed[];
  nextId: number;
  /** Elements unlocked, in the order they were. */
  elements: Element[];
  /** Ranks bought of each of the Shed's improvements. */
  shed: Record<ShedId, number>;
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
  /** Buys the next rank of one of the Shed's improvements. */
  | { type: 'improve'; item: ShedId }
  /** Plays the next wave to its end. */
  | { type: 'wave' };

export interface SiegeResult { state: SiegeState; ok: boolean; reason?: string; record?: WaveRecord }

export function newSiege(seed: string, id = seed, map = MAPS[0]!.id): SiegeState {
  return {
    v: 3, id, seed, map: mapById(map).id, wave: 1, phase: 'build', coins: mapById(map).startCoins, seedlings: SIEGE.seedlings, placed: [], nextId: 1,
    elements: [], shed: noShed(), records: [],
  };
}

/** Reads a saved season: one from before gardens (v2) was always in the Kitchen Garden. */
export function migrateSiege(s: unknown): SiegeState | null {
  const x = s as (Omit<Partial<SiegeState>, 'v'> & { v?: number }) | null;
  if (!x || !Array.isArray(x.placed) || !Array.isArray(x.elements)) return null;
  if (x.v === 3 && typeof x.map === 'string' && MAPS.some((m) => m.id === x.map) && x.shed) return x as SiegeState;
  if (x.v === 2) return { ...(x as Omit<SiegeState, 'v' | 'map' | 'shed'>), v: 3, map: MAPS[0]!.id, shed: noShed(), records: (x.records ?? []).map((r) => ({ ...r, honey: 0 })) };
  return null;
}

const noShed = (): Record<ShedId, number> => ({ compost: 0, thorns: 0, frame: 0, can: 0 });
/** Coins for the next rank of an improvement, or null when it's at its last. */
export const improvePrice = (s: Pick<SiegeState, 'shed'>, item: ShedId): number | null => SHED[item].costs[s.shed[item]] ?? null;
/** Interest coins kept now would earn through the next wave. */
export const interestOn = (s: Pick<SiegeState, 'shed' | 'coins'>): number =>
  Math.min(SHED_EFFECT.interestCap[s.shed.compost]!, Math.floor(s.coins * SHED_EFFECT.interest[s.shed.compost]!));
/** Honey the beehives will make after the next wave. */
export const honeyOf = (s: Pick<SiegeState, 'placed'>): number =>
  s.placed.reduce((n, p) => n + (DEFENDERS[p.kind].levels[p.level]!.honey ?? 0), 0);

export const fieldNow = (s: Pick<SiegeState, 'map'>): Field => fieldOf(s.map);

/** A piece's price at a level before the cold frame's discount. */
export const listPrice = (kind: DefenderId, level = 0): number => DEFENDERS[kind].levels[level]!.cost;
/** What growing or upgrading to a level costs now: the cold frame takes some off (never below 1). */
export const costOf = (kind: DefenderId, level = 0, s?: Pick<SiegeState, 'shed'>): number => {
  const list = listPrice(kind, level);
  return s ? Math.max(1, Math.ceil(list * (1 - SHED_EFFECT.discount[s.shed.frame]!))) : list;
};
/** Coins to unlock the next element, or null when all four are. */
export const unlockPrice = (s: Pick<SiegeState, 'elements'>): number | null => SIEGE.elementPrices[s.elements.length] ?? null;
export const blockedBy = (placed: readonly Pick<Placed, 'cell'>[]) => new Set(placed.map((p) => p.cell));
/** The tiles pests from each gap walk this wave. A season always has a way through: planting refuses to close it. */
export const walksNow = (s: Pick<SiegeState, 'placed' | 'map'>): number[][] => walksOf(fieldNow(s), blockedBy(s.placed))!;
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
  if (def.tier === 0) {
    return [...ELEMENT_IDS.map((e) => ({ into: ELEMENTS[e].defender, open: s.elements.includes(e), needs: [e] })), { into: 'hive' as DefenderId, open: true, needs: [] }];
  }
  if (def.tier === 1 && def.elements.length && p.level === maxLevel(p.kind)) {
    const own = def.elements[0]!;
    return ELEMENT_IDS.filter((e) => e !== own).map((e) => ({ into: hybridOf(own, e)!, open: s.elements.includes(e), needs: [e] }));
  }
  return [];
}

/** Why a bramble can't go on a tile, or null. */
export function plantBlocker(s: SiegeState, cell: number): string | null {
  const f = fieldNow(s);
  if (cell < 0 || cell >= f.cells) return 'Choose a spot in the garden';
  if (f.entries.includes(cell)) return 'Pests come in there: leave the gap open';
  if (f.exits.includes(cell)) return 'That leads to the bed: leave it open';
  const t = f.terrain[cell];
  // Refusals on the ground say what it does, since tapping it is how a player asks.
  if (t === 'rock') return 'Rock: nothing grows on it, and nothing walks through it';
  if (t === 'pond') return 'The pond: frogs and their kin beside it strike harder';
  if (t === 'mud') return 'Mud slows walking pests, but nothing takes root in it';
  if (t === 'hole') return 'A rabbit hole: a pest that steps on it comes up out of its partner';
  if (s.placed.some((p) => p.cell === cell)) return 'Something is already there';
  const cost = costOf('bramble');
  if (s.coins < cost) return `A bramble costs ${cost} coins`;
  const blocked = blockedBy(s.placed);
  blocked.add(cell);
  if (!walksOf(f, blocked)) return f.entries.length > 1 ? 'That would close a way to the bed' : 'That would close the way to the bed';
  return null;
}

/** Starts the next wave, for the app to step through. */
export function startWave(s: SiegeState): WaveSim {
  return newWaveSim(fieldNow(s), s.wave, walksNow(s), s.placed, { thorns: SHED_EFFECT.thorns[s.shed.thorns]!, harm: SHED_EFFECT.harm[s.shed.can]! });
}

/** What a finished wave leaves: seedlings eaten, coins earned, and the next wave. */
export function finishWave(prev: SiegeState, w: WaveSim): { state: SiegeState; record: WaveRecord } {
  const s: SiegeState = structuredClone(prev);
  const bonus = SIEGE.waveBonus + SIEGE.perWave * w.wave;
  const interest = interestOn(prev);
  const honey = honeyOf(prev);
  const record: WaveRecord = { wave: w.wave, eaten: Math.min(prev.seedlings, w.eaten), stopped: w.stopped, leaked: w.leaked, earned: w.earned, bonus, interest, honey };
  s.records.push(record);
  s.seedlings -= record.eaten;
  s.coins += w.earned + bonus + interest + honey;
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
      const cost = costOf(a.into, 0, s);
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
      const cost = costOf(p.kind, p.level + 1, s);
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
    case 'improve': {
      if (!SHED_IDS.includes(a.item)) return refuse(prev, 'No such improvement');
      const price = improvePrice(s, a.item);
      if (price === null) return refuse(prev, `The ${SHED[a.item].name.toLowerCase()} is as good as it gets`);
      if (s.coins < price) return refuse(prev, `That costs ${coins(price)}`);
      s.coins -= price;
      s.shed[a.item]++;
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
