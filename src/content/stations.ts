/**
 * The map: five regions of gardens (stations in code), each garden a page with a twist. A region
 * opens with enough stars; inside it, finishing a garden lets you buy the path to the gardens
 * beyond it with seeds. A few gardens are hidden until you do something to find them. Balance
 * numbers for each live here; the rules that use them live in src/core/run.ts and src/core/meta.ts.
 */
import type { Size } from '../core/grid';
import { DEFAULT_PAGE_RULES, type PageRules } from '../core/page';
import { RUN } from './balance';
import type { CommissionKind } from './commissions';
import type { PlantId } from './home';

export type PageVariant =
  // 6×6 pages from before every page had one solution: saved gardens and the Herbarium keep them.
  | 'standard' | 'cloister' | 'bare' | 'counting'
  | 'six' | 'six-rocks' | 'six-fallow' | 'six-market' | 'five' | 'seven' | 'eight'
  // The twists: greater-than fences, plots that show only their target, and long diagonals that count.
  | 'six-fences' | 'six-hidden' | 'six-diagonal' | 'six-hidden-fences'
  | 'seven-fences' | 'seven-hidden' | 'seven-diagonal-fences' | 'seven-hidden-diagonal'
  | 'eight-gentle' | 'eight-diagonal' | 'eight-fences' | 'eight-all' | 'five-all'
  // More twists: shade, runners, bean poles, elbow room and tidy plots.
  | 'six-shade' | 'six-runners' | 'six-poles' | 'six-elbow' | 'six-tidy' | 'six-shade-runners' | 'seven-poles-runners'
  | 'seven-elbow' | 'seven-tidy-poles';

/** The 6×6 page, with stones added where needed so it has exactly one solution. */
const SIX: PageRules = { ...DEFAULT_PAGE_RULES, unique: 3 };
const FIVE: PageRules = { ...DEFAULT_PAGE_RULES, size: 5, minCages: 8, maxCages: 10, minStones: 4, maxStones: 6, maxStonesPerLine: 2, unique: 4 };
const SEVEN: PageRules = { ...DEFAULT_PAGE_RULES, size: 7, minCages: 16, maxCages: 20, minStones: 10, maxStones: 13, maxStonesPerLine: 3, unique: 6 };
const EIGHT: PageRules = { ...DEFAULT_PAGE_RULES, size: 8, minCages: 21, maxCages: 26, minStones: 13, maxStones: 17, maxStonesPerLine: 3, unique: 8 };

/**
 * How each kind of page is generated. Fences and diagonals settle a page on their own, so those
 * pages print fewer stones and leave more for the twist to work out.
 */
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
  five: FIVE,
  seven: SEVEN,
  eight: EIGHT,
  'six-fences': { ...SIX, minStones: 3, maxStones: 5, fences: [9, 12], unique: 5 },
  'six-hidden': { ...SIX, hidden: true, unique: 6 },
  'six-diagonal': { ...SIX, diagonal: true, minStones: 6, maxStones: 8 },
  'six-hidden-fences': { ...SIX, hidden: true, minStones: 4, maxStones: 6, fences: [9, 12], unique: 6 },
  'seven-fences': { ...SEVEN, minStones: 6, maxStones: 8, fences: [12, 15], unique: 6 },
  'seven-hidden': { ...SEVEN, hidden: true, unique: 8 },
  'seven-diagonal-fences': { ...SEVEN, diagonal: true, minStones: 5, maxStones: 7, fences: [12, 15], unique: 6 },
  'seven-hidden-diagonal': { ...SEVEN, hidden: true, diagonal: true, unique: 8 },
  'eight-gentle': { ...EIGHT, minStones: 18, maxStones: 20, maxStonesPerLine: 4 },
  'eight-diagonal': { ...EIGHT, diagonal: true, minStones: 10, maxStones: 13 },
  'eight-fences': { ...EIGHT, minStones: 8, maxStones: 11, fences: [16, 20], unique: 8 },
  'eight-all': { ...EIGHT, hidden: true, diagonal: true, minStones: 8, maxStones: 11, fences: [16, 20], unique: 10 },
  'five-all': { ...FIVE, hidden: true, diagonal: true, minStones: 2, maxStones: 4, fences: [6, 8], unique: 4 },
  'six-shade': { ...SIX, minStones: 5, maxStones: 7, shade: [8, 10], unique: 5 },
  'six-runners': { ...SIX, minStones: 4, maxStones: 6, runners: [7, 9], unique: 5 },
  'six-poles': { ...SIX, minStones: 4, maxStones: 6, poles: [3, 4], unique: 5 },
  'six-elbow': { ...SIX, minStones: 5, maxStones: 7, elbow: true, unique: 4 },
  'six-tidy': { ...SIX, minStones: 6, maxStones: 8, tidy: true, unique: 4 },
  'six-shade-runners': { ...SIX, minStones: 3, maxStones: 5, shade: [6, 8], runners: [6, 8], unique: 5 },
  'seven-poles-runners': { ...SEVEN, minStones: 5, maxStones: 7, poles: [4, 5], runners: [8, 10], unique: 6 },
  'seven-elbow': { ...SEVEN, minStones: 7, maxStones: 9, elbow: true, unique: 6 },
  'seven-tidy-poles': { ...SEVEN, minStones: 6, maxStones: 8, tidy: true, poles: [4, 5], unique: 6 },
};

