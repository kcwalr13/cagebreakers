/**
 * The home garden: a grid of squares where you lay beds, paths and ornaments, and plant what your
 * finished gardens give you. Plants grow with every week you water in any garden. Pure functions
 * over plain data; src/core/meta.ts wraps them for the profile (seeds, and the weeks played).
 */
import { GROWTH, HOME, type HomeItemId, type PlantId, homeItem } from '../content/home';

export interface Plant {
  species: PlantId;
  /** The weeks you had watered in all when it was planted: its age is the weeks watered since. */
  at: number;
}

/** A square: empty grass (null), or something laid there, with a plant when it's a bed. */
export type Tile = { item: HomeItemId; plant?: Plant } | null;

export interface Home {
  /** Row by row, HOME.cols wide. */
  tiles: Tile[];
  /** Seed packets waiting to be planted, oldest first. */
  tray: PlantId[];
  /** Bought but not laid yet. */
  stock: Partial<Record<HomeItemId, number>>;
  /** Plants ever planted. */
  planted: number;
}

export function newHome(): Home {
  const tiles: Tile[] = new Array(HOME.cols * HOME.rows).fill(null);
  for (const { at, item } of HOME.start) tiles[at] = { item };
  return { tiles, tray: [], stock: {}, planted: 0 };
}

/** A plant's stage, 0 (just planted) to 4 (in bloom), after `weeks` watered in all. */
export function stageOf(plant: Plant, weeks: number): number {
  const age = weeks - plant.at;
  let stage = 0;
  GROWTH.weeks.forEach((w, i) => { if (age >= w) stage = i; });
  return stage;
}

/** Weeks until a plant reaches its next stage, or 0 when it's in bloom. */
export function weeksToNext(plant: Plant, weeks: number): number {
  const stage = stageOf(plant, weeks);
  const next = GROWTH.weeks[stage + 1];
  return next === undefined ? 0 : next - (weeks - plant.at);
}

export const BLOOM_STAGE = GROWTH.weeks.length - 1;

/** Plants in bloom right now. */
export const inBloom = (h: Home, weeks: number) => h.tiles.filter((t) => t?.plant && stageOf(t.plant, weeks) === BLOOM_STAGE).length;

/** How many of a thing you own: laid in the garden, and waiting in the shed. */
export const ownedCount = (h: Home, id: HomeItemId) => h.tiles.filter((t) => t?.item === id).length + (h.stock[id] ?? 0);

const withStock = (h: Home, id: HomeItemId, by: number): Home['stock'] => {
  const n = (h.stock[id] ?? 0) + by;
  const stock = { ...h.stock };
  if (n > 0) stock[id] = n; else delete stock[id];
  return stock;
};

export type HomeResult = { home: Home; ok: true } | { home: Home; ok: false; reason: string };
const no = (home: Home, reason: string): HomeResult => ({ home, ok: false, reason });

/** Why a thing can't be bought, given the seeds you have; null when it can. */
export function cantBuyHome(h: Home, id: HomeItemId, leaf: number): string | null {
  const item = homeItem(id);
  if (ownedCount(h, id) >= item.max) return item.max === 1 ? 'Already yours' : `You have all ${item.max}`;
  if (leaf < item.price) return `Costs ${item.price} seeds`;
  return null;
}

/** Puts a bought thing in the shed. The caller takes the seeds. */
export function stockItem(h: Home, id: HomeItemId): Home {
  return { ...h, stock: withStock(h, id, 1) };
}

/** Lays a thing from the shed on an empty square. */
export function layItem(h: Home, at: number, id: HomeItemId): HomeResult {
  if (at < 0 || at >= h.tiles.length) return no(h, 'Off the garden');
  if (h.tiles[at]) return no(h, 'Something is there already');
  if (!h.stock[id]) return no(h, `You have no ${homeItem(id).name.toLowerCase()} in the shed`);
  const tiles = h.tiles.slice();
  tiles[at] = { item: id };
  return { home: { ...h, tiles, stock: withStock(h, id, -1) }, ok: true };
}

/** Plants a seed packet from the tray in an empty bed. */
export function plantIn(h: Home, at: number, species: PlantId, weeks: number): HomeResult {
  const tile = h.tiles[at];
  if (!tile || homeItem(tile.item).kind !== 'bed') return no(h, 'Plants go in a bed');
  if (tile.plant) return no(h, 'That bed is planted already');
  const i = h.tray.indexOf(species);
  if (i < 0) return no(h, 'No seed packet of that');
  const tiles = h.tiles.slice();
  tiles[at] = { ...tile, plant: { species, at: weeks } };
  const tray = h.tray.slice();
  tray.splice(i, 1);
  return { home: { ...h, tiles, tray, planted: h.planted + 1 }, ok: true };
}

/**
 * Moves what stands on a square: onto empty grass, the whole thing (a bed keeps its plant); a
 * plant onto an empty bed, just the plant, still growing as it was.
 */
export function moveTile(h: Home, from: number, to: number): HomeResult {
  const a = h.tiles[from], b = h.tiles[to];
  if (!a || from === to) return no(h, 'Nothing to move');
  if (to < 0 || to >= h.tiles.length) return no(h, 'Off the garden');
  const tiles = h.tiles.slice();
  if (!b) { tiles[to] = a; tiles[from] = null; return { home: { ...h, tiles }, ok: true }; }
  if (a.plant && homeItem(b.item).kind === 'bed' && !b.plant) {
    tiles[to] = { ...b, plant: a.plant };
    tiles[from] = { item: a.item };
    return { home: { ...h, tiles }, ok: true };
  }
  return no(h, 'Something is there already');
}

/**
 * Clears a square: a plant goes back to the tray as a seed packet (it starts again from seed), and
 * anything else goes back to the shed. A bed with a plant gives up the plant first.
 */
export function pickUp(h: Home, at: number): HomeResult {
  const tile = h.tiles[at];
  if (!tile) return no(h, 'Nothing there');
  const tiles = h.tiles.slice();
  if (tile.plant) {
    tiles[at] = { item: tile.item };
    return { home: { ...h, tiles, tray: [...h.tray, tile.plant.species].slice(-HOME.trayMax) }, ok: true };
  }
  tiles[at] = null;
  return { home: { ...h, tiles, stock: withStock(h, tile.item, 1) }, ok: true };
}

/** Adds a seed packet to the tray; past the most it holds, the oldest goes. */
export const givePlant = (h: Home, species: PlantId): Home => ({ ...h, tray: [...h.tray, species].slice(-HOME.trayMax) });

/** Reads a saved home garden, keeping what's valid. */
export function migrateHome(raw: unknown): Home {
  const fresh = newHome();
  if (!raw || typeof raw !== 'object') return fresh;
  const r = raw as Partial<Home>;
  const tiles = Array.isArray(r.tiles) && r.tiles.length === fresh.tiles.length ? r.tiles : fresh.tiles;
  return { tiles, tray: Array.isArray(r.tray) ? r.tray : [], stock: r.stock ?? {}, planted: r.planted ?? 0 };
}
