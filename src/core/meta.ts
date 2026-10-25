/**
 * The scriptorium: the progress that lasts between runs. Pure functions over a plain profile, so
 * the app saves it, tests check it, and the bot lab can measure how fast a player progresses.
 */
import { BASE_TOOLS, SATCHEL, TOOLS, type ToolId } from '../content/balance';
import type { CommissionKind } from '../content/commissions';
import { ITEMS, type Item, type ItemId, LEAF, LIBRARY_SIZE, PERKS } from '../content/meta';
import { STATIONS, type Station, type StationId, stationById } from '../content/stations';
import { type RunSetup, type RunState, STANDARD_SETUP, scoreOf, valuesOf } from './run';

/** A filled page, bound into the library. */
export interface LibraryEntry {
  id: string;
  seed: string;
  station: StationId | null;
  daily?: string;
  page: RunSetup['page'];
  erased: number[];
  /** Every number on the finished page, printed ones included. */
  values: number[];
  score: number;
  stars: number;
  /** When it was filled, as the app wrote it. */
  when: string;
}

export interface Profile {
  v: 1;
  leaf: number;
  /** All the leaf ever earned. */
  earned: number;
  owned: ItemId[];
  /** Stations whose page has been filled at least once. */
  filled: StationId[];
  stars: Partial<Record<StationId, number>>;
  best: Partial<Record<StationId, number>>;
  /** The tools chosen to carry on map runs. */
  satchel: ToolId[];
  /** Ids of runs already rewarded, so a run is never counted twice. */
  counted: string[];
  library: LibraryEntry[];
}

export const NEW_PROFILE: Profile = {
  v: 1, leaf: 0, earned: 0, owned: [], filled: [], stars: {}, best: {}, satchel: [...BASE_TOOLS], counted: [], library: [],
};

/** Reads a saved profile, filling anything missing; garbage reads as a new profile. */
export function migrateProfile(raw: unknown): Profile {
  if (!raw || typeof raw !== 'object' || (raw as Profile).v !== 1) return { ...NEW_PROFILE, satchel: [...BASE_TOOLS] };
  const r = raw as Partial<Profile>;
  return {
    ...NEW_PROFILE,
    ...r,
    owned: r.owned ?? [], filled: r.filled ?? [], stars: r.stars ?? {}, best: r.best ?? {},
    // Tools that were retired (Swap, Shield) drop out of a saved satchel.
    satchel: r.satchel?.some((t) => t in TOOLS) ? r.satchel.filter((t) => t in TOOLS) : [...BASE_TOOLS], counted: r.counted ?? [], library: r.library ?? [],
  } as Profile;
}

const owns = (p: Profile, id: ItemId) => p.owned.includes(id);

export function stationOpen(p: Profile, station: Station): boolean {
  return station.after.length === 0 || station.after.some((id) => p.filled.includes(id));
}

/** Stars a finished run earns at its station: one for filling the page, one for each score mark. */
export function starsFor(station: Station | undefined, s: RunState): number {
  if (!station || s.phase !== 'done') return 0;
  const score = scoreOf(s).total;
  return 1 + (score >= station.stars[0] ? 1 : 0) + (score >= station.stars[1] ? 1 : 0);
}

export interface Reward {
  leaf: number;
  /** Leaf for the score, and for stars earned for the first time. */
  fromScore: number;
  fromStars: number;
  stars: number;
  newStars: number;
  /** True the first time this station's page is filled. */
  firstFill: boolean;
}

/** What a finished run earns. Nothing for a run still in play. */
export function rewardFor(p: Profile, s: RunState): Reward {
  const none: Reward = { leaf: 0, fromScore: 0, fromStars: 0, stars: 0, newStars: 0, firstFill: false };
  if (s.phase === 'arrange') return none;
  if (s.phase === 'ruined') {
    const fromScore = Math.floor(s.gold / LEAF.ruinedPerGold);
    return { ...none, leaf: fromScore, fromScore };
  }
  const station = s.setup.station ? stationById(s.setup.station) : undefined;
  const fromScore = Math.floor(scoreOf(s).total / LEAF.perPoints);
  const stars = starsFor(station, s);
  const newStars = station ? Math.max(0, stars - (p.stars[station.id] ?? 0)) : 0;
  const fromStars = newStars * LEAF.perStar;
  return { leaf: fromScore + fromStars, fromScore, fromStars, stars, newStars, firstFill: !!station && !p.filled.includes(station.id) };
}

