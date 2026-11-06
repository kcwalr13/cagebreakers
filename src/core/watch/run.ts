/**
 * A season of Night Watch as a pure state machine: the same seed and actions always give the same
 * season. Each night's trail and clues come from the seed; the player marks squares, lights a few
 * with the lantern, plants defenders, then lets the pests come. The night is resolved here, so the
 * app only shows it.
 */
import { DEFENDERS, type DefenderId, NIGHTS, PESTS, type PestId, WATCH } from '../../content/watch';
import { stream } from '../rng';
import { type Board, boardOf } from './board';
import { CLEAR, type Clues, type Mark, TRAIL, UNKNOWN, drawTrail, isPath, makeClues } from './trail';

export interface Planted {
  id: number;
  kind: DefenderId;
  cell: number;
  /** The night it was planted. */
  night: number;
  /** The last night it was moved (paid for once, then free that night). */
  moved?: number;
}
export interface Night { trail: number[]; clues: Clues }

export interface PestWalk {
  kind: PestId;
  /** Harm taken by the time it left each trail square, in trail order. */
  harm: number[];
  /** Where on the trail it was stopped (an index), or null when it reached the bed. */
  stoppedAt: number | null;
}

export interface NightRecord {
  night: number;
  walks: PestWalk[];
  /** Defenders planted on the trail: trodden down before the first pest passed. */
  trampled: DefenderId[];
  /** Seedlings eaten. */
  lost: number;
  coins: number;
  /** The night's trail, shown when the mist lifts. */
  trail: number[];
}

export interface WatchState {
  v: 1;
  id: string;
  seed: string;
  night: number;
  phase: 'plan' | 'done' | 'lost';
  coins: number;
  seedlings: number;
  defenders: Planted[];
  nextId: number;
  /** The player's marks on misty squares tonight. */
  marks: Mark[];
  /** Squares lit with the lantern tonight. */
  lit: number[];
  current: Night;
  records: NightRecord[];
}

export type WatchAction =
  | { type: 'mark'; cell: number; mark: Mark }
  | { type: 'plant'; kind: DefenderId; cell: number }
  | { type: 'move'; id: number; cell: number }
  /** Takes back a defender planted tonight, for its full price. */
  | { type: 'lift'; id: number }
  | { type: 'lantern'; cell: number }
  /** Lets the pests come: the night is resolved. */
  | { type: 'dusk' };

export interface WatchResult { state: WatchState; ok: boolean; reason?: string; night?: NightRecord }

export const watchBoard = (): Board => boardOf(WATCH.width, WATCH.height);

/** A night's trail and clues, from the season's seed. */
export function nightOf(seed: string, night: number): Night {
  const b = watchBoard();
  const rng = stream(seed, `watch.night:${night}`);
  const shape = NIGHTS[Math.min(night, NIGHTS.length) - 1]!;
  const trail = drawTrail(rng, b, WATCH.trail[0], WATCH.trail[1]);
  return { trail, clues: makeClues(rng, b, trail, shape.clues) };
}

export const pestsOf = (night: number): readonly PestId[] => NIGHTS[Math.min(night, NIGHTS.length) - 1]!.pests;

export function newWatch(seed: string, id = seed): WatchState {
  const b = watchBoard();
  return {
    v: 1, id, seed, night: 1, phase: 'plan', coins: WATCH.startCoins, seedlings: WATCH.seedlings,
    defenders: [], nextId: 1, marks: new Array<Mark>(b.cells).fill(UNKNOWN), lit: [], current: nightOf(seed, 1), records: [],
  };
}

/** The squares a defender standing on `cell` reaches. */
export function reachOf(b: Board, kind: DefenderId, cell: number): number[] {
  const reach = DEFENDERS[kind].reach;
  if (reach === 'around') return b.around[cell]!.slice();
  if (reach === 'beside') return b.orth[cell]!.slice();
  const r = b.rowOf(cell), k = b.colOf(cell), out: number[] = [];
  for (const [dr, dk] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    for (let step = 1; step <= 2; step++) {
      const rr = r + dr * step, kk = k + dk * step;
      if (rr >= 0 && rr < b.height && kk >= 0 && kk < b.width) out.push(b.cellAt(rr, kk));
    }
  }
  return out;
}

