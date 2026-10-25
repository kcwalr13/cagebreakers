/**
 * The Potting Shed's economy (the scriptorium in code): what a garden earns in seeds (`leaf` in
 * code), and what seeds buy. The rules that
 * use these numbers live in src/core/meta.ts.
 */
import type { StationId } from './stations';

/** A filled page earns 1 leaf per `perPoints` points and `perStar` for each new star; a ruined one, 1 per `ruinedPerGold` gold. */
export const LEAF = { perPoints: 10, perStar: 5, ruinedPerGold: 20 } as const;

export type ItemId =
  | 'quill' | 'gilder' | 'eraser' | 'inkwell'
  | 'purse-1' | 'purse-2' | 'bounty-hunter' | 'second-strap' | 'deeper-inkwell'
  | 'newsprint' | 'neon';

export interface Item {
  id: ItemId;
  kind: 'tool' | 'upgrade' | 'style';
  name: string;
  price: number;
  text: string;
  /** For sale once this station's page has been filled. */
  after?: StationId;
  /** For sale once this item is owned. */
  needs?: ItemId;
}

export const ITEMS: readonly Item[] = [
  { id: 'quill', kind: 'tool', name: 'Extra', price: 20, text: 'Draw one extra number this week.' },
  { id: 'gilder', kind: 'tool', name: 'Double', price: 25, text: 'This week, blooming plots pay double.' },
  { id: 'eraser', kind: 'tool', name: 'Dig', price: 30, after: 'cloister', text: 'Dig up a stone: it becomes one of your numbers, free to move like any other.' },
  { id: 'inkwell', kind: 'tool', name: 'Refill', price: 40, after: 'long-night', text: 'Refill a drop of water.' },
  { id: 'purse-1', kind: 'upgrade', name: 'Seed Money', price: 20, text: 'Start every map garden with 3 coins.' },
  { id: 'purse-2', kind: 'upgrade', name: 'Seed Money II', price: 40, needs: 'purse-1', text: 'Start every map garden with 6 coins.' },
  { id: 'bounty-hunter', kind: 'upgrade', name: 'Green Thumb', price: 40, after: 'counting-house', text: 'Each bonus request pays 1 more coin.' },
  { id: 'deeper-inkwell', kind: 'upgrade', name: 'Bigger Can', price: 60, after: 'long-night', text: 'Start every map garden with one more drop of water.' },
  { id: 'second-strap', kind: 'upgrade', name: 'Second Pocket', price: 50, after: 'grand-folio', text: 'Carry a fourth tool.' },
  { id: 'newsprint', kind: 'style', name: 'Cottage Garden', price: 30, after: 'bare-vellum', text: 'A sunny cottage look: soft pastels, petal pinks and rounded type.' },
  { id: 'neon', kind: 'style', name: 'Greenhouse', price: 30, after: 'grand-folio', text: 'A clean, modern look: crisp white, deep green and a coral accent.' },
];

/** What the upgrades give. */
export const PERKS = { purse1Gold: 3, purse2Gold: 6, bountyHunter: 1, deeperInkwell: 1 } as const;

/** How many finished gardens the Herbarium (library in code) keeps, newest first. */
export const LIBRARY_SIZE = 100;
