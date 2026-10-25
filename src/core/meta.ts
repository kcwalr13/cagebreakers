/**
 * The scriptorium: the progress that lasts between runs. Pure functions over a plain profile, so
 * the app saves it, tests check it, and the bot lab can measure how fast a player progresses.
 * It holds seeds (leaf in code), stars, the paths bought on the map and the hidden gardens found,
 * the daily streak and the Weekly Garden, the journal of goals, and the home garden.
 */
import { BASE_TOOLS, SATCHEL, TOOLS, type ToolId } from '../content/balance';
import type { CommissionKind } from '../content/commissions';
import { DAILY_PLANT, HOME, HOME_ITEMS, type HomeItemId, type PlantId, WEEKLY_PLANT, homeItem } from '../content/home';
import { DAILY, GOALS, type Goal, type GoalId, WEEKLY, WEEKLY_GARDENS } from '../content/journal';
import { ITEMS, type Item, type ItemId, LEAF, LIBRARY_SIZE, PERKS } from '../content/meta';
import {
  PAGE_VARIANTS, type PageVariant, REGIONS, type Region, SEASONS, STATIONS, type Station, type StationId, regionById, sizeOfPage, stationById,
} from '../content/stations';
import { dailyParts, dayNumber, dayOf } from './calendar';
import type { Size } from './grid';
import {
  type Home, type HomeResult, cantBuyHome, givePlant, inBloom, layItem, migrateHome, moveTile, newHome, ownedCount, pickUp, plantIn, stockItem,
} from './home';
import { stream } from './rng';
import { type RunSetup, type RunState, STANDARD_SETUP, runPage, scoreOf, standardSetup, valuesOf } from './run';
import { dailySeed } from './seed';

/** A filled page, bound into the library. */
export interface LibraryEntry {
  id: string;
  seed: string;
  station: StationId | null;
  daily?: string;
  weekly?: string;
  page: RunSetup['page'];
  erased: number[];
  /** Every number on the finished page, printed ones included. */
  values: number[];
  score: number;
  stars: number;
  /** When it was filled, as the app wrote it. */
  when: string;
}

export type Twist = 'fences' | 'hidden' | 'diagonal' | 'zen';

/** Counts kept for the journal. */
export interface Stats {
  /** Gardens finished (filled to harvest), of every kind. */
  finished: number;
  /** Finished with every plot in bloom. */
  fullBloom: number;
  /** Seasons finished without losing a drop of water. */
  noSpill: number;
  /** Seasons where every week met all three requests. */
  perfectSeasons: number;
  /** Zen gardens finished in full bloom without a Hint. */
  zenPerfect: number;
  /** Weeks watered in all, in every garden: what makes the home garden grow. */
  weeks: number;
  dailies: number;
  weeklies: number;
  /** Sizes of garden finished. */
  sizes: Size[];
  /** Twists of garden finished. */
  twists: Twist[];
}

/** The daily streak: which sizes were finished on recent days, and how the streak stands. */
export interface DailyLog {
  /** Sizes finished on each recent day (the Daily Garden's own day). */
  done: Record<string, number[]>;
  streak: number;
  best: number;
  /** The latest day a Daily Garden was finished for. */
  last: string | null;
  /** The latest missed day a grace day covered. */
  grace: string | null;
  /** Days with all four sizes finished. */
  four: number;
}

export interface Profile {
  v: 2;
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
  /** Gardens whose path has been opened (bought, or free and reached). */
  paths: StationId[];
  /** Hidden gardens found. */
  found: StationId[];
  daily: DailyLog;
  /** Weeks (their Mondays) whose Weekly Garden has been finished, newest first. */
  weekly: string[];
  /** Goals claimed. */
  journal: GoalId[];
  stats: Stats;
  home: Home;
}

const NEW_STATS: Stats = { finished: 0, fullBloom: 0, noSpill: 0, perfectSeasons: 0, zenPerfect: 0, weeks: 0, dailies: 0, weeklies: 0, sizes: [], twists: [] };
const NEW_DAILY: DailyLog = { done: {}, streak: 0, best: 0, last: null, grace: null, four: 0 };

