import type { Op } from '../core/page';

/** Ten beats make a second. Fights resolve on beats; playback interpolates between them. */
export const BEATS_PER_SECOND = 10;

/**
 * Heft: big numbers hit hard, small numbers act fast. HP, damage per hit and time between
 * attacks all scale by the same factor, so damage per second stays level while big numbers
 * get sturdier and small numbers cast more often.
 */
export const heft = (n: number): number => 0.75 + 0.1 * n;

export const STAR_MULT = [1, 1.8, 3.2] as const;

export const MANA_PER_ATTACK = 10;
export const MANA_PER_HIT_TAKEN = 5;

/** Each unit's first action comes after this share of its interval. */
export const OPENING_DELAY = 0.5;

/** Seal rewards by operation, before the cage-size factor. */
export const SEAL = {
  '+': { hp: 0.3 },
  '×': { damage: 0.25 },
  '−': { speed: 0.25 },
  '÷': { startMana: 0.5 },
} as const satisfies Record<Op, object>;

/** Bigger cages are harder to fill, so each member gets more. */
export const SEAL_SIZE_FACTOR: Record<number, number> = { 2: 1, 3: 1.25, 4: 1.5 };

export const OVERTIME = {
  /** Beat when overtime begins (30 seconds). */
  start: 300,
  /** Beat when the clash is called on remaining HP (45 seconds). */
  end: 450,
  /** Each overtime beat, units lose this share of max HP times the beats elapsed in overtime. */
  rate: 0.00015,
} as const;

/** Mender regeneration ticks once a second. */
export const REGEN_EVERY = 10;

/** The shape of a run. Tuned by the bot lab against the design doc's targets. */
export const RUN = {
  clashes: 15,
  chapterLength: 5,
  keeperClashes: [5, 10, 15] as readonly number[],
  startLife: 20,
  startGold: 6,
  income: 5,
  /** One gold of interest per this many banked, up to the cap. */
  interestPer: 10,
  interestMax: 3,
  /** Streak bonus: [streak length, gold], highest that applies. */
  streakBonus: [[2, 1], [4, 2]] as readonly (readonly [number, number])[],
  winBonus: 1,
  lossBase: 2,
  keeperLossMult: 1.5,
  drawLoss: 1,
  benchSize: 6,
  shopSize: 4,
  rerollCost: 1,
} as const;

/**
 * Shop tier odds (percent for tiers 1–5) by Reach, the open cells you hold.
 * Each row applies from its Reach up to the next row's.
 */
export const SHOP_ODDS: readonly (readonly [number, readonly [number, number, number, number, number]])[] = [
  [0, [100, 0, 0, 0, 0]],
  [4, [75, 25, 0, 0, 0]],
  [6, [55, 35, 10, 0, 0]],
  [8, [35, 40, 20, 5, 0]],
  [10, [25, 35, 28, 10, 2]],
  [12, [18, 28, 32, 17, 5]],
  [14, [12, 20, 33, 25, 10]],
];

/** What a unit is worth in gold: its cost times three for each star above one. */
export const unitValue = (tier: number, stars: number) => tier * 3 ** (stars - 1);

/**
 * The enemy curve, per clash (index 0 is clash 1): how many units they field and how much
 * gold of units (by unitValue) they bring. Keepers (5, 10, 15) spike.
 */
export const ENEMY_CURVE = {
  units: [2, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 10],
  gold: [2, 3, 5, 7, 10, 14, 17, 20, 24, 28, 32, 36, 40, 44, 54],
} as const;
