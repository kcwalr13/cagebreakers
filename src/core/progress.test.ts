import { describe, expect, it } from 'vitest';
import { DAILY_PLANT, GROWTH, HOME, homeItem } from '../content/home';
import { DAILY, GOALS, WEEKLY } from '../content/journal';
import { REGIONS, STATIONS, stationById } from '../content/stations';
import { dailyKey, dayNumber, dayOf, mondayOf } from './calendar';
import { inBloom, stageOf } from './home';
import {
  type Profile, buyAndLay, buyHome, claimGoal, dailyStep, goalProgress, goalState, isFound, layHome, migrateProfile, moveHome, newProfile, openPath,
  pathBlocker, pickUpHome, plantHome, reachable, recordRun, regionOpen, rewardFor, setupFor, starsFor, stationOpen, streakNow, weeklyGarden,
} from './meta';
import { type RunSetup, type RunState, act, dealtThisRound, newRun, runPage, standardSetup } from './run';

/** Plays a run to its end on the hidden solution (so every plot blooms), keeping the water topped up. */
function fill(seed: string, setup: RunSetup, opts: { id?: string; daily?: string; weekly?: string } = {}): RunState {
  let s = newRun(seed, { setup, id: opts.id ?? `${seed}-run`, daily: opts.daily, weekly: opts.weekly });
  while (s.phase === 'arrange') {
    const p = runPage(s);
    for (const t of dealtThisRound(s)) {
      if (t.cell >= 0) continue;
      const c = p.stones.map((_, k) => k).find((k) => !p.stones[k] && p.solution[k] === t.n && !s.tokens.some((o) => o.cell === k));
      if (c !== undefined) s = act(s, { type: 'place', id: t.id, cell: c }).state;
    }
    s = act({ ...s, ink: s.setup.startInk }, { type: 'ink' }).state;
  }
  return s;
}

describe('the calendar', () => {
  it('counts days without a clock', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2026-10-25') - dayNumber('2026-10-24')).toBe(1);
    expect(dayNumber('2027-03-01') - dayNumber('2027-02-28')).toBe(1);
    expect(dayNumber('2028-03-01') - dayNumber('2028-02-28')).toBe(2);
    for (const d of ['2026-01-01', '2026-10-25', '2028-02-29', '1999-12-31']) expect(dayOf(dayNumber(d))).toBe(d);
    expect(mondayOf('2026-10-25')).toBe('2026-10-19'); // a Sunday
    expect(mondayOf('2026-10-26')).toBe('2026-10-26'); // a Monday
  });
});

