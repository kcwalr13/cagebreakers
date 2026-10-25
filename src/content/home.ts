/**
 * The home garden: the plants finished gardens give you, how they grow, and the beds, paths and
 * ornaments seeds buy for it. Balance numbers live here; the rules live in src/core/home.ts.
 */

export type PlantId =
  | 'daisy' | 'marigold' | 'lavender' | 'thrift' | 'poppy' | 'borage' | 'sunflower'
  | 'apple-blossom' | 'cornflower' | 'cosmos' | 'rose' | 'camellia' | 'dahlia' | 'bluebell'
  | 'sweet-pea' | 'grape-hyacinth' | 'moonflower' | 'iris' | 'peony' | 'orange-blossom' | 'tulip'
  | 'wild-rose' | 'honeysuckle' | 'buttercup' | 'fern' | 'snowdrop' | 'foxglove'
  | 'forget-me-not' | 'water-lily';

/**
 * How a plant looks in bloom, drawn by the app: the shape of its flower, how many petals, and its
 * colours. Flowers keep their own colours in every look, like an illustration.
 */
export interface Species {
  id: PlantId;
  name: string;
  shape: 'round' | 'pointed' | 'cup' | 'spike' | 'star' | 'layered' | 'frond';
  petals: number;
  colour: string;
  heart: string;
}

export const SPECIES: Record<PlantId, Species> = {
  daisy: { id: 'daisy', name: 'Daisy', shape: 'round', petals: 12, colour: '#fbfaf3', heart: '#f2c230' },
  marigold: { id: 'marigold', name: 'Marigold', shape: 'layered', petals: 10, colour: '#f39a1e', heart: '#c25f0c' },
  lavender: { id: 'lavender', name: 'Lavender', shape: 'spike', petals: 7, colour: '#9a7fd1', heart: '#6f55a8' },
  thrift: { id: 'thrift', name: 'Thrift', shape: 'round', petals: 9, colour: '#f2a0c0', heart: '#d8679a' },
  poppy: { id: 'poppy', name: 'Poppy', shape: 'round', petals: 4, colour: '#e0402e', heart: '#2b2421' },
  borage: { id: 'borage', name: 'Borage', shape: 'star', petals: 5, colour: '#5f86e0', heart: '#2b2a4a' },
  sunflower: { id: 'sunflower', name: 'Sunflower', shape: 'pointed', petals: 14, colour: '#f6c21c', heart: '#6b4219' },
  'apple-blossom': { id: 'apple-blossom', name: 'Apple blossom', shape: 'round', petals: 5, colour: '#fbe0e6', heart: '#e8b84a' },
  cornflower: { id: 'cornflower', name: 'Cornflower', shape: 'pointed', petals: 9, colour: '#3f6fd8', heart: '#28307a' },
  cosmos: { id: 'cosmos', name: 'Cosmos', shape: 'round', petals: 8, colour: '#e05aa8', heart: '#f2c230' },
  rose: { id: 'rose', name: 'Rose', shape: 'layered', petals: 7, colour: '#d23a55', heart: '#9c1f38' },
  camellia: { id: 'camellia', name: 'Camellia', shape: 'layered', petals: 6, colour: '#f08aa0', heart: '#f5d36a' },
  dahlia: { id: 'dahlia', name: 'Dahlia', shape: 'pointed', petals: 16, colour: '#b8234a', heart: '#7a1530' },
  bluebell: { id: 'bluebell', name: 'Bluebell', shape: 'cup', petals: 3, colour: '#6a78d8', heart: '#454fa8' },
  'sweet-pea': { id: 'sweet-pea', name: 'Sweet pea', shape: 'spike', petals: 5, colour: '#d59ae0', heart: '#a865b8' },
  'grape-hyacinth': { id: 'grape-hyacinth', name: 'Grape hyacinth', shape: 'spike', petals: 9, colour: '#4b4fb8', heart: '#2f3280' },
  moonflower: { id: 'moonflower', name: 'Moonflower', shape: 'star', petals: 5, colour: '#f4f1ff', heart: '#cfc6f0' },
  iris: { id: 'iris', name: 'Iris', shape: 'pointed', petals: 6, colour: '#7b4fc8', heart: '#f2c230' },
  peony: { id: 'peony', name: 'Peony', shape: 'layered', petals: 9, colour: '#f3a6b8', heart: '#e57b95' },
  'orange-blossom': { id: 'orange-blossom', name: 'Orange blossom', shape: 'star', petals: 5, colour: '#fffaf0', heart: '#f39a1e' },
  tulip: { id: 'tulip', name: 'Tulip', shape: 'cup', petals: 3, colour: '#e4423f', heart: '#a32a2a' },
  'wild-rose': { id: 'wild-rose', name: 'Wild rose', shape: 'round', petals: 5, colour: '#f6c2cf', heart: '#f2c230' },
  honeysuckle: { id: 'honeysuckle', name: 'Honeysuckle', shape: 'star', petals: 6, colour: '#f6e3a2', heart: '#e0a43c' },
  buttercup: { id: 'buttercup', name: 'Buttercup', shape: 'cup', petals: 5, colour: '#f7d21e', heart: '#d9a50c' },
  fern: { id: 'fern', name: 'Fern', shape: 'frond', petals: 5, colour: '#5d9a4a', heart: '#3f7533' },
  snowdrop: { id: 'snowdrop', name: 'Snowdrop', shape: 'cup', petals: 3, colour: '#fbfbf7', heart: '#9cc48a' },
  foxglove: { id: 'foxglove', name: 'Foxglove', shape: 'spike', petals: 6, colour: '#c75aa8', heart: '#8f3378' },
  'forget-me-not': { id: 'forget-me-not', name: 'Forget-me-not', shape: 'round', petals: 5, colour: '#7fb4ec', heart: '#f2d548' },
  'water-lily': { id: 'water-lily', name: 'Water lily', shape: 'pointed', petals: 10, colour: '#fbe3ee', heart: '#f2c230' },
};

