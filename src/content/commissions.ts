/**
 * How commissions are chosen and paid. The kinds themselves live in src/core/commission.ts;
 * this file holds the numbers the bot lab tunes.
 */
export type CommissionKind =
  | 'line-min' | 'line-max' | 'no-number' | 'zone' | 'seal-count' | 'seal-op' | 'seal-cage' | 'empty-cage'
  | 'line-count-max' | 'fill-line' | 'equal-lines' | 'no-seal-line' | 'diagonal-min' | 'rising' | 'parity-line'
  | 'fill-page' | 'seal-all' | 'corners-min' | 'quarter-min' | 'seal-op-count'
  | 'place-line' | 'line-count-min' | 'seal-line' | 'seal-big';

/**
 * Kinds no longer posted, kept so gardens begun before they were retired still read: each one can
 * be broken by planting a number in its right square, so it could stop you planting what you'd
 * worked out (No 5 in row 2, Leave a plot empty, Row 3 adds to 10 or less, and so on).
 */
export const RETIRED_KINDS: readonly CommissionKind[] = [
  'line-max', 'no-number', 'zone', 'empty-cage', 'line-count-max', 'no-seal-line', 'equal-lines', 'rising', 'parity-line',
];

/** Kinds that only appear once a station has brought them (see src/content/stations.ts). */
export const GATED_KINDS: readonly CommissionKind[] = ['corners-min', 'quarter-min', 'seal-op-count'];

/** Gold a bounty of each kind pays. */
export const BOUNTY_GOLD: Record<CommissionKind, number> = {
  'line-min': 3, 'line-max': 2, 'no-number': 2, zone: 4, 'seal-count': 4, 'seal-op': 2, 'seal-cage': 4,
  'empty-cage': 2, 'line-count-max': 2, 'fill-line': 4, 'equal-lines': 6, 'no-seal-line': 4, 'diagonal-min': 4,
  rising: 6, 'parity-line': 4, 'fill-page': 0, 'seal-all': 12, 'corners-min': 4, 'quarter-min': 4, 'seal-op-count': 6,
  'place-line': 3, 'line-count-min': 3, 'seal-line': 3, 'seal-big': 5,
};

/** A four-cell cage is worth this much more gold to seal on command. */
export const BIG_CAGE_BONUS = 2;

/** The final round's bounty for sealing most of the page: this share of the cages, and its pay. */
export const FINAL_SEALS = { share: 0.6, gold: 6 } as const;

/** Which kinds can be the required commission, and from which round. Retired kinds are never posted. */
export const REQUIRED_FROM: Partial<Record<CommissionKind, number>> = {
  'line-min': 1, 'seal-op': 1, 'seal-count': 1, 'seal-cage': 2, 'corners-min': 2, 'quarter-min': 2,
  'place-line': 1, 'line-count-min': 1, 'seal-line': 1, 'seal-big': 1, 'fill-line': 3, 'diagonal-min': 1, 'seal-op-count': 2,
};

/** Which kinds can be bounties, and from which round. */
export const BOUNTY_FROM: Partial<Record<CommissionKind, number>> = {
  'line-min': 1, 'seal-op': 1, 'seal-count': 1, 'seal-cage': 1, 'diagonal-min': 1, 'fill-line': 3,
  'corners-min': 1, 'quarter-min': 1, 'seal-op-count': 2, 'place-line': 1, 'line-count-min': 2, 'seal-line': 1, 'seal-big': 1,
};

/** The sensible range of a threshold, as a required commission and as a bounty. */
export const THRESHOLD_RANGE: Partial<Record<CommissionKind, { required: readonly [number, number]; bounty: readonly [number, number] }>> = {
  'line-min': { required: [6, 30], bounty: [6, 30] },
  'line-max': { required: [5, 16], bounty: [5, 16] },
  'line-count-max': { required: [1, 4], bounty: [1, 4] },
  'seal-count': { required: [1, 99], bounty: [2, 99] },
  'diagonal-min': { required: [8, 36], bounty: [8, 36] },
  'corners-min': { required: [6, 24], bounty: [8, 24] },
  'quarter-min': { required: [8, 54], bounty: [12, 54] },
  'seal-op-count': { required: [2, 99], bounty: [2, 99] },
  'line-count-min': { required: [2, 8], bounty: [3, 8] },
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
  /** "Make a plot of N or more squares bloom". */
  bigPlot: [3, 4],
} as const;

/**
 * How demanding thresholds are. Every layout here is all-right: each number you hold planted in a
 * right square. A required threshold is met by at least `requiredRight` of them; a bounty's by at
 * most `bountyShare` of them for the best set of numbers you could place, so bounties are the hard part.
 */
export const DIFFICULTY = {
  bountyShare: 0.06,
  /**
   * The share of all-right layouts (every number you hold planted in a right square, whichever ones)
   * that must meet the required commission, tried in turn until one the page doesn't meet yet turns
   * up; failing that, one already met. So planting what you've worked out keeps your water.
   */
  requiredRight: [1, 0.9, 0.8] as readonly number[],
  /** The share that must still meet it when you keep one number back for later. */
  requiredKeepBack: 0.5,
  /** Commissions met by more layouts than this are too easy: a bounty above it is a gift. */
  bountyMaxRate: 0.35,
  /** When no ambitious second bounty fits alongside the others, one met by up to this share of layouts will do. */
  bountyFallbackRate: 0.6,
  /** A kind of required commission your page already meets is taken this often instead of passed over. */
  alreadyMetWeight: 0.2,
  /** Layouts sampled per set of numbers when posting commissions. */
  samples: 60,
} as const;
