/**
 * Garden Siege, Plot Twist's tower defense: pests come through the gap in the hedge and make for
 * the seedling bed. Between waves you plant brambles to lengthen their path (mazing, as in Green TD);
 * a bramble scratches what passes it, and can be grown into a defender of an element you've
 * unlocked; a defender at its best can be grown into a hybrid of two elements (as in Enfo's). Pests
 * come in layers (as in Bloons). Balance numbers live here; the rules live in src/core/siege.
 */

export const SIEGE = {
  /** The gardens themselves (fields, rocks, ponds, gates, starting coins) live in siege-maps.ts. */
  seedlings: 20,
  /** Selling gives back this share of everything spent on a tile. */
  sell: 0.7,
  /** Pests in mud move at this share of their speed. */
  mudSlow: 0.55,
  /** A defender on rich soil reaches this much further, in squares. */
  richReach: 0.8,
  /** A water defender on a pond's bank strikes this many times as hard. */
  pondBoost: 1.5,
  /** Coins to unlock elements: the first, the second, and so on. */
  elementPrices: [0, 15, 30, 45] as readonly number[],
  /** Coins after each wave: this bonus plus `perWave` times the wave's number. */
  waveBonus: 4,
  perWave: 1,
  /** Pests' strength is multiplied by this in each wave, from the first to the last. */
  toughness: [1, 1.08, 1.16, 1.25, 1.35, 1.5, 1.65, 1.85, 2.1, 2.4, 2.9, 3.5, 4.4, 5.6, 7.2, 9.2, 11.8, 15, 19, 24] as readonly number[],
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
  beetle: { id: 'beetle', name: 'Beetle', plural: 'beetles', hp: 20, speed: 0.85, armour: 2, flies: false, bounty: 3, bite: 2, text: 'Armour takes 2 off every hit. Brambles can\'t scratch it; hedgehogs, toads, mantises and owls bite through.' },
  moth: { id: 'moth', name: 'Moth', plural: 'moths', hp: 12, speed: 1.35, armour: 0, flies: true, bounty: 2, text: 'Flies straight over everything. Brambles, frogs, hedgehogs and toads can\'t reach it.' },
  aphids: { id: 'aphids', name: 'Aphid swarm', plural: 'aphid swarms', hp: 12, speed: 1.1, armour: 0, flies: false, child: { kind: 'aphid', count: 3 }, bounty: 1, text: 'Breaks into three aphids.' },
  aphid: { id: 'aphid', name: 'Aphid', plural: 'aphids', hp: 4, speed: 1.4, armour: 0, flies: false, bounty: 0, text: 'Small and quick.' },
  greatSnail: { id: 'greatSnail', name: 'Great Snail', plural: 'great snails', hp: 240, speed: 0.4, armour: 1, flies: false, child: { kind: 'snail', count: 4 }, bounty: 25, bite: 6, text: 'A boss. Its shell takes 1 off every hit, and it leaves four snails.' },
};

export type Element = 'water' | 'earth' | 'air' | 'sun';
export const ELEMENT_IDS: readonly Element[] = ['water', 'earth', 'air', 'sun'];
export type DefenderId =
  | 'bramble' | 'hive'
  | 'frog' | 'hedgehog' | 'thrush' | 'marigold'
  | 'toad' | 'dragonfly' | 'salamander' | 'mantis' | 'owl' | 'bumblebee';

export interface Level {
  /** Coins to plant or grow it (level 1), or to reach this level. */
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
  /** Coins it makes after every wave (a beehive's honey). */
  honey?: number;
}

export interface Defender {
  id: DefenderId;
  name: string;
  /** 0: the bramble everything grows from; 1: one element's defender; 2: a hybrid of two. */
  tier: 0 | 1 | 2;
  elements: readonly Element[];
  /** Reaches flying pests: no, yes, or yes with double harm. */
  air: 'no' | 'yes' | 'double';
  /** Ignores armour. */
  pierce: boolean;
  levels: readonly Level[];
  text: string;
}

