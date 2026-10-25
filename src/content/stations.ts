/**
 * The map: six gardens (stations in code), each a page with a twist. Balance numbers for each live
 * here; the rules that use them live in src/core/run.ts and src/core/meta.ts.
 */
import { DEFAULT_PAGE_RULES, type PageRules } from '../core/page';
import type { CommissionKind } from './commissions';

export type PageVariant = 'standard' | 'cloister' | 'bare' | 'counting';

/** How each kind of page is generated. */
export const PAGE_VARIANTS: Record<PageVariant, PageRules> = {
  standard: DEFAULT_PAGE_RULES,
  cloister: { ...DEFAULT_PAGE_RULES, minStones: 12, maxStones: 13, maxStonesPerLine: 3 },
  bare: { ...DEFAULT_PAGE_RULES, minStones: 0, maxStones: 0 },
  counting: { ...DEFAULT_PAGE_RULES, ops: 'plus-times' },
};

export type StationId = 'copy-desk' | 'cloister' | 'bare-vellum' | 'counting-house' | 'long-night' | 'grand-folio';

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
  { id: 'copy-desk', name: 'The Kitchen Garden', twist: 'A standard garden.', page: 'standard', after: [], stars: [100, 129], at: [0, 1] },
  { id: 'cloister', name: 'The Rock Garden', twist: 'More stones: a gentle garden.', page: 'cloister', brings: 'corners-min', after: ['copy-desk'], stars: [105, 136], at: [1, 0] },
  { id: 'bare-vellum', name: 'The Fallow Field', twist: 'No stones at all.', page: 'bare', brings: 'quarter-min', after: ['copy-desk'], stars: [90, 115], at: [1, 2] },
  { id: 'counting-house', name: 'The Market Garden', twist: 'Only + and × plots.', page: 'counting', brings: 'seal-op-count', after: ['cloister', 'bare-vellum'], stars: [100, 131], at: [2, 1] },
  { id: 'long-night', name: 'The Dry Spell', twist: 'Two drops of water, each worth double at harvest.', page: 'standard', startInk: 2, inkBonus: 20, after: ['counting-house'], stars: [105, 140], at: [3, 1] },
  { id: 'grand-folio', name: 'The Long Season', twist: 'Eight weeks, with fewer numbers dealt in each.', page: 'standard', rounds: 8, deal: [3, 3, 3, 3, 3, 3, 3], after: ['long-night'], stars: [110, 155], at: [4, 1] },
];

export const stationById = (id: string): Station | undefined => STATIONS.find((s) => s.id === id);