/** Every twist a page can carry, in the order the game names them. */
export const TWISTS = ['zen', 'fences', 'hidden', 'diagonal', 'shade', 'runners', 'poles', 'elbow', 'tidy'] as const;
export type Twist = (typeof TWISTS)[number];
/** The twists the Botanic Garden brings. */
export const BOTANIC_TWISTS: readonly Twist[] = ['shade', 'runners', 'poles', 'elbow', 'tidy'];

/** The twists a kind of page carries (Zen is a twist of the garden, not the page). */
export function twistsOf(page: PageVariant): Exclude<Twist, 'zen'>[] {
  const r = PAGE_VARIANTS[page];
  return TWISTS.filter((t): t is Exclude<Twist, 'zen'> => t !== 'zen' && !!r[t]);
}

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
  8: { size: 8, page: 'eight', rounds: 8, deal: [6, 6, 6, 6, 6, 6, 6], bountyBonus: 3 },
};

/** How big a garden's page is. */
export const sizeOfPage = (page: PageVariant): Size => PAGE_VARIANTS[page].size as Size;

/** A map garden on a kind of page: the season its size grows in. */
function season(page: PageVariant): Pick<Station, 'page' | 'rounds' | 'deal' | 'bountyBonus'> {
  const se = SEASONS[sizeOfPage(page)];
  return { page, rounds: se.rounds, deal: se.deal, bountyBonus: se.bountyBonus };
}
/** A Zen garden on a kind of page: every number at once, no requests, no water. */
function zen(page: PageVariant): Pick<Station, 'page' | 'rounds' | 'deal' | 'zen' | 'startInk' | 'inkBonus'> {
  return { page, rounds: 1, deal: [], zen: true, startInk: 0, inkBonus: 0 };
}

export type RegionId = 'village' | 'orchard' | 'botanic' | 'estate' | 'wild';
export interface Region {
  id: RegionId;
  name: string;
  /** One line under its name on the map. */
  blurb: string;
  /** Stars across the map needed before any path in it can be bought. */
  stars: number;
}
export const REGIONS: readonly Region[] = [
  { id: 'village', name: 'The Village', blurb: 'Where every gardener starts.', stars: 0 },
  { id: 'orchard', name: 'The Orchard', blurb: 'Twists on the puzzle: fences, lost labels and crossed paths.', stars: 8 },
  { id: 'botanic', name: 'The Botanic Garden', blurb: 'More twists: shade, runners, bean poles, elbow room and tidy plots.', stars: 20 },
  { id: 'estate', name: 'The Estate', blurb: 'Bigger gardens, 7×7 and 8×8, with their own twists.', stars: 24 },
  { id: 'wild', name: 'The Wild Wood', blurb: 'Every twist at once.', stars: 42 },
];
export const regionById = (id: RegionId): Region => REGIONS.find((r) => r.id === id)!;

