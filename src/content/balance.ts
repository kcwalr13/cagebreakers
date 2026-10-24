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