export const DEFENDERS: Record<DefenderId, Defender> = {
  bramble: {
    id: 'bramble', name: 'Bramble', tier: 0, elements: [], air: 'no', pierce: false, text: 'Blocks the way, and scratches pests that pass beside it.',
    levels: [{ cost: 1, damage: 1, range: 1.45, every: 1.0 }],
  },
  hive: {
    id: 'hive', name: 'Beehive', tier: 1, elements: [], air: 'no', pierce: false, text: 'Makes honey: coins after every wave. It blocks the way, but never strikes.',
    levels: [
      { cost: 12, damage: 0, range: 0, every: 1, honey: 3 },
      { cost: 12, damage: 0, range: 0, every: 1, honey: 6 },
      { cost: 18, damage: 0, range: 0, every: 1, honey: 10 },
    ],
  },
  frog: {
    id: 'frog', name: 'Frog', tier: 1, elements: ['water'], air: 'no', pierce: false, text: 'Quick tongue, on pests that walk.',
    levels: [
      { cost: 5, damage: 2, range: 1.6, every: 0.7 },
      { cost: 6, damage: 3, range: 1.8, every: 0.65 },
      { cost: 12, damage: 5, range: 2.0, every: 0.6, slow: 0.6, slowFor: 1 },
    ],
  },
  hedgehog: {
    id: 'hedgehog', name: 'Hedgehog', tier: 1, elements: ['earth'], air: 'no', pierce: true, text: 'Bites through armour, close up.',
    levels: [
      { cost: 7, damage: 4, range: 1.5, every: 1.1 },
      { cost: 8, damage: 6, range: 1.5, every: 1.0 },
      { cost: 14, damage: 9, range: 1.6, every: 1.0, splash: 0.8 },
    ],
  },
  thrush: {
    id: 'thrush', name: 'Thrush', tier: 1, elements: ['air'], air: 'double', pierce: false, text: 'Long reach, and double harm on pests that fly.',
    levels: [
      { cost: 8, damage: 2, range: 2.8, every: 0.8 },
      { cost: 8, damage: 3, range: 3.1, every: 0.75 },
      { cost: 14, damage: 4, range: 3.4, every: 0.55 },
    ],
  },
  marigold: {
    id: 'marigold', name: 'Marigold', tier: 1, elements: ['sun'], air: 'yes', pierce: false, text: 'Warms every pest in reach at once.',
    levels: [
      { cost: 10, damage: 2, range: 1.6, every: 1.0, targets: 99 },
      { cost: 10, damage: 3, range: 1.8, every: 1.0, targets: 99 },
      { cost: 16, damage: 4, range: 2.1, every: 0.9, targets: 99 },
    ],
  },
  toad: {
    id: 'toad', name: 'Toad', tier: 2, elements: ['water', 'earth'], air: 'no', pierce: true, text: 'A heavy splash that slows everything it lands on, through armour.',
    levels: [
      { cost: 18, damage: 6, range: 1.8, every: 1.2, splash: 1.1, slow: 0.55, slowFor: 1.5 },
      { cost: 14, damage: 9, range: 2.0, every: 1.1, splash: 1.2, slow: 0.5, slowFor: 1.5 },
      { cost: 22, damage: 14, range: 2.2, every: 1.0, splash: 1.3, slow: 0.45, slowFor: 2 },
    ],
  },
  dragonfly: {
    id: 'dragonfly', name: 'Dragonfly', tier: 2, elements: ['water', 'air'], air: 'double', pierce: false, text: 'Darts at two pests at once, from far off.',
    levels: [
      { cost: 18, damage: 3, range: 3.2, every: 0.45, targets: 2 },
      { cost: 14, damage: 4, range: 3.5, every: 0.4, targets: 2 },
      { cost: 22, damage: 6, range: 3.8, every: 0.35, targets: 3 },
    ],
  },
  salamander: {
    id: 'salamander', name: 'Salamander', tier: 2, elements: ['water', 'sun'], air: 'yes', pierce: false, text: 'Scalds every pest in reach and slows them all.',
    levels: [
      { cost: 18, damage: 3, range: 1.8, every: 0.8, targets: 99, slow: 0.7, slowFor: 1 },
      { cost: 14, damage: 4, range: 2.0, every: 0.75, targets: 99, slow: 0.65, slowFor: 1 },
      { cost: 22, damage: 6, range: 2.2, every: 0.7, targets: 99, slow: 0.6, slowFor: 1.2 },
    ],
  },
  mantis: {
    id: 'mantis', name: 'Mantis', tier: 2, elements: ['earth', 'sun'], air: 'yes', pierce: true, text: 'One great strike, through any armour.',
    levels: [
      { cost: 18, damage: 14, range: 2.0, every: 1.3 },
      { cost: 14, damage: 22, range: 2.2, every: 1.2 },
      { cost: 22, damage: 34, range: 2.4, every: 1.1 },
    ],
  },
  owl: {
    id: 'owl', name: 'Owl', tier: 2, elements: ['earth', 'air'], air: 'double', pierce: true, text: 'Strikes from very far, through armour, and twice as hard on pests that fly.',
    levels: [
      { cost: 18, damage: 9, range: 3.4, every: 1.4 },
      { cost: 14, damage: 14, range: 3.8, every: 1.3 },
      { cost: 22, damage: 22, range: 4.2, every: 1.2 },
    ],
  },
  bumblebee: {
    id: 'bumblebee', name: 'Bumblebee', tier: 2, elements: ['air', 'sun'], air: 'yes', pierce: false, text: 'Stings everything near the pest it chases.',
    levels: [
      { cost: 18, damage: 4, range: 2.4, every: 0.7, splash: 0.9 },
      { cost: 14, damage: 6, range: 2.6, every: 0.65, splash: 1.0 },
      { cost: 22, damage: 9, range: 2.8, every: 0.6, splash: 1.1 },
    ],
  },
};