/** Records a finished run: leaf, stars, best score, the station filled, and the library. Counts each run once. */
export function recordRun(p: Profile, s: RunState, when: string): Profile {
  if (s.phase === 'arrange' || !s.id || p.counted.includes(s.id)) return p;
  const r = rewardFor(p, s);
  const next: Profile = { ...p, leaf: p.leaf + r.leaf, earned: p.earned + r.leaf, counted: [s.id, ...p.counted].slice(0, 50) };
  const station = s.setup.station as StationId | null;
  if (s.phase === 'done') {
    const score = scoreOf(s).total;
    if (station) {
      next.stars = { ...p.stars, [station]: Math.max(p.stars[station] ?? 0, r.stars) };
      next.best = { ...p.best, [station]: Math.max(p.best[station] ?? 0, score) };
      if (!p.filled.includes(station)) next.filled = [...p.filled, station];
    }
    const entry: LibraryEntry = {
      id: s.id, seed: s.seed, station, ...(s.daily ? { daily: s.daily } : {}), page: s.setup.page, erased: s.erased.slice(),
      values: valuesOf(s), score, stars: r.stars, when,
    };
    next.library = [entry, ...p.library].slice(0, LIBRARY_SIZE);
  }
  return next;
}

/** Why an item can't be bought now, or null when it can. */
export function cantBuy(p: Profile, item: Item): string | null {
  if (owns(p, item.id)) return 'Already yours';
  if (item.after && !p.filled.includes(item.after)) return `Opens when you finish ${stationById(item.after)!.name}`;
  if (item.needs && !owns(p, item.needs)) return `Needs ${ITEMS.find((i) => i.id === item.needs)!.name}`;
  if (p.leaf < item.price) return `Costs ${item.price} seeds`;
  return null;
}

export function buy(p: Profile, id: ItemId): { profile: Profile; ok: boolean; reason?: string } {
  const item = ITEMS.find((i) => i.id === id);
  if (!item) return { profile: p, ok: false, reason: 'No such thing' };
  const why = cantBuy(p, item);
  if (why) return { profile: p, ok: false, reason: why };
  const next: Profile = { ...p, leaf: p.leaf - item.price, owned: [...p.owned, id] };
  // A new tool goes straight into the satchel when there's room.
  if (item.kind === 'tool' && next.satchel.length < satchelSize(next)) next.satchel = [...next.satchel, id as ToolId];
  return { profile: next, ok: true };
}

/** Every tool you can carry: the three you start with and the ones you've bought. */
export function ownedTools(p: Profile): ToolId[] {
  return [...BASE_TOOLS, ...ITEMS.filter((i) => i.kind === 'tool' && owns(p, i.id)).map((i) => i.id as ToolId)];
}

export const satchelSize = (p: Profile) => (owns(p, 'second-strap') ? SATCHEL.strapSlots : SATCHEL.slots);

/** Chooses the tools to carry; refuses more than fit, or tools you don't own. */
export function setSatchel(p: Profile, tools: readonly ToolId[]): Profile {
  const mine = ownedTools(p);
  const pick = [...new Set(tools)].filter((t) => mine.includes(t)).slice(0, satchelSize(p));
  return { ...p, satchel: pick };
}

/** Commission kinds open in a run: the station's own, and every station's whose page you've filled. */
export function enabledKinds(p: Profile, station: Station): CommissionKind[] {
  const kinds = new Set<CommissionKind>();
  if (station.brings) kinds.add(station.brings);
  for (const st of STATIONS) if (st.brings && p.filled.includes(st.id)) kinds.add(st.brings);
  return [...kinds];
}

/** The setup for a map run: the station's twist, the satchel and every upgrade you own. */
export function setupFor(p: Profile, id: StationId): RunSetup {
  const station = stationById(id)!;
  const gold = owns(p, 'purse-2') ? PERKS.purse2Gold : owns(p, 'purse-1') ? PERKS.purse1Gold : 0;
  return {
    station: station.id,
    page: station.page,
    rounds: station.rounds ?? STANDARD_SETUP.rounds,
    deal: station.deal ?? STANDARD_SETUP.deal,
    startInk: (station.startInk ?? STANDARD_SETUP.startInk) + (owns(p, 'deeper-inkwell') ? PERKS.deeperInkwell : 0),
    startGold: STANDARD_SETUP.startGold + gold,
    inkBonus: station.inkBonus ?? STANDARD_SETUP.inkBonus,
    tools: p.satchel.length ? p.satchel : [...BASE_TOOLS],
    bountyBonus: (station.bountyBonus ?? 0) + (owns(p, 'bounty-hunter') ? PERKS.bountyHunter : 0),
    kinds: enabledKinds(p, station),
  };
}

/** Total stars across the map, and the most there are. */
export function starCount(p: Profile): { have: number; of: number } {
  return { have: STATIONS.reduce((n, st) => n + (p.stars[st.id] ?? 0), 0), of: STATIONS.length * 3 };
}
