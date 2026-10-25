import { describe, expect, it } from 'vitest';
import { BASE_TOOLS, RUN, TOOLS } from '../content/balance';
import { ITEMS, LEAF, LIBRARY_SIZE, PERKS } from '../content/meta';
import { STATIONS, type StationId, stationById } from '../content/stations';
import { describe as say } from './commission';
import { CELLS } from './grid';
import {
  NEW_PROFILE, type Profile, buy, cantBuy, enabledKinds, migrateProfile, ownedTools, recordRun, rewardFor, satchelSize, setSatchel,
  setupFor, starsFor, stationOpen,
} from './meta';
import { pageOf } from './run';
import { type RunSetup, type RunState, STANDARD_SETUP, act, dealtThisRound, newRun, placementOf, runPage, scoreOf, valuesOf } from './run';

const fresh = (): Profile => migrateProfile(null);

/** Plays a run to its end by putting numbers on the solution, keeping the ink topped up. */
function fill(seed: string, setup: RunSetup, id = `${seed}-run`): RunState {
  let s = newRun(seed, { setup, id });
  while (s.phase === 'arrange') {
    const p = runPage(s);
    for (const t of dealtThisRound(s)) {
      if (t.cell >= 0) continue;
      const c = Array.from({ length: CELLS }, (_, k) => k).find((k) => !p.stones[k] && p.solution[k] === t.n && !s.tokens.some((o) => o.cell === k));
      if (c !== undefined) s = act(s, { type: 'place', id: t.id, cell: c }).state;
    }
    s = act({ ...s, ink: s.setup.startInk }, { type: 'ink' }).state;
  }
  return s;
}

describe('stations', () => {
  it('make the pages their twists promise', () => {
    for (let i = 0; i < 60; i++) {
      const seed = `PGV${'23456789ABCDEFGHJKMNPQRSTUVWXYZ'[i % 31]}${'ABC'[Math.floor(i / 31)]}Q`;
      const stones = (v: 'cloister' | 'bare') => pageOf(seed, v).stones.filter(Boolean).length;
      expect(stones('cloister')).toBeGreaterThanOrEqual(12);
      expect(stones('bare')).toBe(0);
      expect(pageOf(seed, 'counting').cages.every((c) => c.op === '+' || c.op === '×')).toBe(true);
    }
  });

  it('each play to a full page, with their own rounds and ink', () => {
    for (const st of STATIONS) {
      const setup = setupFor(fresh(), st.id);
      const s = fill(`ST${st.id.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')}AQ`, setup);
      expect(s.phase, st.id).toBe('done');
      expect(s.records).toHaveLength(st.rounds ?? RUN.rounds);
      expect(valuesOf(s).every((n) => n > 0)).toBe(true);
    }
    expect(setupFor(fresh(), 'long-night').startInk).toBe(2);
    expect(setupFor(fresh(), 'grand-folio').rounds).toBe(10);
  });

  it('bring their commission kinds to their own runs, and to every run once filled', () => {
    const p = fresh();
    expect(enabledKinds(p, stationById('copy-desk')!)).toEqual([]);
    expect(enabledKinds(p, stationById('cloister')!)).toEqual(['corners-min']);
    const filled: Profile = { ...p, filled: ['cloister', 'bare-vellum'] };
    expect(enabledKinds(filled, stationById('copy-desk')!).sort()).toEqual(['corners-min', 'quarter-min']);
    // An enabled kind does turn up; a gated one never does uninvited.
    const kindsSeen = (setup: RunSetup) => {
      const seen = new Set<string>();
      for (let i = 0; i < 12; i++) {
        let s = newRun(`KND${'ABCDEFGHJKMN'[i]}QQ`, { setup });
        for (let r = 0; r < 4 && s.phase === 'arrange'; r++) {
          for (const c of s.posted) seen.add(c.c.kind);
          const p2 = runPage(s);
          for (const t of dealtThisRound(s)) {
            const c = Array.from({ length: CELLS }, (_, k) => k).find((k) => !p2.stones[k] && p2.solution[k] === t.n && !s.tokens.some((o) => o.cell === k));
            if (c !== undefined) s = act(s, { type: 'place', id: t.id, cell: c }).state;
          }
          s = act({ ...s, ink: 3 }, { type: 'ink' }).state;
        }
      }
      return seen;
    };
    expect(kindsSeen(STANDARD_SETUP).has('corners-min')).toBe(false);
    expect(kindsSeen({ ...STANDARD_SETUP, kinds: ['corners-min'] }).has('corners-min')).toBe(true);
  });

  it('open in order', () => {
    const p = fresh();
    const open = (id: StationId, prof: Profile) => stationOpen(prof, stationById(id)!);
    expect(open('copy-desk', p)).toBe(true);
    expect(open('cloister', p)).toBe(false);
    const q: Profile = { ...p, filled: ['copy-desk'] };
    expect(open('cloister', q) && open('bare-vellum', q)).toBe(true);
    expect(open('counting-house', q)).toBe(false);
    expect(open('counting-house', { ...q, filled: ['copy-desk', 'bare-vellum'] })).toBe(true);
  });
});

