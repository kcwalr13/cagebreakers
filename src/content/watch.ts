/**
 * Night Watch, the garden's second mode (Blind Siege in the concept): at dusk the mist comes down
 * and pests creep along a hidden trail to the seedling bed. You read the clues, mark the trail, and
 * plant defenders where it runs. Balance numbers live here; the rules live in src/core/watch.
 */
import type { ClueOptions } from '../core/watch/trail';

export const WATCH = {
  /** The garden: squares across and down. */
  width: 7,
  height: 8,
  /** Nights in a season. */
  nights: 6,
  /** Seedlings in the bed at dusk on the first night; a pest that reaches the bed eats one. */
  seedlings: 5,
  startCoins: 7,
  /** Coins to light one misty square with the lantern and see what it holds. */
  lantern: 2,
  /** Coins to move a defender planted on an earlier night (one planted tonight always moves free). */
  move: 0,
  /** Coins for every pest stopped, and each morning after a night's watch. */
  perStopped: 0,
  morning: 3,
  /** Score: coins kept, plus this for each seedling left. */
  seedlingPoints: 10,
  /** Trail length on a night. */
  trail: [11, 17] as const,
} as const;

export type DefenderId = 'frog' | 'hedgehog' | 'thrush';
/** Which squares a defender reaches, besides its own. */
export type Reach = 'around' | 'beside' | 'lines';

export interface Defender {
  id: DefenderId;
  name: string;
  cost: number;
  /** Harm to a pest on each square of its reach the pest crosses. */
  bite: number;
  reach: Reach;
  text: string;
}

export const DEFENDERS: Record<DefenderId, Defender> = {
  frog: { id: 'frog', name: 'Frog', cost: 2, bite: 1, reach: 'around', text: 'Snaps at pests on the eight squares around it.' },
  hedgehog: { id: 'hedgehog', name: 'Hedgehog', cost: 3, bite: 2, reach: 'beside', text: 'Bites hard on the four squares beside it.' },
  thrush: { id: 'thrush', name: 'Thrush', cost: 3, bite: 1, reach: 'lines', text: 'Swoops along its row and column, up to two squares away.' },
};
export const DEFENDER_IDS = Object.keys(DEFENDERS) as DefenderId[];

export type PestId = 'slug' | 'snail';
export interface Pest { id: PestId; name: string; plural: string; hp: number }
export const PESTS: Record<PestId, Pest> = {
  slug: { id: 'slug', name: 'Slug', plural: 'slugs', hp: 6 },
  snail: { id: 'snail', name: 'Snail', plural: 'snails', hp: 12 },
};

export interface NightShape {
  /** The pests that come, in the order they come. */
  pests: readonly PestId[];
  clues: ClueOptions;
}

/** Each night of a season: more pests, fewer tallies, more dew to read. */
export const NIGHTS: readonly NightShape[] = [
  { pests: ['slug', 'slug'], clues: { hideTallies: 0, depth: 0, spareDew: 2 } },
  { pests: ['slug', 'slug', 'slug'], clues: { hideTallies: 4, depth: 0, spareDew: 1 } },
  { pests: ['slug', 'snail', 'slug'], clues: { hideTallies: 7, depth: 0, spareDew: 1 } },
  { pests: ['slug', 'slug', 'snail', 'slug'], clues: { hideTallies: 10, depth: 0, spareDew: 0 } },
  { pests: ['snail', 'slug', 'snail', 'slug'], clues: { hideTallies: 15, depth: 0, spareDew: 0 } },
  { pests: ['slug', 'snail', 'slug', 'snail', 'slug', 'snail'], clues: { hideTallies: 15, depth: 1, spareDew: 0 } },
];