/** Each element's own defender, grown from a bramble once the element is unlocked. */
export const ELEMENTS: Record<Element, { id: Element; name: string; defender: DefenderId }> = {
  water: { id: 'water', name: 'Water', defender: 'frog' },
  earth: { id: 'earth', name: 'Earth', defender: 'hedgehog' },
  air: { id: 'air', name: 'Air', defender: 'thrush' },
  sun: { id: 'sun', name: 'Sun', defender: 'marigold' },
};
export const BASIC: readonly DefenderId[] = ELEMENT_IDS.map((e) => ELEMENTS[e].defender);
export const HYBRIDS: readonly DefenderId[] = ['toad', 'dragonfly', 'salamander', 'mantis', 'owl', 'bumblebee'];

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

export type ShedId = 'compost' | 'thorns' | 'frame' | 'can';
export const SHED_IDS: readonly ShedId[] = ['compost', 'thorns', 'frame', 'can'];

export interface ShedItem {
  id: ShedId;
  name: string;
  text: string;
  /** Coins for each rank, first to last. */
  costs: readonly number[];
  /** What each rank gives, from none bought (index 0) to all of them. */
  ranks: readonly string[];
}

/** Improvements for the season, bought in the Shed with coins, in ranks. */
export const SHED: Record<ShedId, ShedItem> = {
  compost: { id: 'compost', name: 'Compost heap', text: 'Coins kept through a wave earn more interest, with a higher cap.', costs: [20, 40, 60], ranks: ['10%, up to 10', '12%, up to 20', '15%, up to 35', '20%, up to 50'] },
  thorns: { id: 'thorns', name: 'Sharp thorns', text: 'Brambles scratch harder.', costs: [15, 30, 50], ranks: ['1 harm', '2 harm', '3 harm', '4 harm'] },
  frame: { id: 'frame', name: 'Cold frame', text: 'Growing and upgrading cost less.', costs: [20, 40, 60], ranks: ['full price', '10% off', '20% off', '30% off'] },
  can: { id: 'can', name: 'Watering can', text: 'Every defender strikes harder.', costs: [25, 45, 70], ranks: ['as they are', '+10% harm', '+20% harm', '+30% harm'] },
};

/** What each rank of each improvement does, by rank (0 = none bought). */
export const SHED_EFFECT = {
  interest: [0.1, 0.12, 0.15, 0.2] as readonly number[],
  interestCap: [10, 20, 35, 50] as readonly number[],
  thorns: [1, 2, 3, 4] as readonly number[],
  discount: [0, 0.1, 0.2, 0.3] as readonly number[],
  harm: [1, 1.1, 1.2, 1.3] as readonly number[],
};
