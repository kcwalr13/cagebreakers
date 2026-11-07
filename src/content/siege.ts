/**
 * Garden Siege, Plot Twist's tower defense: pests come through the gap in the hedge and make for
 * the seedling bed. Between waves you plant hedges to lengthen their path (mazing, as in Green TD)
 * and defenders to stop them; pests come in layers (as in Bloons), and every few waves you pick a
 * hybrid defender of two elements (as in Enfo's). Balance numbers live here; the rules live in
 * src/core/siege.
 */

export const SIEGE = {
  /** The field: squares across and down. Pests come in above the top row and leave below the bottom row. */
  width: 8,
  height: 12,
  /** The gap in the hedge (a column of the top row) and the gate to the bed (a column of the bottom row). */
  entryCol: 3,
  exitCol: 4,
  seedlings: 20,
  startCoins: 30,
  /** A hedge square costs this; it blocks pests that walk, not ones that fly. */
  hedge: 1,
  /** Selling gives back this share of everything spent on a square. */
  sell: 0.7,
  /** Coins after each wave: this bonus plus `perWave` times the wave's number. */
  waveBonus: 4,
  perWave: 1,
  /** Interest on coins kept through a wave: this share, at most `interestCap`. */
  interest: 0.05,
  interestCap: 8,
  /** Pests grow tougher wave by wave: by `toughen` of their strength a wave, and by `toughen2` times the wave squared. */
  toughen: 0.05,
  toughen2: 0.025,
  /** A hybrid is offered after these waves. */
  hybridAfter: [5, 10, 15] as readonly number[],
  /** Seconds of the simulation per tick. */
  tick: 0.05,
  /** Score: seedlings left are worth this many points each, plus coins kept. */
  seedlingPoints: 10,
} as const;

export type PestId = 'slug' | 'snail' | 'beetle' | 'moth' | 'aphids' | 'aphid' | 'greatSnail';

export interface Pest {
  id: PestId;
  name: string;
  plural: string;
  /** Strength: harm it takes to stop. */
  hp: number;
  /** Squares a second. */
  speed: number;
  /** Taken off every hit, unless the defender pierces armour. */
  armour: number;
  /** Flies straight from the gap to the bed, over hedges; only some defenders reach it. */
  flies: boolean;
  /** What it leaves when stopped: its next layer. */
  child?: { kind: PestId; count: number };
  /** Coins for stopping it. */
  bounty: number;
  /** Seedlings it eats if it reaches the bed, besides what its next layers would (default 1). */
  bite?: number;
  text: string;
}

export const PESTS: Record<PestId, Pest> = {
  slug: { id: 'slug', name: 'Slug', plural: 'slugs', hp: 8, speed: 1.0, armour: 0, flies: false, bounty: 1, text: 'Slow and soft.' },
  snail: { id: 'snail', name: 'Snail', plural: 'snails', hp: 14, speed: 0.75, armour: 0, flies: false, child: { kind: 'slug', count: 1 }, bounty: 1, text: 'Its shell cracks to leave a slug.' },
  beetle: { id: 'beetle', name: 'Beetle', plural: 'beetles', hp: 20, speed: 0.85, armour: 2, flies: false, bounty: 3, bite: 2, text: 'Armour takes 2 off every hit. Hedgehogs, toads and mantises bite through it.' },
  moth: { id: 'moth', name: 'Moth', plural: 'moths', hp: 12, speed: 1.35, armour: 0, flies: true, bounty: 2, text: 'Flies straight over the hedges. Frogs, hedgehogs and toads can\'t reach it.' },
  aphids: { id: 'aphids', name: 'Aphid swarm', plural: 'aphid swarms', hp: 12, speed: 1.1, armour: 0, flies: false, child: { kind: 'aphid', count: 3 }, bounty: 1, text: 'Breaks into three aphids.' },
  aphid: { id: 'aphid', name: 'Aphid', plural: 'aphids', hp: 4, speed: 1.4, armour: 0, flies: false, bounty: 0, text: 'Small and quick.' },
  greatSnail: { id: 'greatSnail', name: 'Great Snail', plural: 'great snails', hp: 320, speed: 0.4, armour: 1, flies: false, child: { kind: 'snail', count: 4 }, bounty: 25, bite: 6, text: 'A boss. Its shell takes 1 off every hit, and it leaves four snails.' },
};

export type Element = 'water' | 'earth' | 'air' | 'sun';
export type DefenderId = 'frog' | 'hedgehog' | 'thrush' | 'marigold' | 'toad' | 'dragonfly' | 'bumblebee' | 'mantis';

export interface Level {
  /** Coins to plant (level 1) or to reach this level. */
  cost: number;
  damage: number;
  /** Reach, in squares from its middle. */
  range: number;
  /** Seconds between strikes. */
  every: number;
  /** Harms every pest this close to the one it strikes. */
  splash?: number;
  /** Strikes this many pests at once. */
  targets?: number;
  /** Slows what it strikes to this share of its speed, for `slowFor` seconds. */
  slow?: number;
  slowFor?: number;
}

export interface Defender {
  id: DefenderId;
  name: string;
  elements: readonly Element[];
  /** Reaches flying pests: no, yes, or yes with double harm. */
  air: 'no' | 'yes' | 'double';
  /** Ignores armour. */
  pierce: boolean;
  levels: readonly [Level, Level, Level];
  text: string;
}