/** What the Daily Gardens and the Weekly Garden give. Map gardens give their own (see stations.ts). */
export const DAILY_PLANT: PlantId = 'forget-me-not';
export const WEEKLY_PLANT: PlantId = 'water-lily';

/**
 * A plant grows as you play: its stage comes from the weeks watered in any garden since it was
 * planted. Stages: seed, sprout, leafy, in bud, in bloom.
 */
export const GROWTH = { weeks: [0, 2, 6, 12, 20] as const, names: ['Just planted', 'Sprouting', 'Leafy', 'In bud', 'In bloom'] as const };

export type HomeItemId =
  | 'bed' | 'stepping-stones' | 'gravel' | 'brick-path' | 'lawn-edge'
  | 'bird-house' | 'bench' | 'sundial' | 'fountain' | 'beehive' | 'scarecrow' | 'lantern' | 'well'
  | 'bonsai' | 'fruit-tree' | 'swing' | 'bridge' | 'frog' | 'mushroom-house' | 'butterflies';

export interface HomeItem {
  id: HomeItemId;
  kind: 'bed' | 'path' | 'ornament';
  name: string;
  price: number;
  /** How many you can own in all, placed or in the shed. */
  max: number;
  text: string;
}

export const HOME_ITEMS: readonly HomeItem[] = [
  { id: 'bed', kind: 'bed', name: 'Raised bed', price: 8, max: 30, text: 'A bed for one plant.' },
  { id: 'stepping-stones', kind: 'path', name: 'Stepping stones', price: 2, max: 40, text: 'A square of path.' },
  { id: 'gravel', kind: 'path', name: 'Gravel', price: 2, max: 40, text: 'A square of raked gravel.' },
  { id: 'brick-path', kind: 'path', name: 'Brick path', price: 3, max: 40, text: 'A square of old brick.' },
  { id: 'lawn-edge', kind: 'path', name: 'Clover lawn', price: 1, max: 40, text: 'A square of soft clover.' },
  { id: 'bird-house', kind: 'ornament', name: 'Bird house', price: 15, max: 1, text: 'For the robins.' },
  { id: 'frog', kind: 'ornament', name: 'Stone frog', price: 12, max: 1, text: 'He watches the beds.' },
  { id: 'lantern', kind: 'ornament', name: 'Lantern', price: 18, max: 1, text: 'For evenings in the garden.' },
  { id: 'scarecrow', kind: 'ornament', name: 'Scarecrow', price: 20, max: 1, text: 'Keeps the crows honest.' },
  { id: 'bench', kind: 'ornament', name: 'Bench', price: 25, max: 1, text: 'A seat to admire the view.' },
  { id: 'butterflies', kind: 'ornament', name: 'Butterfly bush', price: 25, max: 1, text: 'It fills with butterflies.' },
  { id: 'sundial', kind: 'ornament', name: 'Sundial', price: 30, max: 1, text: 'It only counts the sunny hours.' },
  { id: 'beehive', kind: 'ornament', name: 'Beehive', price: 30, max: 1, text: 'Busy all summer.' },
  { id: 'mushroom-house', kind: 'ornament', name: 'Toadstool house', price: 30, max: 1, text: 'Someone small lives here.' },
  { id: 'fruit-tree', kind: 'ornament', name: 'Fruit tree', price: 35, max: 1, text: 'Apples in the autumn.' },
  { id: 'bonsai', kind: 'ornament', name: 'Bonsai', price: 35, max: 1, text: 'A patient little tree.' },
  { id: 'swing', kind: 'ornament', name: 'Tree swing', price: 40, max: 1, text: 'Higher!' },
  { id: 'well', kind: 'ornament', name: 'Wishing well', price: 45, max: 1, text: 'Make a wish.' },
  { id: 'fountain', kind: 'ornament', name: 'Fountain', price: 50, max: 1, text: 'The sound of water.' },
  { id: 'bridge', kind: 'ornament', name: 'Little bridge', price: 50, max: 1, text: 'Over a stream only you can see.' },
];
export const homeItem = (id: HomeItemId): HomeItem => HOME_ITEMS.find((i) => i.id === id)!;

/**
 * The home garden's grid, how many seed packets wait to be planted at most (more than that and the
 * oldest is given away), and the garden you start with: three beds along a stepping-stone path.
 */
export const HOME = {
  cols: 6,
  rows: 8,
  trayMax: 24,
  start: [
    { at: 13, item: 'bed' }, { at: 14, item: 'stepping-stones' }, { at: 15, item: 'bed' },
    { at: 20, item: 'stepping-stones' }, { at: 26, item: 'stepping-stones' }, { at: 27, item: 'bed' },
  ] as readonly { at: number; item: HomeItemId }[],
} as const;