export const NEW_PROFILE: Profile = {
  v: 2, leaf: 0, earned: 0, owned: [], filled: [], stars: {}, best: {}, satchel: [...BASE_TOOLS], counted: [], library: [],
  paths: [], found: [], daily: NEW_DAILY, weekly: [], journal: [], stats: NEW_STATS, home: newHome(),
};

/** A fresh profile (the shared constant's arrays and objects are never handed out to be changed). */
export const newProfile = (): Profile => ({ ...NEW_PROFILE, satchel: [...BASE_TOOLS], home: newHome() });

/** Before M9, a station opened once any one of these had been filled. Saved players keep what was open. */
const OLD_AFTER: Partial<Record<StationId, readonly StationId[]>> = {
  'copy-desk': [], cloister: ['copy-desk'], 'bare-vellum': ['copy-desk'], 'counting-house': ['cloister', 'bare-vellum'],
  'long-night': ['counting-house'], 'grand-folio': ['long-night'], 'window-box': [], allotment: ['grand-folio'], 'walled-garden': ['grand-folio'],
};

/** What a library entry's garden gives the home garden. */
const plantOfEntry = (e: Pick<LibraryEntry, 'station' | 'daily' | 'weekly'>): PlantId | null =>
  e.station ? stationById(e.station)?.plant ?? null : e.daily ? DAILY_PLANT : e.weekly ? WEEKLY_PLANT : null;

/** Profiles from before M9: everything open stays open, the library's Daily Gardens make the streak, and each pressed garden leaves a seed packet. */
function fromV1(r: Partial<Profile>): Profile {
  const filled = r.filled ?? [];
  const library = r.library ?? [];
  const paths = (Object.keys(OLD_AFTER) as StationId[]).filter((id) => OLD_AFTER[id]!.length === 0 || OLD_AFTER[id]!.some((a) => filled.includes(a)));
  let daily = NEW_DAILY;
  const stats: Stats = { ...NEW_STATS, sizes: [], twists: [] };
  for (const e of library.slice().reverse()) {
    const size = sizeOfPage(e.page);
    stats.finished++;
    if (!stats.sizes.includes(size)) stats.sizes.push(size);
    stats.weeks += e.station ? stationById(e.station)?.rounds ?? SEASONS[size].rounds : SEASONS[size].rounds;
    if (e.daily) { stats.dailies++; const { day, size: ds } = dailyParts(e.daily); daily = dailyStep(daily, day, ds).log; }
  }
  let home = newHome();
  for (const e of library.slice(0, HOME.trayMax).reverse()) { const pl = plantOfEntry(e); if (pl) home = givePlant(home, pl); }
  return { ...NEW_PROFILE, ...r, v: 2, paths, daily, stats, home } as Profile;
}

/** Reads a saved profile, filling anything missing; garbage reads as a new profile. */
export function migrateProfile(raw: unknown): Profile {
  if (!raw || typeof raw !== 'object') return newProfile();
  const v = (raw as { v?: number }).v;
  if (v !== 1 && v !== 2) return newProfile();
  const r = raw as Partial<Profile>;
  const base: Partial<Profile> = {
    ...r,
    owned: r.owned ?? [], filled: r.filled ?? [], stars: r.stars ?? {}, best: r.best ?? {},
    // Tools that were retired (Swap, Shield) drop out of a saved satchel.
    satchel: r.satchel?.some((t) => t in TOOLS) ? r.satchel.filter((t) => t in TOOLS) : [...BASE_TOOLS], counted: r.counted ?? [], library: r.library ?? [],
  };
  if (v === 1) return fromV1(base);
  return {
    ...NEW_PROFILE, ...base,
    paths: r.paths ?? [], found: r.found ?? [], daily: { ...NEW_DAILY, ...r.daily }, weekly: r.weekly ?? [], journal: r.journal ?? [],
    stats: { ...NEW_STATS, ...r.stats }, home: migrateHome(r.home),
  } as Profile;
}

const owns = (p: Profile, id: ItemId) => p.owned.includes(id);

// ---- The map: regions, paths and hidden gardens -------------------------------------------------

/** Total stars across the map, and the most there are. */
export function starCount(p: Profile): { have: number; of: number } {
  return { have: STATIONS.reduce((n, st) => n + (p.stars[st.id] ?? 0), 0), of: STATIONS.length * 3 };
}

export const regionOpen = (p: Profile, r: Region) => starCount(p).have >= r.stars;