/** Harm to a pest on each square, from these defenders. */
export function harmMap(b: Board, defenders: readonly Pick<Planted, 'kind' | 'cell'>[]): number[] {
  const out = new Array<number>(b.cells).fill(0);
  for (const d of defenders) for (const c of reachOf(b, d.kind, d.cell)) out[c]! += DEFENDERS[d.kind].bite;
  return out;
}

/** What a square shows tonight: trail or clear when it's known (printed or lit), else null. */
export function knownAt(s: WatchState, cell: number): 'trail' | 'clear' | null {
  const { clues, trail } = s.current;
  if (cell === clues.entry || cell === clues.exit || clues.glints.includes(cell)) return 'trail';
  if (clues.dew.some((d) => d.cell === cell)) return 'clear';
  if (s.lit.includes(cell)) return trail.includes(cell) ? 'trail' : 'clear';
  return null;
}

/** Dew to show on a square: printed, or found by the lantern on a square off the trail. */
export function dewAt(s: WatchState, cell: number): number | null {
  const printed = s.current.clues.dew.find((d) => d.cell === cell);
  if (printed) return printed.n;
  if (s.lit.includes(cell) && !s.current.trail.includes(cell)) {
    const b = watchBoard();
    return b.around[cell]!.filter((c) => s.current.trail.includes(c)).length;
  }
  return null;
}

/** The squares the player takes for trail tonight: known ones and the ones they marked. */
export function markedTrail(s: WatchState): number[] {
  const b = watchBoard();
  return b.all.filter((c) => knownAt(s, c) === 'trail' || (knownAt(s, c) === null && s.marks[c] === TRAIL));
}

/** Whether the squares the player takes for trail make one whole trail from the gap to the bed. */
export function markedWhole(s: WatchState): boolean {
  return isPath(watchBoard(), markedTrail(s), s.current.clues.entry, s.current.clues.exit);
}

/** Walks one pest along a trail past these defenders. */
export function walk(b: Board, defenders: readonly Pick<Planted, 'kind' | 'cell'>[], trail: readonly number[], kind: PestId): PestWalk {
  const map = harmMap(b, defenders);
  const hp = PESTS[kind].hp;
  const harm: number[] = [];
  let total = 0, stoppedAt: number | null = null;
  for (let i = 0; i < trail.length; i++) {
    total += map[trail[i]!]!;
    harm.push(total);
    if (total >= hp) { stoppedAt = i; break; }
  }
  return { kind, harm, stoppedAt };
}

/**
 * How tonight would go if the trail were where the player has marked it: for each kind of pest
 * coming, the harm it would take crossing the marked squares, against what stops it. Defenders on
 * marked trail squares are left out: they'd be trodden down.
 */
export function readout(s: WatchState): { kind: PestId; count: number; harm: number; hp: number }[] {
  const b = watchBoard();
  const marked = new Set(markedTrail(s));
  const standing = s.defenders.filter((d) => !marked.has(d.cell));
  const map = harmMap(b, standing);
  const harm = [...marked].reduce((sum, c) => sum + map[c]!, 0);
  const kinds = [...new Set(pestsOf(s.night))];
  return kinds.map((kind) => ({ kind, count: pestsOf(s.night).filter((p) => p === kind).length, harm, hp: PESTS[kind].hp }));
}

const refuse = (state: WatchState, reason: string): WatchResult => ({ state, ok: false, reason });

/** Why a defender can't stand on a square, or null. `ignore` is a defender being moved. */
function plantBlocker(s: WatchState, cell: number, ignore = -1): string | null {
  const b = watchBoard();
  if (cell < 0 || cell >= b.cells) return 'Choose a square in the garden';
  if (knownAt(s, cell) === 'trail') return "That's the trail: it would be trodden down";
  if (s.defenders.some((d) => d.cell === cell && d.id !== ignore)) return 'Something is already there';
  return null;
}

