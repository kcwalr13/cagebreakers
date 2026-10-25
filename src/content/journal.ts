/**
 * The journal of goals, the daily streak and the Weekly Garden: what each pays in seeds. The rules
 * that count them live in src/core/meta.ts.
 */
import type { PageVariant } from './stations';

/**
 * Each Daily Garden finished (the first time that day for its size) pays `seeds`; the first one
 * each day also pays `perStreakDay` for every day of the streak, up to `streakCap` days; and
 * finishing all four sizes in a day pays `allFour`. A streak survives one missed day in any
 * `graceDays` days.
 */
export const DAILY = { seeds: 3, perStreakDay: 1, streakCap: 7, allFour: 10, graceDays: 7 } as const;

/** The Weekly Garden: a twisted garden that changes every Monday, the same for everyone. Finishing it pays this once a week. */
export const WEEKLY = { seeds: 15 } as const;

/** The gardens the Weekly Garden draws from, with the twist it announces. */
export const WEEKLY_GARDENS: readonly { page: PageVariant; twist: string }[] = [
  { page: 'six-fences', twist: 'Fences' },
  { page: 'six-hidden', twist: 'Lost labels' },
  { page: 'six-diagonal', twist: 'Crossed paths' },
  { page: 'six-hidden-fences', twist: 'Lost labels and fences' },
  { page: 'seven-fences', twist: 'Fences, 7×7' },
  { page: 'seven-hidden', twist: 'Lost labels, 7×7' },
  { page: 'seven-diagonal-fences', twist: 'Fences and crossed paths, 7×7' },
  { page: 'eight-diagonal', twist: 'Crossed paths, 8×8' },
];

/** What a goal counts. The core measures each one from the profile. */
export type GoalMeasure =
  | 'finished' | 'full-bloom' | 'no-spill' | 'perfect-season' | 'daily-four' | 'streak' | 'sizes'
  | 'twist-fences' | 'twist-hidden' | 'twist-diagonal' | 'twist-zen' | 'zen-perfect' | 'stars' | 'regions'
  | 'found' | 'planted' | 'in-bloom' | 'weeklies' | 'ornaments' | 'paths';

export type GoalId =
  | 'first-harvest' | 'ten-harvests' | 'fifty-harvests' | 'full-bloom' | 'not-a-drop' | 'perfect-season'
  | 'daily-four' | 'streak-3' | 'streak-7' | 'streak-30' | 'every-size'
  | 'fences' | 'lost-labels' | 'crossed-paths' | 'zen' | 'zen-master'
  | 'stars-10' | 'stars-30' | 'stars-60' | 'wild-wood' | 'hidden-1' | 'hidden-all'
  | 'planter' | 'gardener' | 'first-bloom' | 'bouquet' | 'weekly-1' | 'weekly-5' | 'collector' | 'explorer';

export interface Goal {
  id: GoalId;
  name: string;
  /** What to do, as one sentence. */
  text: string;
  measure: GoalMeasure;
  /** How much of the measure the goal needs. */
  of: number;
  /** Seeds for claiming it. */
  reward: number;
}