/** Whether a hidden garden's clue has come true now. */
function revealNow(p: Profile, st: Station): boolean {
  const r = st.reveal;
  if (!r) return true;
  switch (r.kind) {
    case 'stars-at': return (p.stars[r.station] ?? 0) >= r.stars;
    case 'streak': return p.daily.best >= r.days;
    case 'zen-perfect': return p.stats.zenPerfect > 0;
    case 'blooms': return inBloom(p.home, p.stats.weeks) >= r.plants;
  }
}

/** A garden that isn't hidden, or a hidden one that has been found. */
export const isFound = (p: Profile, st: Station) => !st.reveal || p.found.includes(st.id) || revealNow(p, st);

/** What finds a hidden garden, as its clue on the map. */
export function clueOf(st: Station): string {
  const r = st.reveal;
  if (!r) return '';
  switch (r.kind) {
    case 'stars-at': return `Earn all ${r.stars} stars at ${stationById(r.station)!.name} to find it.`;
    case 'streak': return `Keep a daily streak for ${r.days} days to find it.`;
    case 'zen-perfect': return 'Finish a Zen garden in full bloom without a Hint to find it.';
    case 'blooms': return `Grow ${r.plants} plants at home until they bloom to find it.`;
  }
}

/** Records hidden gardens whose clue has come true, so they stay found. */
function withFound(p: Profile): Profile {
  const now = STATIONS.filter((st) => st.reveal && !p.found.includes(st.id) && revealNow(p, st)).map((st) => st.id);
  return now.length ? { ...p, found: [...p.found, ...now] } : p;
}

/** The path to a garden can be bought: its region is open, it's been found, and a garden before it is finished. */
export function reachable(p: Profile, st: Station): boolean {
  return isFound(p, st) && regionOpen(p, regionById(st.region)) && (st.after.length === 0 || st.after.some((id) => p.filled.includes(id)));
}

/** A garden you can play: its path is open, or it's free and reached. */
export function stationOpen(p: Profile, st: Station): boolean {
  return p.paths.includes(st.id) || (st.price === 0 && reachable(p, st));
}

/** Why the path to a garden can't be opened now, or null when it can. */
export function pathBlocker(p: Profile, st: Station): string | null {
  if (stationOpen(p, st)) return 'Already open';
  if (!isFound(p, st)) return clueOf(st);
  const region = regionById(st.region);
  if (!regionOpen(p, region)) return `${region.name} opens with ${region.stars} stars`;
  if (st.after.length && !st.after.some((id) => p.filled.includes(id))) return `Finish ${st.after.map((id) => stationById(id)!.name).join(' or ')} first`;
  if (p.leaf < st.price) return `Costs ${st.price} seeds`;
  return null;
}

/** Buys the path to a garden. */
export function openPath(p: Profile, id: StationId): { profile: Profile; ok: boolean; reason?: string } {
  const st = stationById(id);
  if (!st) return { profile: p, ok: false, reason: 'No such garden' };
  const why = pathBlocker(p, st);
  if (why) return { profile: p, ok: false, reason: why };
  return { profile: { ...p, leaf: p.leaf - st.price, paths: [...p.paths, id] }, ok: true };
}

// ---- Stars and rewards ------------------------------------------------------------------------

/** Whether the finished garden ended with every plot in bloom. */
function fullBloom(s: RunState): boolean {
  const last = s.records[s.records.length - 1];
  return s.phase === 'done' && !!last && last.seals === runPage(s).cages.length;
}

/**
 * Stars a finished run earns at its station: one for filling the page, one for each score mark.
 * A Zen garden's stars are for finishing, for full bloom, and for full bloom without a Hint.
 */
export function starsFor(station: Station | undefined, s: RunState): number {
  if (!station || s.phase !== 'done') return 0;
  if (station.zen) {
    const full = fullBloom(s);
    return 1 + (full ? 1 : 0) + (full && !s.revealed.length ? 1 : 0);
  }
  const score = scoreOf(s).total;
  return 1 + (score >= station.stars[0] ? 1 : 0) + (score >= station.stars[1] ? 1 : 0);
}

/**
 * One finished Daily Garden in the streak: the day's sizes, the streak (a gap of one missed day is
 * forgiven once in any `graceDays` days), and the seeds it pays.
 */