export function actWatch(prev: WatchState, a: WatchAction): WatchResult {
  if (prev.phase !== 'plan') return refuse(prev, 'The season is over');
  const s: WatchState = structuredClone(prev);
  const b = watchBoard();
  switch (a.type) {
    case 'mark': {
      if (a.cell < 0 || a.cell >= b.cells) return refuse(prev, 'Choose a square in the garden');
      if (knownAt(s, a.cell) !== null) return refuse(prev, 'That square is already known');
      s.marks[a.cell] = a.mark;
      return { state: s, ok: true };
    }
    case 'plant': {
      const d = DEFENDERS[a.kind];
      if (!d) return refuse(prev, 'No such defender');
      const why = plantBlocker(s, a.cell);
      if (why) return refuse(prev, why);
      if (s.coins < d.cost) return refuse(prev, `A ${d.name.toLowerCase()} costs ${d.cost} coins`);
      s.coins -= d.cost;
      s.defenders.push({ id: s.nextId++, kind: a.kind, cell: a.cell, night: s.night });
      return { state: s, ok: true };
    }
    case 'move': {
      const d = s.defenders.find((x) => x.id === a.id);
      if (!d) return refuse(prev, 'Nothing to move');
      if (d.cell === a.cell) return { state: prev, ok: true };
      const why = plantBlocker(s, a.cell, d.id);
      if (why) return refuse(prev, why);
      const cost = d.night === s.night || d.moved === s.night ? 0 : WATCH.move;
      if (s.coins < cost) return refuse(prev, `Moving a defender from an earlier night costs ${cost} coin`);
      s.coins -= cost;
      d.cell = a.cell;
      d.moved = s.night;
      return { state: s, ok: true };
    }
    case 'lift': {
      const d = s.defenders.find((x) => x.id === a.id);
      if (!d) return refuse(prev, 'Nothing to take back');
      if (d.night !== s.night) return refuse(prev, 'Only defenders planted tonight can be taken back');
      s.defenders = s.defenders.filter((x) => x.id !== a.id);
      s.coins += DEFENDERS[d.kind].cost;
      return { state: s, ok: true };
    }
    case 'lantern': {
      if (a.cell < 0 || a.cell >= b.cells) return refuse(prev, 'Choose a square in the garden');
      if (knownAt(s, a.cell) !== null) return refuse(prev, 'That square is already known');
      if (s.coins < WATCH.lantern) return refuse(prev, `The lantern costs ${WATCH.lantern} coins`);
      s.coins -= WATCH.lantern;
      s.lit.push(a.cell);
      s.marks[a.cell] = UNKNOWN;
      return { state: s, ok: true };
    }
    case 'dusk': {
      const { trail } = s.current;
      const on = new Set(trail);
      const trampled = s.defenders.filter((d) => on.has(d.cell));
      s.defenders = s.defenders.filter((d) => !on.has(d.cell));
      const walks = pestsOf(s.night).map((kind) => walk(b, s.defenders, trail, kind));
      const stopped = walks.filter((w) => w.stoppedAt !== null).length;
      const lost = Math.min(s.seedlings, walks.length - stopped);
      const coins = stopped * WATCH.perStopped + WATCH.morning;
      const record: NightRecord = { night: s.night, walks, trampled: trampled.map((d) => d.kind), lost, coins, trail: trail.slice() };
      s.records.push(record);
      s.seedlings -= lost;
      s.coins += coins;
      if (s.seedlings <= 0) s.phase = 'lost';
      else if (s.night >= WATCH.nights) s.phase = 'done';
      else {
        s.night++;
        s.current = nightOf(s.seed, s.night);
        s.marks = new Array<Mark>(b.cells).fill(UNKNOWN);
        s.lit = [];
      }
      return { state: s, ok: true, night: record };
    }
  }
}

/** Seedlings left, worth WATCH.seedlingPoints each, plus coins kept. */
export const watchScore = (s: Pick<WatchState, 'seedlings' | 'coins'>) => ({
  seedlings: s.seedlings * WATCH.seedlingPoints, coins: s.coins, total: s.seedlings * WATCH.seedlingPoints + s.coins,
});

export { CLEAR, TRAIL, UNKNOWN };
