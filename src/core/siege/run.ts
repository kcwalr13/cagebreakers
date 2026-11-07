/**
 * A season of Garden Siege as a pure state machine: build between waves (hedges, defenders,
 * upgrades, selling), then a wave plays out; every few waves, pick a hybrid. The same seed and
 * actions always give the same season.
 */
import { BASIC, DEFENDERS, type DefenderId, HYBRIDS, SIEGE, WAVES } from '../../content/siege';
import { stream } from '../rng';
import { CELLS, ENTRY, EXIT, walkOf } from './field';
import { type WaveSim, newWaveSim, runWave } from './sim';

export type PieceKind = 'hedge' | DefenderId;

export interface Placed {
  id: number;
  kind: PieceKind;
  cell: number;
  /** 0, 1 or 2; hedges stay 0. */
  level: number;
  /** Coins spent on it, for selling. */
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
  v: 1;
  id: string;
  seed: string;
  /** The next wave to come (or the last one, once the season is over). */
  wave: number;
  phase: 'build' | 'pick' | 'won' | 'lost';
  coins: number;
  seedlings: number;
  placed: Placed[];
  nextId: number;
  /** Hybrids picked so far: they can be planted. */
  unlocked: DefenderId[];
  /** Hybrids on offer, while picking. */
  offer: DefenderId[];
  records: WaveRecord[];
}

export type SiegeAction =
  | { type: 'build'; kind: PieceKind; cell: number }
  | { type: 'upgrade'; id: number }
  | { type: 'sell'; id: number }
  | { type: 'pick'; kind: DefenderId }
  /** Plays the next wave to its end. */
  | { type: 'wave' };

export interface SiegeResult { state: SiegeState; ok: boolean; reason?: string; record?: WaveRecord }

export function newSiege(seed: string, id = seed): SiegeState {
  return {
    v: 1, id, seed, wave: 1, phase: 'build', coins: SIEGE.startCoins, seedlings: SIEGE.seedlings, placed: [], nextId: 1,
    unlocked: [], offer: [], records: [],
  };
}

export const costOf = (kind: PieceKind, level = 0): number => (kind === 'hedge' ? SIEGE.hedge : DEFENDERS[kind].levels[level]!.cost);
export const canPlant = (s: Pick<SiegeState, 'unlocked'>, kind: PieceKind) => kind === 'hedge' || BASIC.includes(kind) || s.unlocked.includes(kind);
export const blockedBy = (placed: readonly Pick<Placed, 'cell'>[]) => new Set(placed.map((p) => p.cell));
/** The squares pests walk this wave. A season always has a way through: building refuses to close it. */
export const walkNow = (s: Pick<SiegeState, 'placed'>): number[] => walkOf(blockedBy(s.placed))!;
export const refundOf = (p: Pick<Placed, 'spent'>) => Math.floor(p.spent * SIEGE.sell);

/** Why a piece can't go on a square, or null. */
export function buildBlocker(s: SiegeState, kind: PieceKind, cell: number): string | null {
  if (cell < 0 || cell >= CELLS) return 'Choose a square in the garden';
  if (cell === ENTRY) return 'Pests come in there: leave the gap open';
  if (cell === EXIT) return 'That square leads to the bed: leave it open';
  if (s.placed.some((p) => p.cell === cell)) return 'Something is already there';
  if (!canPlant(s, kind)) return 'Pick that hybrid first';
  const cost = costOf(kind);
  if (s.coins < cost) return `That costs ${cost} ${cost === 1 ? 'coin' : 'coins'}`;
  const blocked = blockedBy(s.placed);
  blocked.add(cell);
  if (!walkOf(blocked)) return 'That would close the way to the bed';
  return null;
}

/** Starts the next wave, for the app to step through. */
export function startWave(s: SiegeState): WaveSim {
  return newWaveSim(s.wave, walkNow(s), s.placed.filter((p) => p.kind !== 'hedge') as { id: number; kind: DefenderId; level: number; cell: number }[]);
}

/** Hybrids offered after a wave: two not picked yet, from the season's seed. */
export function offerAfter(s: Pick<SiegeState, 'seed' | 'unlocked'>, wave: number): DefenderId[] {
  const left = HYBRIDS.filter((h) => !s.unlocked.includes(h));
  return stream(s.seed, `siege.offer:${wave}`).shuffle(left).slice(0, 2);
}

/** What a finished wave leaves: seedlings eaten, coins earned, and what comes next. */
export function finishWave(prev: SiegeState, w: WaveSim): { state: SiegeState; record: WaveRecord } {
  const s: SiegeState = structuredClone(prev);
  const bonus = SIEGE.waveBonus + SIEGE.perWave * w.wave;
  const interest = Math.min(SIEGE.interestCap, Math.floor(prev.coins * SIEGE.interest));
  const record: WaveRecord = { wave: w.wave, eaten: Math.min(prev.seedlings, w.eaten), stopped: w.stopped, leaked: w.leaked, earned: w.earned, bonus, interest };
  s.records.push(record);
  s.seedlings -= record.eaten;
  s.coins += w.earned + bonus + interest;
  if (s.seedlings <= 0) { s.phase = 'lost'; return { state: s, record }; }
  if (w.wave >= WAVES.length) { s.phase = 'won'; return { state: s, record }; }
  s.wave = w.wave + 1;
  const offer = SIEGE.hybridAfter.includes(w.wave) ? offerAfter(s, w.wave) : [];
  s.offer = offer;
  s.phase = offer.length ? 'pick' : 'build';
  return { state: s, record };
}

const refuse = (state: SiegeState, reason: string): SiegeResult => ({ state, ok: false, reason });

export function actSiege(prev: SiegeState, a: SiegeAction): SiegeResult {
  if (prev.phase === 'won' || prev.phase === 'lost') return refuse(prev, 'The season is over');
  if (prev.phase === 'pick' && a.type !== 'pick') return refuse(prev, 'Pick a hybrid first');
  const s: SiegeState = structuredClone(prev);
  switch (a.type) {
    case 'build': {
      const why = buildBlocker(s, a.kind, a.cell);
      if (why) return refuse(prev, why);
      const cost = costOf(a.kind);
      s.coins -= cost;
      s.placed.push({ id: s.nextId++, kind: a.kind, cell: a.cell, level: 0, spent: cost });
      return { state: s, ok: true };
    }
    case 'upgrade': {
      const p = s.placed.find((x) => x.id === a.id);
      if (!p) return refuse(prev, 'Nothing there');
      if (p.kind === 'hedge') return refuse(prev, 'A hedge is just a hedge');
      if (p.level >= 2) return refuse(prev, 'Already at its best');
      const cost = costOf(p.kind, p.level + 1);
      if (s.coins < cost) return refuse(prev, `That costs ${cost} coins`);
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
    case 'pick': {
      if (prev.phase !== 'pick') return refuse(prev, 'No hybrid on offer now');
      if (!prev.offer.includes(a.kind)) return refuse(prev, 'That hybrid isn\'t on offer');
      s.unlocked.push(a.kind);
      s.offer = [];
      s.phase = 'build';
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
