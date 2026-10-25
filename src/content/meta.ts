/**
 * The scriptorium's economy: what a page earns in gold leaf, and what leaf buys. The rules that
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
  { id: 'quill', kind: 'tool', name: 'Extra', price: 20, text: 'Draw one extra number this round.' },
  { id: 'gilder', kind: 'tool', name: 'Double', price: 25, text: 'This round, sealed cages pay double.' },
  { id: 'eraser', kind: 'tool', name: 'Erase', price: 30, after: 'cloister', text: 'Turn a printed number into one of yours, free to move like any other.' },
  { id: 'inkwell', kind: 'tool', name: 'Refill', price: 40, after: 'long-night', text: 'Refill a drop of ink.' },
  { id: 'purse-1', kind: 'upgrade', name: "Patron's Purse", price: 20, text: 'Start every map run with 3 gold.' },
  { id: 'purse-2', kind: 'upgrade', name: "Patron's Purse II", price: 40, needs: 'purse-1', text: 'Start every map run with 6 gold.' },
  { id: 'bounty-hunter', kind: 'upgrade', name: 'Bounty Hunter', price: 40, after: 'counting-house', text: 'Each bounty pays 1 more gold.' },
  { id: 'deeper-inkwell', kind: 'upgrade', name: 'Deeper Inkwell', price: 60, after: 'long-night', text: 'Start every map run with one more drop of ink.' },
  { id: 'second-strap', kind: 'upgrade', name: 'Second Strap', price: 50, after: 'grand-folio', text: 'Carry a fourth tool.' },
  { id: 'newsprint', kind: 'style', name: 'Newsprint', price: 30, after: 'bare-vellum', text: 'Black ink and one spot colour: an in-flight-magazine puzzle page.' },
  { id: 'neon', kind: 'style', name: 'Neon Abacus', price: 30, after: 'grand-folio', text: 'A dark page with glowing numerals.' },
];

/** What the upgrades give. */
export const PERKS = { purse1Gold: 3, purse2Gold: 6, bountyHunter: 1, deeperInkwell: 1 } as const;

/** How many filled pages the library keeps, newest first. */
export const LIBRARY_SIZE = 100;