export const DEFENDERS: Record<DefenderId, Defender> = {
  frog: {
    id: 'frog', name: 'Frog', elements: ['water'], air: 'no', pierce: false, text: 'Quick tongue, on pests that walk.',
    levels: [
      { cost: 5, damage: 2, range: 1.6, every: 0.7 },
      { cost: 6, damage: 3, range: 1.8, every: 0.65 },
      { cost: 12, damage: 5, range: 2.0, every: 0.6, slow: 0.6, slowFor: 1 },
    ],
  },
  hedgehog: {
    id: 'hedgehog', name: 'Hedgehog', elements: ['earth'], air: 'no', pierce: true, text: 'Bites through armour, close up.',
    levels: [
      { cost: 7, damage: 4, range: 1.3, every: 1.1 },
      { cost: 8, damage: 6, range: 1.4, every: 1.0 },
      { cost: 14, damage: 9, range: 1.5, every: 1.0, splash: 0.8 },
    ],
  },
  thrush: {
    id: 'thrush', name: 'Thrush', elements: ['air'], air: 'double', pierce: false, text: 'Long reach, and double harm on pests that fly.',
    levels: [
      { cost: 8, damage: 2, range: 2.8, every: 0.8 },
      { cost: 8, damage: 3, range: 3.1, every: 0.75 },
      { cost: 14, damage: 4, range: 3.4, every: 0.55 },
    ],
  },
  marigold: {
    id: 'marigold', name: 'Marigold', elements: ['sun'], air: 'yes', pierce: false, text: 'Warms every pest in reach at once.',
    levels: [
      { cost: 10, damage: 2, range: 1.6, every: 1.0, targets: 99 },
      { cost: 10, damage: 3, range: 1.8, every: 1.0, targets: 99 },
      { cost: 16, damage: 4, range: 2.1, every: 0.9, targets: 99 },
    ],
  },
  toad: {
    id: 'toad', name: 'Toad', elements: ['water', 'earth'], air: 'no', pierce: true, text: 'A heavy splash that slows everything it lands on.',
    levels: [
      { cost: 18, damage: 6, range: 1.8, every: 1.2, splash: 1.1, slow: 0.55, slowFor: 1.5 },
      { cost: 14, damage: 9, range: 2.0, every: 1.1, splash: 1.2, slow: 0.5, slowFor: 1.5 },
      { cost: 22, damage: 14, range: 2.2, every: 1.0, splash: 1.3, slow: 0.45, slowFor: 2 },
    ],
  },
  dragonfly: {
    id: 'dragonfly', name: 'Dragonfly', elements: ['water', 'air'], air: 'double', pierce: false, text: 'Darts at two pests at once, from far off.',
    levels: [
      { cost: 18, damage: 3, range: 3.2, every: 0.45, targets: 2 },
      { cost: 14, damage: 4, range: 3.5, every: 0.4, targets: 2 },
      { cost: 22, damage: 6, range: 3.8, every: 0.35, targets: 3 },
    ],
  },
  bumblebee: {
    id: 'bumblebee', name: 'Bumblebee', elements: ['air', 'sun'], air: 'yes', pierce: false, text: 'Stings everything near the pest it chases.',
    levels: [
      { cost: 18, damage: 4, range: 2.4, every: 0.7, splash: 0.9 },
      { cost: 14, damage: 6, range: 2.6, every: 0.65, splash: 1.0 },
      { cost: 22, damage: 9, range: 2.8, every: 0.6, splash: 1.1 },
    ],
  },
  mantis: {
    id: 'mantis', name: 'Mantis', elements: ['earth', 'sun'], air: 'yes', pierce: true, text: 'One great strike, through any armour.',
    levels: [
      { cost: 18, damage: 14, range: 2.0, every: 1.3 },
      { cost: 14, damage: 22, range: 2.2, every: 1.2 },
      { cost: 22, damage: 34, range: 2.4, every: 1.1 },
    ],
  },
};
export const BASIC: readonly DefenderId[] = ['frog', 'hedgehog', 'thrush', 'marigold'];
export const HYBRIDS: readonly DefenderId[] = ['toad', 'dragonfly', 'bumblebee', 'mantis'];

/** A group of one kind of pest in a wave: `count` of them, `gap` seconds apart, the first `at` seconds in. */
export interface Group { kind: PestId; count: number; gap: number; at: number }

const g = (kind: PestId, count: number, gap: number, at = 0): Group => ({ kind, count, gap, at });

/** The season's waves. */
export const WAVES: readonly (readonly Group[])[] = [
  [g('slug', 8, 1.2)],
  [g('slug', 12, 0.9)],
  [g('snail', 8, 1.3)],
  [g('slug', 10, 0.8), g('snail', 6, 1.2, 4)],
  [g('slug', 10, 0.8), g('moth', 6, 1.5, 3)],
  [g('beetle', 6, 1.6), g('slug', 8, 0.8, 2)],
  [g('aphids', 10, 1.2)],
  [g('snail', 14, 0.8), g('moth', 6, 1.4, 5)],
  [g('beetle', 8, 1.3), g('aphids', 6, 1.2, 3)],
  [g('greatSnail', 1, 1, 4), g('slug', 10, 0.7)],
  [g('slug', 20, 0.45), g('snail', 8, 0.9, 3)],
  [g('moth', 14, 0.8)],
  [g('beetle', 14, 0.9)],
  [g('aphids', 12, 0.8), g('snail', 10, 0.8, 2)],
  [g('beetle', 10, 0.9), g('moth', 8, 1.0, 2), g('aphids', 8, 1.0, 4)],
  [g('snail', 30, 0.45)],
  [g('moth', 16, 0.7), g('beetle', 10, 1.0, 3)],
  [g('aphids', 16, 0.7), g('beetle', 12, 0.9, 2)],
  [g('beetle', 12, 0.8), g('moth', 12, 0.8, 1), g('aphids', 12, 0.8, 2), g('snail', 12, 0.6, 3)],
  [g('greatSnail', 2, 6, 3), g('snail', 16, 0.5), g('moth', 10, 0.8, 4)],
];
