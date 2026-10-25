/**
 * The map: nine gardens (stations in code), each a page with a twist; three of them are 5×5, 7×7
 * and 8×8, the rest 6×6. Balance numbers for each live
 * here; the rules that use them live in src/core/run.ts and src/core/meta.ts.
 */
import type { Size } from '../core/grid';
import { DEFAULT_PAGE_RULES, type PageRules } from '../core/page';
import { RUN } from './balance';
import type { CommissionKind } from './commissions';

export type PageVariant =
  // 6×6 pages from before every page had one solution: saved gardens and the Herbarium keep them.
  | 'standard' | 'cloister' | 'bare' | 'counting'
  | 'six' | 'six-rocks' | 'six-fallow' | 'six-market' | 'five' | 'seven' | 'eight';

/** The 6×6 page, with stones added where needed so it has exactly one solution. */
const SIX: PageRules = { ...DEFAULT_PAGE_RULES, unique: 3 };

/** How each kind of page is generated. */
export const PAGE_VARIANTS: Record<PageVariant, PageRules> = {
  standard: DEFAULT_PAGE_RULES,
  cloister: { ...DEFAULT_PAGE_RULES, minStones: 12, maxStones: 13, maxStonesPerLine: 3 },
  bare: { ...DEFAULT_PAGE_RULES, minStones: 0, maxStones: 0 },
  counting: { ...DEFAULT_PAGE_RULES, ops: 'plus-times' },
  six: SIX,
  'six-rocks': { ...SIX, minStones: 12, maxStones: 13, maxStonesPerLine: 3 },
  // No stones at all: the cages alone must settle it, so a page is drawn again until they do.
  'six-fallow': { ...SIX, minStones: 0, maxStones: 0, unique: 0 },
  'six-market': { ...SIX, ops: 'plus-times' },
  five: { ...DEFAULT_PAGE_RULES, size: 5, minCages: 8, maxCages: 10, minStones: 4, maxStones: 6, maxStonesPerLine: 2, unique: 4 },
  seven: { ...DEFAULT_PAGE_RULES, size: 7, minCages: 16, maxCages: 20, minStones: 10, maxStones: 13, maxStonesPerLine: 3, unique: 6 },
  eight: { ...DEFAULT_PAGE_RULES, size: 8, minCages: 21, maxCages: 26, minStones: 13, maxStones: 17, maxStonesPerLine: 3, unique: 8 },
};

/**
 * The shape of a season on each size of garden: the Daily Gardens use these, and so do the map's
 * gardens of that size. Bigger gardens have more plots in bloom paying every week, so their
 * bonus requests pay more to stay the main source of coins.
 */
export interface Season { size: Size; page: PageVariant; rounds: number; deal: readonly number[]; bountyBonus: number }
export const SEASONS: Record<Size, Season> = {
  5: { size: 5, page: 'five', rounds: 4, deal: [4, 4, 4], bountyBonus: 0 },
  6: { size: 6, page: 'six', rounds: RUN.rounds, deal: RUN.deal, bountyBonus: 0 },
  7: { size: 7, page: 'seven', rounds: 7, deal: [5, 5, 5, 5, 5, 5], bountyBonus: 1 },
  8: { size: 8, page: 'eight', rounds: 8, deal: [6, 6, 6, 6, 6, 6, 6], bountyBonus: 2 },
};

/** A map garden of another size: its page and the season that size grows in. */
function sized(size: Size): Pick<Station, 'page' | 'rounds' | 'deal' | 'bountyBonus'> {
  const se = SEASONS[size];
  return { page: se.page, rounds: se.rounds, deal: se.deal, bountyBonus: se.bountyBonus };
}

export type StationId =
  | 'copy-desk' | 'cloister' | 'bare-vellum' | 'counting-house' | 'long-night' | 'grand-folio'
  | 'window-box' | 'allotment' | 'walled-garden';

export interface Station {
  id: StationId;
  name: string;
  /** The twist, as one sentence on the map. */
  twist: string;
  page: PageVariant;
  /** Overrides to the standard run. */
  rounds?: number;
  deal?: readonly number[];
  startInk?: number;
  inkBonus?: number;
  /** Extra coins each bonus request pays here. */
  bountyBonus?: number;
  /** A commission kind this station brings: always in its own runs, and in every run once its page is filled. */
  brings?: CommissionKind;
  /** Opens once any one of these stations' pages has been filled. Empty: open from the start. */
  after: readonly StationId[];
  /** Score marks for the second and third stars (the first is filling the page). */
  stars: readonly [number, number];
  /** Where it sits on the map, in a 3-column grid, top row first. */
  at: readonly [number, number];
}

export const STATIONS: readonly Station[] = [
  { id: 'copy-desk', name: 'The Kitchen Garden', twist: 'A standard garden.', page: 'six', after: [], stars: [100, 129], at: [0, 1] },
  { id: 'cloister', name: 'The Rock Garden', twist: 'More stones: a gentle garden.', page: 'six-rocks', brings: 'corners-min', after: ['copy-desk'], stars: [105, 136], at: [1, 0] },
  { id: 'bare-vellum', name: 'The Fallow Field', twist: 'No stones at all.', page: 'six-fallow', brings: 'quarter-min', after: ['copy-desk'], stars: [90, 115], at: [1, 2] },
  { id: 'counting-house', name: 'The Market Garden', twist: 'Only + and × plots.', page: 'six-market', brings: 'seal-op-count', after: ['cloister', 'bare-vellum'], stars: [100, 131], at: [2, 1] },
  { id: 'long-night', name: 'The Dry Spell', twist: 'Two drops of water, each worth double at harvest.', page: 'six', startInk: 2, inkBonus: 20, after: ['counting-house'], stars: [105, 140], at: [3, 1] },
  { id: 'grand-folio', name: 'The Long Season', twist: 'Eight weeks, with fewer numbers dealt in each.', page: 'six', rounds: 8, deal: [3, 3, 3, 3, 3, 3, 3], after: ['long-night'], stars: [110, 155], at: [4, 1] },
  { id: 'window-box', name: 'The Window Box', twist: 'A small 5×5 garden, grown in four weeks.', ...sized(5), after: [], stars: [70, 90], at: [0, 0] },
  { id: 'allotment', name: 'The Allotment', twist: 'A 7×7 garden, numbers 1 to 7, over seven weeks.', ...sized(7), after: ['grand-folio'], stars: [130, 171], at: [5, 0] },
  { id: 'walled-garden', name: 'The Walled Garden', twist: 'An 8×8 garden, numbers 1 to 8, over eight weeks.', ...sized(8), after: ['grand-folio'], stars: [175, 228], at: [5, 2] },
];

export const stationById = (id: string): Station | undefined => STATIONS.find((s) => s.id === id);

/** How big a garden's page is. */
export const sizeOfPage = (page: PageVariant): Size => PAGE_VARIANTS[page].size as Size;