export function dailyStep(log: DailyLog, day: string, size: number): { log: DailyLog; seeds: number; streak: number; allFour: boolean } {
  const sizes = log.done[day] ?? [];
  if (sizes.includes(size)) return { log, seeds: 0, streak: log.streak, allFour: false };
  let { streak, last, grace } = log;
  const firstToday = sizes.length === 0;
  if (firstToday) {
    const gap = last === null ? Infinity : dayNumber(day) - dayNumber(last);
    if (gap === 1) streak++;
    else if (gap === 2 && (grace === null || dayNumber(day) - 1 - dayNumber(grace) >= DAILY.graceDays)) { streak++; grace = dayOf(dayNumber(day) - 1); }
    else if (gap > 0) streak = 1;
    // A Daily Garden from an earlier day, finished late, keeps the streak as it is.
    if (gap > 0) last = day;
    if (streak === 0) streak = 1;
  }
  const now = [...sizes, size];
  const allFour = now.length === 4;
  const seeds = DAILY.seeds + (firstToday ? Math.min(streak, DAILY.streakCap) * DAILY.perStreakDay : 0) + (allFour ? DAILY.allFour : 0);
  // Keep the last fortnight of days.
  const done: Record<string, number[]> = { [day]: now };
  for (const [d, v] of Object.entries(log.done)) if (d !== day && dayNumber(d) > dayNumber(last ?? day) - 14) done[d] = v;
  return {
    log: { done, streak, best: Math.max(log.best, streak), last, grace, four: log.four + (allFour ? 1 : 0) },
    seeds, streak, allFour,
  };
}

/** The streak as it stands today: still alive if today or yesterday was played, or a grace day would cover yesterday. */
export function streakNow(log: DailyLog, today: string): number {
  if (log.last === null) return 0;
  const gap = dayNumber(today) - dayNumber(log.last);
  if (gap <= 1) return log.streak;
  if (gap === 2 && (log.grace === null || dayNumber(today) - 1 - dayNumber(log.grace) >= DAILY.graceDays)) return log.streak;
  return 0;
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
  /** A Daily Garden's bonus: its seeds, the streak after it, and whether it finished all four sizes today. */
  fromDaily: number;
  streak: number;
  allFour: boolean;
  /** The Weekly Garden's bonus, the first time each week. */
  fromWeekly: number;
  /** The seed packet it leaves for the home garden. */
  plant: PlantId | null;
}

/** What a finished run earns. Nothing for a run still in play. */
export function rewardFor(p: Profile, s: RunState): Reward {
  const none: Reward = { leaf: 0, fromScore: 0, fromStars: 0, stars: 0, newStars: 0, firstFill: false, fromDaily: 0, streak: 0, allFour: false, fromWeekly: 0, plant: null };
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
  let fromDaily = 0, streak = 0, allFour = false;
  if (s.daily) {
    const { day, size } = dailyParts(s.daily);
    ({ seeds: fromDaily, streak, allFour } = dailyStep(p.daily, day, size));
  }
  const fromWeekly = s.weekly && !p.weekly.includes(s.weekly) ? WEEKLY.seeds : 0;
  return {
    leaf: fromScore + fromStars + fromDaily + fromWeekly, fromScore, fromStars, stars, newStars, firstFill: !!station && !p.filled.includes(station.id),
    fromDaily, streak, allFour, fromWeekly,
    plant: plantOfEntry({ station: station?.id ?? null, daily: s.daily, weekly: s.weekly }),
  };
}

/** The twists of a finished garden, for the journal. */
function twistsOfRun(s: RunState): Twist[] {
  const rules = PAGE_VARIANTS[s.setup.page];
  const out: Twist[] = [];
  if (rules.fences) out.push('fences');
  if (rules.hidden) out.push('hidden');
  if (rules.diagonal) out.push('diagonal');
  if (s.setup.zen) out.push('zen');
  return out;
}