export type StationId =
  | 'copy-desk' | 'cloister' | 'bare-vellum' | 'counting-house' | 'long-night' | 'grand-folio'
  | 'window-box' | 'allotment' | 'walled-garden'
  | 'herb-spiral' | 'bee-garden'
  | 'espalier' | 'lost-labels' | 'knot-garden' | 'tea-garden' | 'secret-garden'
  | 'vineyard' | 'moon-garden' | 'stone-garden' | 'orangery' | 'maze'
  | 'bramble' | 'hedgerow' | 'meadow' | 'fern-hollow' | 'fairy-ring' | 'old-oak'
  | 'shade-garden' | 'strawberry-patch' | 'bean-rows' | 'parterre' | 'topiary' | 'moss-garden' | 'physic-garden';

/** What finds a hidden garden. Until then it shows as an overgrown corner of the map, with this as its clue. */
export type Reveal =
  | { kind: 'stars-at'; station: StationId; stars: number }
  | { kind: 'streak'; days: number }
  | { kind: 'zen-perfect' }
  | { kind: 'blooms'; plants: number }
  | { kind: 'weeklies'; count: number };

export interface Station {
  id: StationId;
  name: string;
  region: RegionId;
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
  /** A Zen garden: no requests and no water, just the puzzle. Its stars are for finishing, full bloom, and full bloom without Hint. */
  zen?: boolean;
  /** A commission kind this station brings: always in its own runs, and in every run once its page is filled. */
  brings?: CommissionKind;
  /** The path to it opens for buying once any one of these is finished. Empty: at the start of its region. */
  after: readonly StationId[];
  /** Seeds to open the path; 0 is free. */
  price: number;
  /** Hidden until this happens. */
  reveal?: Reveal;
  /** Score marks for the second and third stars (the first is finishing). A Zen garden's stars don't use them. */
  stars: readonly [number, number];
  /** Where it sits in its region, in a 3-column grid, top row first. */
  at: readonly [number, number];
  /** What it gives your home garden each time you finish it. */
  plant: PlantId;
}