describe('the daily streak', () => {
  const play = (days: string[]) => {
    let log = newProfile().daily;
    const out: number[] = [];
    for (const d of days) { const r = dailyStep(log, d, 6); log = r.log; out.push(r.streak); }
    return { log, out };
  };

  it('grows day by day, and forgives one missed day a week', () => {
    expect(play(['2026-10-01', '2026-10-02', '2026-10-03']).out).toEqual([1, 2, 3]);
    // Missing the 4th is forgiven; missing the 8th too, a week after the grace was used.
    expect(play(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09']).out).toEqual([1, 2, 3, 4, 5, 6, 1]);
    expect(play(['2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-10']).out).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Two missed days in a row break it.
    expect(play(['2026-10-01', '2026-10-02', '2026-10-05']).out).toEqual([1, 2, 1]);
    const { log } = play(['2026-10-01', '2026-10-02']);
    expect(streakNow(log, '2026-10-03')).toBe(2);
    expect(streakNow(log, '2026-10-04')).toBe(2);
    expect(streakNow(log, '2026-10-05')).toBe(0);
    expect(log.best).toBe(2);
  });

  it('pays each size once a day, the streak once a day, and all four once', () => {
    let log = newProfile().daily;
    const pay: number[] = [];
    for (const size of [6, 5, 5, 7, 8]) { const r = dailyStep(log, '2026-10-01', size); log = r.log; pay.push(r.seeds); }
    expect(pay).toEqual([DAILY.seeds + DAILY.perStreakDay, DAILY.seeds, 0, DAILY.seeds, DAILY.seeds + DAILY.allFour]);
    expect(log.four).toBe(1);
  });

  it('a finished Daily Garden pays its bonus and leaves a seed packet', () => {
    const p = newProfile();
    const s = fill('DAYLYQ', standardSetup(5), { daily: dailyKey('2026-10-24', 5) });
    const r = rewardFor(p, s);
    expect(r.fromDaily).toBe(DAILY.seeds + DAILY.perStreakDay);
    expect(r.plant).toBe(DAILY_PLANT);
    const after = recordRun(p, s, '2026-10-24');
    expect(after.leaf).toBe(r.leaf);
    expect(after.daily.streak).toBe(1);
    expect(after.home.tray).toEqual([DAILY_PLANT]);
    expect(after.stats).toMatchObject({ finished: 1, dailies: 1, sizes: [5], weeks: s.records.length });
  });
});

describe('the Weekly Garden', () => {
  it('is the same twisted garden on every phone for a week, and pays once a week', () => {
    const a = weeklyGarden('2026-10-19'), b = weeklyGarden('2026-10-19');
    expect(a).toEqual(b);
    expect(a.setup.page).toBe(a.page);
    const pages = new Set(Array.from({ length: 30 }, (_, i) => weeklyGarden(dayOf(dayNumber('2026-10-19') + 7 * i)).page));
    expect(pages.size).toBeGreaterThan(3);
    const p = newProfile();
    const s = fill(a.seed, a.setup, { weekly: '2026-10-19' });
    expect(rewardFor(p, s).fromWeekly).toBe(WEEKLY.seeds);
    const after = recordRun(p, s, 'x');
    expect(after.weekly).toEqual(['2026-10-19']);
    expect(rewardFor(after, { ...s, id: 'again' }).fromWeekly).toBe(0);
  });
});

describe('regions and hidden gardens', () => {
  it('open a region with stars, and find a hidden garden by its clue', () => {
    const p = newProfile();
    const orchard = REGIONS.find((r) => r.id === 'orchard')!;
    expect(regionOpen(p, orchard)).toBe(false);
    const withMarket: Profile = { ...p, filled: ['copy-desk', 'cloister', 'counting-house'], leaf: 100 };
    expect(pathBlocker(withMarket, stationById('espalier')!)).toMatch(/opens with 8 stars/);
    const starred: Profile = { ...withMarket, stars: { 'copy-desk': 3, cloister: 2, 'counting-house': 3 } };
    expect(reachable(starred, stationById('espalier')!)).toBe(true);
    // The Bee Garden hides behind the Rock Garden until all three of its stars are earned.
    const bee = stationById('bee-garden')!;
    expect(isFound(starred, bee)).toBe(false);
    expect(pathBlocker(starred, bee)).toMatch(/Earn all 3 stars at The Rock Garden/);
    const found: Profile = { ...starred, stars: { ...starred.stars, cloister: 3 } };
    expect(isFound(found, bee)).toBe(true);
    expect(openPath(found, 'bee-garden').ok).toBe(true);
  });

  it('every garden can be reached from the start, and each region needs fewer stars than the map holds before it', () => {
    const order = REGIONS.map((r) => r.id);
    let before = 0;
    for (const r of REGIONS) {
      const gardens = STATIONS.filter((st) => st.region === r.id);
      expect(gardens.length).toBeGreaterThanOrEqual(5);
      expect(gardens.length).toBeLessThanOrEqual(8);
      expect(r.stars).toBeLessThanOrEqual(before * 0.75);
      before += gardens.length * 3;
    }
    // Following paths from the free gardens reaches every garden.
    const seen = new Set(STATIONS.filter((st) => st.price === 0).map((st) => st.id));
    for (let changed = true; changed;) {
      changed = false;
      for (const st of STATIONS) if (!seen.has(st.id) && st.after.some((a) => seen.has(a))) { seen.add(st.id); changed = true; }
    }
    expect(seen.size).toBe(STATIONS.length);
    for (const st of STATIONS) for (const a of st.after) expect(order.indexOf(stationById(a)!.region)).toBeLessThanOrEqual(order.indexOf(st.region));
  });

  it('a Zen garden stars finishing, full bloom, and full bloom without a Hint', () => {
    const p = newProfile();
    const st = stationById('herb-spiral')!;
    const s = fill('ZENSTR', { ...standardSetup(5), page: st.page, rounds: 1, deal: [], zen: true, startInk: 0, inkBonus: 0 });
    expect(s.phase).toBe('done');
    expect(starsFor(st, s)).toBe(3);
    expect(starsFor(st, { ...s, revealed: [0] })).toBe(2);
    const after = recordRun(p, s, 'x');
    expect(after.stats.zenPerfect).toBe(1);
    expect(isFound(after, stationById('secret-garden')!)).toBe(true);
    expect(after.found).toContain('secret-garden');
  });
});

describe('the journal', () => {
  it('claims a finished goal once, for its seeds', () => {
    let p = newProfile();
    const first = GOALS.find((g) => g.id === 'first-harvest')!;
    expect(goalState(p, first)).toBe('open');
    expect(claimGoal(p, 'first-harvest').ok).toBe(false);
    p = recordRun(p, fill('JRNLAQ', standardSetup(6)), 'x');
    expect(goalProgress(p, first)).toBe(1);
    expect(goalState(p, first)).toBe('ready');
    const r = claimGoal(p, 'first-harvest');
    expect(r.ok).toBe(true);
    expect(r.profile.leaf).toBe(p.leaf + first.reward);
    expect(claimGoal(r.profile, 'first-harvest').reason).toBe('Already claimed');
  });
});

describe('the home garden', () => {
  it('lays bought things, plants seed packets in beds, and grows them with the weeks you water', () => {
    let p: Profile = { ...newProfile(), leaf: 100 };
    const empty = p.home.tiles.findIndex((t) => !t);
    const bed = p.home.tiles.findIndex((t) => t?.item === 'bed');
    expect(buyAndLay(p, empty, 'bench').ok).toBe(true);
    p = buyAndLay(p, empty, 'bench').profile;
    expect(p.leaf).toBe(100 - homeItem('bench').price);
    expect(buyHome(p, 'bench').reason).toBe('Already yours');
    expect(plantHome(p, bed, 'poppy').reason).toMatch(/No seed packet/);
    p = { ...p, home: { ...p.home, tray: ['poppy'] } };
    expect(plantHome(p, empty, 'poppy').reason).toMatch(/go in a bed/);
    p = plantHome(p, bed, 'poppy').profile;
    expect(p.home.tray).toEqual([]);
    expect(p.home.planted).toBe(1);
    const plant = p.home.tiles[bed]!.plant!;
    expect(stageOf(plant, p.stats.weeks)).toBe(0);
    const grown = (weeks: number) => stageOf(plant, p.stats.weeks + weeks);
    expect(GROWTH.weeks.map((w) => grown(w))).toEqual([0, 1, 2, 3, 4]);
    expect(inBloom(p.home, p.stats.weeks + GROWTH.weeks[4])).toBe(1);
    // A plant moves to an empty bed, still growing; picked up, it goes back to the tray as a seed.
    p = buyHome(p, 'bed').profile;
    const spot = p.home.tiles.findIndex((t) => !t);
    p = layHome(p, spot, 'bed').profile;
    p = moveHome(p, bed, spot).profile;
    expect(p.home.tiles[spot]!.plant).toEqual(plant);
    expect(p.home.tiles[bed]).toEqual({ item: 'bed' });
    p = pickUpHome(p, spot).profile;
    expect(p.home.tray).toEqual(['poppy']);
    p = pickUpHome(p, spot).profile;
    expect(p.home.stock.bed).toBe(1);
  });

  it('keeps at most a tray of seed packets', () => {
    let p = newProfile();
    const garden = fill('TRAYQQ', setupFor(newProfile(), 'window-box'));
    for (let i = 0; i < HOME.trayMax + 3; i++) p = recordRun(p, { ...garden, id: `t${i}` }, 'x');
    expect(p.home.tray).toHaveLength(HOME.trayMax);
    expect(p.home.tray[0]).toBe(stationById('window-box')!.plant);
  });
});

describe('profiles from before the regions', () => {
  it('keep every garden that was open, their streak from the Herbarium, and a seed packet for each pressed garden', () => {
    const lib = (id: string, station: string | null, daily?: string) => ({ id, seed: 'ABCDEF', station, ...(daily ? { daily } : {}), page: 'six', erased: [], values: [], score: 100, stars: 1, when: 'x' });
    const old = {
      v: 1, leaf: 30, earned: 90, owned: ['quill'], filled: ['copy-desk', 'cloister', 'counting-house', 'long-night'], stars: { 'copy-desk': 2 }, best: {},
      satchel: ['lens', 'quill'], counted: [],
      library: [lib('c', null, '2026-10-24'), lib('b', null, '2026-10-23'), lib('a', 'copy-desk')],
    };
    const p = migrateProfile(old);
    expect(p.v).toBe(2);
    expect(p.leaf).toBe(30);
    for (const id of ['copy-desk', 'window-box', 'cloister', 'bare-vellum', 'counting-house', 'long-night', 'grand-folio'] as const) {
      expect(stationOpen(p, stationById(id)!), id).toBe(true);
    }
    expect(stationOpen(p, stationById('allotment')!)).toBe(false);
    expect(p.daily).toMatchObject({ streak: 2, best: 2, last: '2026-10-24' });
    expect(p.stats).toMatchObject({ finished: 3, dailies: 2 });
    expect(p.home.tray).toEqual(['marigold', DAILY_PLANT, DAILY_PLANT]);
    expect(migrateProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});