function statsAfter(st: Stats, s: RunState): Stats {
  const next: Stats = { ...st, weeks: st.weeks + s.records.length };
  if (s.phase !== 'done') return next;
  const size = runPage(s).size as Size;
  const full = fullBloom(s);
  next.finished++;
  if (full) next.fullBloom++;
  if (!s.setup.zen && s.records.every((r) => !r.inkSpilled)) next.noSpill++;
  if (!s.setup.zen && s.records.every((r) => r.required === true && r.bounties >= 2)) next.perfectSeasons++;
  if (s.setup.zen && full && !s.revealed.length) next.zenPerfect++;
  if (s.daily) next.dailies++;
  if (s.weekly) next.weeklies++;
  if (!next.sizes.includes(size)) next.sizes = [...next.sizes, size];
  for (const t of twistsOfRun(s)) if (!next.twists.includes(t)) next.twists = [...next.twists, t];
  return next;
}

/** Records a finished run: leaf, stars, best score, the station filled, the streak, the journal's counts, a seed packet, and the library. Counts each run once. */
export function recordRun(p: Profile, s: RunState, when: string): Profile {
  if (s.phase === 'arrange' || !s.id || p.counted.includes(s.id)) return p;
  const r = rewardFor(p, s);
  const next: Profile = {
    ...p, leaf: p.leaf + r.leaf, earned: p.earned + r.leaf, counted: [s.id, ...p.counted].slice(0, 50), stats: statsAfter(p.stats, s),
  };
  const station = s.setup.station as StationId | null;
  if (s.phase === 'done') {
    const score = scoreOf(s).total;
    if (station) {
      next.stars = { ...p.stars, [station]: Math.max(p.stars[station] ?? 0, r.stars) };
      next.best = { ...p.best, [station]: Math.max(p.best[station] ?? 0, score) };
      if (!p.filled.includes(station)) next.filled = [...p.filled, station];
    }
    if (s.daily) { const { day, size } = dailyParts(s.daily); next.daily = dailyStep(p.daily, day, size).log; }
    if (s.weekly && !p.weekly.includes(s.weekly)) next.weekly = [s.weekly, ...p.weekly].slice(0, 20);
    if (r.plant) next.home = givePlant(p.home, r.plant);
    const entry: LibraryEntry = {
      id: s.id, seed: s.seed, station, ...(s.daily ? { daily: s.daily } : {}), ...(s.weekly ? { weekly: s.weekly } : {}), page: s.setup.page,
      erased: s.erased.slice(), values: valuesOf(s), score, stars: r.stars, when,
    };
    next.library = [entry, ...p.library].slice(0, LIBRARY_SIZE);
  }
  return withFound(next);
}

// ---- The Potting Shed -------------------------------------------------------------------------

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

/** The setup for a map run: the station's twist, the satchel and every upgrade you own. A Zen garden carries only Hint. */
export function setupFor(p: Profile, id: StationId): RunSetup {
  const station = stationById(id)!;
  const gold = owns(p, 'purse-2') ? PERKS.purse2Gold : owns(p, 'purse-1') ? PERKS.purse1Gold : 0;
  return {
    station: station.id,
    page: station.page,
    rounds: station.rounds ?? STANDARD_SETUP.rounds,
    deal: station.deal ?? STANDARD_SETUP.deal,
    startInk: station.zen ? 0 : (station.startInk ?? STANDARD_SETUP.startInk) + (owns(p, 'deeper-inkwell') ? PERKS.deeperInkwell : 0),
    startGold: STANDARD_SETUP.startGold + gold,
    inkBonus: station.inkBonus ?? STANDARD_SETUP.inkBonus,
    tools: station.zen ? [...BASE_TOOLS] : p.satchel.length ? p.satchel : [...BASE_TOOLS],
    bountyBonus: (station.bountyBonus ?? 0) + (owns(p, 'bounty-hunter') ? PERKS.bountyHunter : 0),
    kinds: enabledKinds(p, station),
    ...(station.zen ? { zen: true } : {}),
  };
}

// ---- The Weekly Garden ------------------------------------------------------------------------

/** The week's Weekly Garden, the same on every phone: its seed, its twist and its setup (no upgrades, only Hint). */
export function weeklyGarden(week: string): { seed: string; page: PageVariant; twist: string; setup: RunSetup } {
  const seed = dailySeed(`week:${week}`);
  const pick = WEEKLY_GARDENS[stream(seed, 'weekly.garden').int(0, WEEKLY_GARDENS.length - 1)]!;
  const size = sizeOfPage(pick.page);
  return { seed, page: pick.page, twist: pick.twist, setup: { ...standardSetup(size), page: pick.page } };
}