describe('tools', () => {
  const all: RunSetup = { ...STANDARD_SETUP, startGold: 50, tools: ['lens', 'quill', 'gilder', 'eraser', 'inkwell'] };

  it('refuse tools you are not carrying', () => {
    const s = { ...newRun('CARRYQ'), gold: 50 };
    expect(act(s, { type: 'quill' }).reason).toMatch(/aren't carrying Extra/);
  });

  it('the Quill draws one extra number, keeping a perfect round possible', () => {
    const s = newRun('QUILLA', { setup: all });
    const r = act(s, { type: 'quill' });
    expect(r.ok, r.reason).toBe(true);
    expect(dealtThisRound(r.state)).toHaveLength(dealtThisRound(s).length + 1);
    expect(r.state.need).toBe(s.need);
    expect(r.state.gold).toBe(50 - TOOLS.quill);
  });

  it('the Gilder doubles what seals pay this round', () => {
    let s = newRun('GILDER', { setup: all });
    s = act(s, { type: 'gilder' }).state;
    expect(act(s, { type: 'gilder' }).ok).toBe(false);
    const p = runPage(s);
    for (const t of dealtThisRound(s)) {
      const c = Array.from({ length: CELLS }, (_, k) => k).find((k) => !p.stones[k] && p.solution[k] === t.n && !s.tokens.some((o) => o.cell === k));
      if (c !== undefined) s = act(s, { type: 'place', id: t.id, cell: c }).state;
    }
    const r = act(s, { type: 'ink' });
    expect(r.inked!.sealGold).toBe(r.inked!.seals * RUN.sealGold * 2);
    expect(r.state.gilded).toBe(false);
  });

  it('the Inkwell refills a drop, never past the start', () => {
    const s = newRun('INKWEL', { setup: all });
    expect(act(s, { type: 'inkwell' }).reason).toMatch(/already full/);
    const r = act({ ...s, ink: 1 }, { type: 'inkwell' });
    expect(r.state.ink).toBe(2);
  });

  it('the Eraser lifts a printed number into your hand for good', () => {
    const s = newRun('ERASER', { setup: all });
    const p = runPage(s);
    const stone = p.stones.findIndex((n) => n > 0);
    const r = act(s, { type: 'eraser', cell: stone });
    if (!r.ok) { expect(r.reason).toMatch(/impossible/); return; }
    const t = r.state.tokens.find((x) => x.round === 0)!;
    expect(t).toMatchObject({ n: p.stones[stone], cell: stone });
    expect(runPage(r.state).stones[stone]).toBe(0);
    // It's one of your numbers now: it can move, and counts like any other.
    const lifted = act(r.state, { type: 'place', id: t.id, cell: -1 }).state;
    expect(placementOf(lifted).hand).toContain(t.n);
    expect(act(s, { type: 'eraser', cell: p.stones.findIndex((n) => n === 0) }).reason).toMatch(/printed number/);
  });
});

describe('the scriptorium', () => {
  it('pays leaf for a filled page: points and new stars', () => {
    const p = fresh();
    const s = fill('LEAFAA', setupFor(p, 'copy-desk'));
    const r = rewardFor(p, s);
    const st = stationById('copy-desk')!;
    expect(r.stars).toBe(starsFor(st, s));
    expect(r.fromScore).toBe(Math.floor(scoreOf(s).total / LEAF.perPoints));
    expect(r.fromStars).toBe(r.stars * LEAF.perStar);
    expect(r.firstFill).toBe(true);
    const after = recordRun(p, s, '2026-10-24');
    expect(after.leaf).toBe(r.leaf);
    expect(after.filled).toEqual(['copy-desk']);
    expect(after.stars['copy-desk']).toBe(r.stars);
    expect(after.library[0]).toMatchObject({ seed: 'LEAFAA', station: 'copy-desk', score: scoreOf(s).total });
    // Counted once, however often it's recorded.
    expect(recordRun(after, s, '2026-10-24')).toBe(after);
    // Stars already earned pay nothing the second time.
    const again = fill('LEAFAA', setupFor(after, 'copy-desk'), 'second');
    expect(rewardFor(after, again).fromStars).toBe(0);
  });

  it('pays a little for a ruined page, and binds only filled ones', () => {
    const p = fresh();
    const s: RunState = { ...newRun('RUINQQ', { id: 'r1' }), phase: 'ruined', gold: 45 };
    expect(rewardFor(p, s).leaf).toBe(Math.floor(45 / LEAF.ruinedPerGold));
    expect(recordRun(p, s, 'x').library).toHaveLength(0);
  });

  it('keeps the library to its size, newest first', () => {
    let p = fresh();
    const s = fill('LIBRRY', STANDARD_SETUP);
    for (let i = 0; i < LIBRARY_SIZE + 5; i++) p = recordRun(p, { ...s, id: `id${i}` }, `${i}`);
    expect(p.library).toHaveLength(LIBRARY_SIZE);
    expect(p.library[0]!.when).toBe(`${LIBRARY_SIZE + 4}`);
  });

  it('sells each thing once, in order, for leaf', () => {
    let p: Profile = { ...fresh(), leaf: 200 };
    expect(buy(p, 'eraser').reason).toMatch(/Opens when you fill The Cloister/);
    expect(buy(p, 'purse-2').reason).toMatch(/Needs Patron's Purse/);
    let r = buy(p, 'quill');
    expect(r.ok).toBe(true);
    p = r.profile;
    expect(p.leaf).toBe(200 - ITEMS.find((i) => i.id === 'quill')!.price);
    expect(buy(p, 'quill').reason).toBe('Already yours');
    expect(ownedTools(p)).toEqual([...BASE_TOOLS, 'quill']);
    // A new tool goes into the satchel while there's room; it holds three until the Second Strap.
    expect(p.satchel).toEqual([...BASE_TOOLS, 'quill']);
    p = { ...p, owned: [...p.owned, 'eraser', 'inkwell'] };
    p = setSatchel(p, ['quill', 'lens', 'eraser', 'inkwell']);
    expect(p.satchel).toEqual(['quill', 'lens', 'eraser']);
    p = { ...p, filled: ['grand-folio'] };
    r = buy(p, 'second-strap');
    p = r.profile;
    expect(satchelSize(p)).toBe(4);
    expect(cantBuy({ ...p, leaf: 0 }, ITEMS.find((i) => i.id === 'gilder')!)).toMatch(/Costs/);
  });

  it('turns upgrades into the run setup', () => {
    const p: Profile = { ...fresh(), owned: ['purse-1', 'purse-2', 'bounty-hunter', 'deeper-inkwell'], satchel: ['lens', 'quill'] };
    const setup = setupFor(p, 'copy-desk');
    expect(setup.startGold).toBe(PERKS.purse2Gold);
    expect(setup.startInk).toBe(RUN.startInk + 1);
    expect(setup.bountyBonus).toBe(PERKS.bountyHunter);
    expect(setup.tools).toEqual(['lens', 'quill']);
    const s = newRun('PERKSQ', { setup });
    expect(s.gold).toBe(PERKS.purse2Gold);
    for (const c of s.posted.filter((x) => !x.required)) expect(c.gold).toBeGreaterThan(PERKS.bountyHunter);
  });

  it('reads an old or broken profile as a fresh one', () => {
    expect(migrateProfile(undefined)).toEqual(NEW_PROFILE);
    expect(migrateProfile({ v: 1, leaf: 7 }).leaf).toBe(7);
    // Retired tools drop out of a saved satchel; an empty one falls back to the base tools.
    expect(migrateProfile({ v: 1, satchel: ['redraw', 'quill', 'blotter'] }).satchel).toEqual(['quill']);
    expect(migrateProfile({ v: 1, satchel: ['redraw', 'blotter'] }).satchel).toEqual(BASE_TOOLS);
    expect(say({ kind: 'corners-min', min: 14 }, pageOf('ANYPGE'))).toBe('The four corners add to 14 or more');
  });
});
