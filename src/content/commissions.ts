/**
 * How commissions are chosen and paid. The kinds themselves live in src/core/commission.ts;
 * this file holds the numbers the bot lab tunes.
 */
export type CommissionKind =
  | 'line-min' | 'line-max' | 'no-number' | 'zone' | 'seal-count' | 'seal-op' | 'seal-cage' | 'empty-cage'
  | 'line-count-max' | 'fill-line' | 'equal-lines' | 'no-seal-line' | 'diagonal-min' | 'rising' | 'parity-line'
  | 'fill-page' | 'seal-all';

/** Gold a bounty of each kind pays. */
export const BOUNTY_GOLD: Record<CommissionKind, number> = {
  'line-min': 2, 'line-max': 2, 'no-number': 2, zone: 4, 'seal-count': 4, 'seal-op': 2, 'seal-cage': 4,
  'empty-cage': 2, 'line-count-max': 2, 'fill-line': 4, 'equal-lines': 6, 'no-seal-line': 4, 'diagonal-min': 4,
  rising: 6, 'parity-line': 4, 'fill-page': 0, 'seal-all': 12,
};

/** A four-cell cage is worth this much more gold to seal on command. */
export const BIG_CAGE_BONUS = 2;

/** The final round's bounty for sealing most of the page: this share of the cages, and its pay. */
export const FINAL_SEALS = { share: 0.6, gold: 6 } as const;

/** Which kinds can be the required commission, and from which round. */
export const REQUIRED_FROM: Partial<Record<CommissionKind, number>> = {
  'line-min': 1, 'no-number': 1, 'seal-op': 1, 'seal-count': 2, 'line-max': 2, zone: 2,
  'empty-cage': 3, 'line-count-max': 3, 'seal-cage': 4, 'no-seal-line': 5,
};

/** Which kinds can be bounties, and from which round. */
export const BOUNTY_FROM: Partial<Record<CommissionKind, number>> = {
  'line-min': 1, 'seal-op': 1, 'seal-count': 1, 'seal-cage': 1, zone: 1, 'diagonal-min': 1, 'no-number': 2, 'line-max': 2, 'parity-line': 3, 'fill-line': 3, 'empty-cage': 3, 'no-seal-line': 3, 'equal-lines': 4,
  rising: 4, 'line-count-max': 4,
};

/** The sensible range of a threshold, as a required commission and as a bounty. */
export const THRESHOLD_RANGE: Partial<Record<CommissionKind, { required: readonly [number, number]; bounty: readonly [number, number] }>> = {
  'line-min': { required: [6, 30], bounty: [6, 30] },
  'line-max': { required: [5, 16], bounty: [5, 16] },
  'line-count-max': { required: [1, 4], bounty: [1, 4] },
  'seal-count': { required: [1, 99], bounty: [2, 99] },
  'diagonal-min': { required: [8, 36], bounty: [8, 36] },
};

/** The fixed variants of yes-or-no kinds that the generator chooses among. */
export const VARIANTS = {
  /** "Rows 2 and 5 add to the same total, N or more." */
  equalLinesMin: [8, 12, 16],
  /** "Only even numbers in row 6, N or more." */
  parityCount: [2, 3],
  /** "Column 3 rises from top to bottom, N numbers or more." */
  risingCount: [3, 4],
  /** A cage must have at least this many open cells to be asked to stay empty. */
  emptyCageOpen: 2,
} as const;

/**
 * How demanding thresholds are. A required threshold is met by at least this share of random
 * layouts for the worst set of numbers you could place; a bounty's by at most this share for the best.
 */
export const DIFFICULTY = {
  requiredShare: 0.3,
  bountyShare: 0.06,
  /** A yes-or-no required commission must be met by at least this share of layouts, for every choice of numbers. */
  requiredMinRate: 0.05,
  /** Commissions met by more layouts than this are too easy: a required one above it is a given, a bounty a gift. */
  requiredMaxRate: 0.9,
  bountyMaxRate: 0.35,
  /** When no ambitious second bounty fits alongside the others, one met by up to this share of layouts will do. */
  bountyFallbackRate: 0.6,
  /** A kind of required commission your page already meets is taken this often instead of passed over. */
  alreadyMetWeight: 0.2,
  /** Layouts sampled per set of numbers when posting commissions. */
  samples: 60,
} as const;