// ---- The journal ------------------------------------------------------------------------------

/** How far along a goal is, in its own measure. */
export function goalProgress(p: Profile, g: Goal): number {
  const st = p.stats;
  switch (g.measure) {
    case 'finished': return st.finished;
    case 'full-bloom': return st.fullBloom;
    case 'no-spill': return st.noSpill;
    case 'perfect-season': return st.perfectSeasons;
    case 'daily-four': return p.daily.four;
    case 'streak': return p.daily.best;
    case 'sizes': return st.sizes.length;
    case 'twist-fences': return st.twists.includes('fences') ? 1 : 0;
    case 'twist-hidden': return st.twists.includes('hidden') ? 1 : 0;
    case 'twist-diagonal': return st.twists.includes('diagonal') ? 1 : 0;
    case 'twist-zen': return st.twists.includes('zen') ? 1 : 0;
    case 'zen-perfect': return st.zenPerfect;
    case 'stars': return starCount(p).have;
    case 'regions': return REGIONS.filter((r) => regionOpen(p, r)).length;
    case 'paths': return p.paths.length;
    case 'found': return STATIONS.filter((s2) => s2.reveal && isFound(p, s2)).length;
    case 'planted': return p.home.planted;
    case 'in-bloom': return inBloom(p.home, st.weeks);
    case 'weeklies': return st.weeklies;
    case 'ornaments': return HOME_ITEMS.filter((i) => i.kind === 'ornament' && ownedCount(p.home, i.id) > 0).length;
  }
}

export type GoalState = 'claimed' | 'ready' | 'open';
export function goalState(p: Profile, g: Goal): GoalState {
  if (p.journal.includes(g.id)) return 'claimed';
  return goalProgress(p, g) >= g.of ? 'ready' : 'open';
}

/** Goals done and waiting to be claimed. */
export const goalsReady = (p: Profile) => GOALS.filter((g) => goalState(p, g) === 'ready');

/** Claims a finished goal's seeds. */
export function claimGoal(p: Profile, id: GoalId): { profile: Profile; ok: boolean; reason?: string } {
  const g = GOALS.find((x) => x.id === id);
  if (!g) return { profile: p, ok: false, reason: 'No such goal' };
  const state = goalState(p, g);
  if (state === 'claimed') return { profile: p, ok: false, reason: 'Already claimed' };
  if (state === 'open') return { profile: p, ok: false, reason: `${goalProgress(p, g)} of ${g.of} so far` };
  return { profile: { ...p, leaf: p.leaf + g.reward, earned: p.earned + g.reward, journal: [...p.journal, id] }, ok: true };
}

// ---- The home garden --------------------------------------------------------------------------

type ProfileResult = { profile: Profile; ok: boolean; reason?: string };
const homeDone = (p: Profile, r: HomeResult): ProfileResult =>
  (r.ok ? { profile: withFound({ ...p, home: r.home }), ok: true } : { profile: p, ok: false, reason: r.reason });

/** Buys something for the home garden; it waits in the shed until it's laid. */
export function buyHome(p: Profile, id: HomeItemId): ProfileResult {
  const why = cantBuyHome(p.home, id, p.leaf);
  if (why) return { profile: p, ok: false, reason: why };
  return { profile: { ...p, leaf: p.leaf - homeItem(id).price, home: stockItem(p.home, id) }, ok: true };
}

/** Buys something and lays it on an empty square in one go. */
export function buyAndLay(p: Profile, at: number, id: HomeItemId): ProfileResult {
  if (p.home.tiles[at]) return { profile: p, ok: false, reason: 'Something is there already' };
  const bought = buyHome(p, id);
  if (!bought.ok) return bought;
  return homeDone(bought.profile, layItem(bought.profile.home, at, id));
}

export const layHome = (p: Profile, at: number, id: HomeItemId) => homeDone(p, layItem(p.home, at, id));
export const plantHome = (p: Profile, at: number, species: PlantId) => homeDone(p, plantIn(p.home, at, species, p.stats.weeks));
export const moveHome = (p: Profile, from: number, to: number) => homeDone(p, moveTile(p.home, from, to));
export const pickUpHome = (p: Profile, at: number) => homeDone(p, pickUp(p.home, at));