export const STATIONS: readonly Station[] = [
  // The Village
  { id: 'window-box', name: 'The Window Box', region: 'village', twist: 'A small 5×5 garden, grown in four weeks.', ...season('five'), after: [], price: 0, stars: [70, 90], at: [0, 0], plant: 'daisy' },
  { id: 'copy-desk', name: 'The Kitchen Garden', region: 'village', twist: 'A standard garden.', ...season('six'), after: [], price: 0, stars: [100, 126], at: [0, 1], plant: 'marigold' },
  { id: 'herb-spiral', name: 'The Herb Spiral', region: 'village', twist: 'A Zen garden: every number at once, no requests, no water. Just the puzzle.', ...zen('five'), after: ['copy-desk'], price: 8, stars: [0, 0], at: [0, 2], plant: 'lavender' },
  { id: 'cloister', name: 'The Rock Garden', region: 'village', twist: 'More stones: a gentle garden.', ...season('six-rocks'), brings: 'corners-min', after: ['copy-desk'], price: 12, stars: [105, 132], at: [1, 0], plant: 'thrift' },
  { id: 'bare-vellum', name: 'The Fallow Field', region: 'village', twist: 'No stones at all.', ...season('six-fallow'), brings: 'quarter-min', after: ['copy-desk'], price: 12, stars: [85, 112], at: [1, 2], plant: 'poppy' },
  { id: 'bee-garden', name: 'The Bee Garden', region: 'village', twist: 'The bees are busy: every bonus request pays 2 more coins.', ...season('six'), bountyBonus: 2, after: ['cloister'], price: 16, reveal: { kind: 'stars-at', station: 'cloister', stars: 3 }, stars: [115, 145], at: [2, 0], plant: 'borage' },
  { id: 'counting-house', name: 'The Market Garden', region: 'village', twist: 'Only + and × plots.', ...season('six-market'), brings: 'seal-op-count', after: ['cloister', 'bare-vellum'], price: 20, stars: [100, 129], at: [2, 1], plant: 'sunflower' },
  // The Orchard
  { id: 'espalier', name: 'The Espalier', region: 'orchard', twist: 'Fences: a < or > between two squares says which number is bigger.', ...season('six-fences'), after: ['counting-house'], price: 24, stars: [90, 118], at: [0, 0], plant: 'apple-blossom' },
  { id: 'lost-labels', name: 'The Lost Labels', region: 'orchard', twist: 'Plots show only their target: adding, taking away, multiplying or dividing can make it.', ...season('six-hidden'), after: ['counting-house'], price: 24, stars: [100, 127], at: [0, 2], plant: 'cornflower' },
  { id: 'long-night', name: 'The Dry Spell', region: 'orchard', twist: 'Two drops of water, each worth double at harvest.', ...season('six'), startInk: 2, inkBonus: 20, after: ['espalier'], price: 28, stars: [105, 137], at: [1, 0], plant: 'cosmos' },
  { id: 'knot-garden', name: 'The Knot Garden', region: 'orchard', twist: 'Crossed paths: no number repeats on either long diagonal.', ...season('six-diagonal'), after: ['espalier', 'lost-labels'], price: 28, stars: [95, 122], at: [1, 1], plant: 'rose' },
  { id: 'tea-garden', name: 'The Tea Garden', region: 'orchard', twist: 'A Zen garden with fences: just the puzzle.', ...zen('six-fences'), after: ['lost-labels'], price: 20, stars: [0, 0], at: [1, 2], plant: 'camellia' },
  { id: 'grand-folio', name: 'The Long Season', region: 'orchard', twist: 'Eight weeks, with fewer numbers dealt in each.', page: 'six', rounds: 8, deal: [3, 3, 3, 3, 3, 3, 3], after: ['long-night'], price: 36, stars: [115, 150], at: [2, 0], plant: 'dahlia' },
  { id: 'secret-garden', name: 'The Secret Garden', region: 'orchard', twist: 'Lost labels behind fences: plots show only their target, and fences say which number is bigger.', ...season('six-hidden-fences'), after: ['tea-garden'], price: 32, reveal: { kind: 'zen-perfect' }, stars: [95, 120], at: [2, 2], plant: 'bluebell' },
  // The Estate
  { id: 'allotment', name: 'The Allotment', region: 'estate', twist: 'A 7×7 garden, numbers 1 to 7, over seven weeks.', ...season('seven'), after: ['grand-folio', 'knot-garden'], price: 40, stars: [130, 168], at: [0, 1], plant: 'sweet-pea' },
  { id: 'vineyard', name: 'The Vineyard', region: 'estate', twist: 'A 7×7 garden with fences.', ...season('seven-fences'), after: ['allotment'], price: 44, stars: [125, 160], at: [1, 0], plant: 'grape-hyacinth' },
  { id: 'moon-garden', name: 'The Moon Garden', region: 'estate', twist: 'A 7×7 garden of lost labels: plots show only their target.', ...season('seven-hidden'), after: ['allotment'], price: 44, stars: [130, 169], at: [1, 2], plant: 'moonflower' },
  { id: 'stone-garden', name: 'The Stone Garden', region: 'estate', twist: 'A 7×7 Zen garden: just the puzzle.', ...zen('seven'), after: ['vineyard'], price: 36, stars: [0, 0], at: [2, 0], plant: 'iris' },
  { id: 'walled-garden', name: 'The Walled Garden', region: 'estate', twist: 'An 8×8 garden, numbers 1 to 8, over eight weeks.', ...season('eight'), after: ['vineyard', 'moon-garden'], price: 56, stars: [185, 239], at: [2, 1], plant: 'peony' },
  { id: 'orangery', name: 'The Orangery', region: 'estate', twist: 'A warm 8×8 garden: more stones, and every bonus request pays 1 more coin.', ...season('eight-gentle'), bountyBonus: SEASONS[8].bountyBonus + 1, after: ['moon-garden'], price: 48, reveal: { kind: 'streak', days: 7 }, stars: [205, 262], at: [2, 2], plant: 'orange-blossom' },
  { id: 'maze', name: 'The Maze', region: 'estate', twist: 'An 8×8 garden of crossed paths: no number repeats on either long diagonal.', ...season('eight-diagonal'), after: ['walled-garden'], price: 64, stars: [180, 230], at: [3, 1], plant: 'tulip' },
  // The Botanic Garden
  { id: 'shade-garden', name: 'The Shade Garden', region: 'botanic', twist: 'Shade: shady squares take even numbers.', ...season('six-shade'), after: ['counting-house', 'espalier', 'lost-labels'], price: 24, stars: [95, 120], at: [0, 0], plant: 'hosta' },
  { id: 'strawberry-patch', name: 'The Strawberry Patch', region: 'botanic', twist: 'Runners: a berry between two squares joins numbers one apart, like 3 and 4.', ...season('six-runners'), after: ['counting-house', 'espalier', 'lost-labels'], price: 24, stars: [95, 120], at: [0, 2], plant: 'strawberry' },
  { id: 'parterre', name: 'The Parterre', region: 'botanic', twist: 'Tidy plots: no number repeats inside a plot.', ...season('six-tidy'), after: ['shade-garden'], price: 24, stars: [95, 124], at: [1, 0], plant: 'pansy' },
  { id: 'bean-rows', name: 'The Bean Rows', region: 'botanic', twist: 'Bean poles: numbers climb each pole, every one bigger than the one before it, from root to tip.', ...season('six-poles'), after: ['shade-garden', 'strawberry-patch'], price: 28, stars: [95, 119], at: [1, 1], plant: 'runner-bean' },
  { id: 'topiary', name: 'The Topiary', region: 'botanic', twist: 'Elbow room: no number touches the same number, not even at a corner.', ...season('six-elbow'), after: ['strawberry-patch'], price: 28, stars: [95, 123], at: [1, 2], plant: 'clematis' },
  { id: 'moss-garden', name: 'The Moss Garden', region: 'botanic', twist: 'A Zen garden of shade and runners: just the puzzle.', ...zen('six-shade-runners'), after: ['parterre'], price: 20, stars: [0, 0], at: [2, 0], plant: 'moss-rose' },
  { id: 'physic-garden', name: 'The Physic Garden', region: 'botanic', twist: 'A 7×7 garden of bean poles and runners.', ...season('seven-poles-runners'), after: ['bean-rows', 'topiary'], price: 40, reveal: { kind: 'weeklies', count: 3 }, stars: [120, 157], at: [2, 2], plant: 'chamomile' },
  // The Wild Wood
  { id: 'bramble', name: 'The Bramble', region: 'wild', twist: 'Lost labels and fences together.', ...season('six-hidden-fences'), after: ['walled-garden', 'maze'], price: 64, stars: [95, 120], at: [0, 1], plant: 'wild-rose' },
  { id: 'hedgerow', name: 'The Hedgerow', region: 'wild', twist: 'A 7×7 garden of fences and crossed paths.', ...season('seven-diagonal-fences'), after: ['bramble'], price: 72, stars: [125, 159], at: [1, 0], plant: 'honeysuckle' },
  { id: 'meadow', name: 'The Wildflower Meadow', region: 'wild', twist: 'A 7×7 garden of lost labels and crossed paths.', ...season('seven-hidden-diagonal'), after: ['bramble'], price: 72, stars: [135, 170], at: [1, 2], plant: 'buttercup' },
  { id: 'fern-hollow', name: 'The Fern Hollow', region: 'wild', twist: 'An 8×8 Zen garden with fences: just the puzzle.', ...zen('eight-fences'), after: ['hedgerow'], price: 56, stars: [0, 0], at: [2, 0], plant: 'fern' },
  { id: 'old-oak', name: 'The Old Oak', region: 'wild', twist: 'An 8×8 garden with every twist: lost labels, fences and crossed paths.', ...season('eight-all'), after: ['hedgerow', 'meadow'], price: 96, stars: [175, 224], at: [2, 1], plant: 'snowdrop' },
  { id: 'fairy-ring', name: 'The Fairy Ring', region: 'wild', twist: 'A 5×5 Zen garden with every twist.', ...zen('five-all'), after: ['meadow'], price: 40, reveal: { kind: 'blooms', plants: 5 }, stars: [0, 0], at: [2, 2], plant: 'foxglove' },
];

export const stationById = (id: string): Station | undefined => STATIONS.find((s) => s.id === id);