export const GOALS: readonly Goal[] = [
  { id: 'first-harvest', name: 'First harvest', text: 'Finish a garden.', measure: 'finished', of: 1, reward: 5 },
  { id: 'ten-harvests', name: 'Green fingers', text: 'Finish 10 gardens.', measure: 'finished', of: 10, reward: 15 },
  { id: 'fifty-harvests', name: 'Old hand', text: 'Finish 50 gardens.', measure: 'finished', of: 50, reward: 40 },
  { id: 'full-bloom', name: 'Full bloom', text: 'Finish a garden with every plot in bloom.', measure: 'full-bloom', of: 1, reward: 10 },
  { id: 'not-a-drop', name: 'Not a drop spilled', text: 'Finish a season without losing any water.', measure: 'no-spill', of: 1, reward: 10 },
  { id: 'perfect-season', name: 'Perfect season', text: 'Meet all three requests in every week of a season.', measure: 'perfect-season', of: 1, reward: 25 },
  { id: 'daily-four', name: 'All four', text: 'Finish all four Daily Gardens in one day.', measure: 'daily-four', of: 1, reward: 15 },
  { id: 'streak-3', name: 'Regular', text: 'Keep a daily streak for 3 days.', measure: 'streak', of: 3, reward: 10 },
  { id: 'streak-7', name: 'Every day for a week', text: 'Keep a daily streak for 7 days.', measure: 'streak', of: 7, reward: 20 },
  { id: 'streak-30', name: 'A month of mornings', text: 'Keep a daily streak for 30 days.', measure: 'streak', of: 30, reward: 60 },
  { id: 'every-size', name: 'Every size', text: 'Finish a 5×5, a 6×6, a 7×7 and an 8×8 garden.', measure: 'sizes', of: 4, reward: 15 },
  { id: 'fences', name: 'Good fences', text: 'Finish a garden with fences.', measure: 'twist-fences', of: 1, reward: 8 },
  { id: 'lost-labels', name: 'Lost labels', text: 'Finish a garden whose plots show only their target.', measure: 'twist-hidden', of: 1, reward: 8 },
  { id: 'crossed-paths', name: 'Crossed paths', text: 'Finish a garden where the long diagonals count.', measure: 'twist-diagonal', of: 1, reward: 8 },
  { id: 'zen', name: 'Quiet hour', text: 'Finish a Zen garden.', measure: 'twist-zen', of: 1, reward: 8 },
  { id: 'zen-master', name: 'Raked smooth', text: 'Finish a Zen garden in full bloom without a Hint.', measure: 'zen-perfect', of: 1, reward: 15 },
  { id: 'stars-10', name: 'Ten stars', text: 'Earn 10 stars on the map.', measure: 'stars', of: 10, reward: 10 },
  { id: 'stars-30', name: 'Thirty stars', text: 'Earn 30 stars on the map.', measure: 'stars', of: 30, reward: 25 },
  { id: 'stars-60', name: 'Sixty stars', text: 'Earn 60 stars on the map.', measure: 'stars', of: 60, reward: 50 },
  { id: 'wild-wood', name: 'Into the wood', text: 'Open every region of the map.', measure: 'regions', of: 4, reward: 30 },
  { id: 'explorer', name: 'Explorer', text: 'Open 15 paths on the map.', measure: 'paths', of: 15, reward: 25 },
  { id: 'hidden-1', name: 'Off the path', text: 'Find a hidden garden.', measure: 'found', of: 1, reward: 10 },
  { id: 'hidden-all', name: 'Every secret', text: 'Find all four hidden gardens.', measure: 'found', of: 4, reward: 30 },
  { id: 'planter', name: 'Planter', text: 'Plant 5 plants in your home garden.', measure: 'planted', of: 5, reward: 8 },
  { id: 'gardener', name: 'Gardener', text: 'Plant 20 plants in your home garden.', measure: 'planted', of: 20, reward: 20 },
  { id: 'first-bloom', name: 'First flower', text: 'Grow a plant at home until it blooms.', measure: 'in-bloom', of: 1, reward: 10 },
  { id: 'bouquet', name: 'A bouquet', text: 'Have 10 plants in bloom at home at once.', measure: 'in-bloom', of: 10, reward: 30 },
  { id: 'weekly-1', name: 'This week\'s twist', text: 'Finish a Weekly Garden.', measure: 'weeklies', of: 1, reward: 10 },
  { id: 'weekly-5', name: 'Five weeks running', text: 'Finish 5 Weekly Gardens.', measure: 'weeklies', of: 5, reward: 25 },
  { id: 'collector', name: 'Collector', text: 'Own 5 ornaments for your home garden.', measure: 'ornaments', of: 5, reward: 15 },
];
