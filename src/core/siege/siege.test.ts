import { describe, expect, it } from 'vitest';
import { DEFENDERS, ELEMENTS, PESTS, SHED, SHED_EFFECT, SIEGE, WAVES } from '../../content/siege';
import { MAPS } from '../../content/siege-maps';
import { distances, fieldOf, groundRoute, walkOf, walksOf } from './field';
import { type SiegeAction, type SiegeState, actSiege, growthsOf, honeyOf, hybridOf, improvePrice, interestOn, migrateSiege, newSiege, plantBlocker, refundOf, startWave, unlockPrice, walksNow } from './run';
import { biteOf, isUnder, layersOf, newWaveSim, runWave, stepWave, toughness } from './sim';

const act = (s: SiegeState, a: SiegeAction) => { const r = actSiege(s, a); expect(r.reason ?? null).toBe(null); return r.state; };
// The Kitchen Garden: an open lawn.
const kitchen = fieldOf('kitchen');
const W = kitchen.w, H = kitchen.h, ENTRY = kitchen.entries[0]!, EXIT = kitchen.exits[0]!;
const cellAt = kitchen.cellAt;
const mid = kitchen.colOf(ENTRY);
const walkNow = (s: SiegeState) => walksNow(s)[0]!;

describe('the field', () => {
  it('walks straight down when nothing is planted, from the gap to the bed', () => {
    const walk = walkOf(kitchen, new Set())!;
    expect(walk[0]).toBe(ENTRY);
    expect(walk[walk.length - 1]).toBe(EXIT);
    expect(walk).toHaveLength(H + Math.abs(kitchen.colOf(EXIT) - mid));
  });

  it('walks around brambles, and refuses one that would close the way', () => {
    let s = { ...newSiege('FIELDS'), coins: 999 };
    // A wall across row 5, all but the last square.
    for (let k = 0; k < W - 1; k++) s = act(s, { type: 'plant', cell: cellAt(5, k) });
    const walk = walkNow(s);
    expect(walk).toContain(cellAt(5, W - 1));
    expect(walk.length).toBeGreaterThan(H + 4);
    expect(plantBlocker(s, cellAt(5, W - 1))).toMatch(/close the way/);
    expect(plantBlocker(s, ENTRY)).toMatch(/gap/);
    expect(plantBlocker(s, EXIT)).toMatch(/bed/);
  });
});

describe('a wave', () => {
  const walk = walkOf(kitchen, new Set())!;
  const beside = (kind: Parameters<typeof newWaveSim>[3][number]['kind'], level: number, rows: number[], col = mid + 1) =>
    rows.map((r, i) => ({ id: i + 1, kind, level, cell: cellAt(r, col) }));
  const sim = (towers: Parameters<typeof newWaveSim>[3], wave = 1) => newWaveSim(kitchen, wave, [walk], towers);

  it('leaves each layer behind: a snail stopped leaves a slug', () => {
    expect(layersOf('snail')).toBe(2);
    expect(layersOf('aphids')).toBe(4);
    expect(biteOf('snail')).toBe(2);
    expect(biteOf('greatSnail')).toBe((PESTS.greatSnail.bite ?? 1) + 4 * 2);
    const w = sim(beside('frog', 2, [1, 2, 3, 4, 5, 6]));
    w.queue = [{ tick: 0, kind: 'snail' }];
    runWave(w);
    expect(w.stopped).toBe(2);
    expect(w.leaked).toBe(0);
    expect(w.earned).toBe(PESTS.snail.bounty + PESTS.slug.bounty);
  });

  it('scratches slugs with brambles, but not armoured beetles or moths', () => {
    const rows = Array.from({ length: H - 2 }, (_, i) => i + 1);
    const lane = [...beside('bramble', 0, rows, mid - 1), ...beside('bramble', 0, rows, mid + 1).map((t) => ({ ...t, id: t.id + 100 }))];
    const slug = sim(lane);
    slug.queue = [{ tick: 0, kind: 'slug' }];
    runWave(slug);
    expect(slug.stopped).toBe(1);
    for (const kind of ['beetle', 'moth'] as const) {
      const w = sim(lane);
      w.queue = [{ tick: 0, kind }];
      runWave(w);
      expect(w.leaked).toBe(1);
    }
  });

  it('lets moths fly over frogs, and thrushes reach them', () => {
    const frogs = sim(beside('frog', 2, [5]));
    frogs.queue = [{ tick: 0, kind: 'moth' }];
    runWave(frogs);
    expect(frogs.leaked).toBe(1);
    const thrushes = sim(beside('thrush', 2, [3, 6, 9]));
    thrushes.queue = [{ tick: 0, kind: 'moth' }];
    runWave(thrushes);
    expect(thrushes.stopped).toBe(1);
  });

  it('takes armour off frogs\' bites, but not hedgehogs\'', () => {
    expect(DEFENDERS.frog.levels[0]!.damage).toBeLessThanOrEqual(PESTS.beetle.armour);
    const frogs = sim(beside('frog', 0, [5]));
    frogs.queue = [{ tick: 0, kind: 'beetle' }];
    runWave(frogs);
    expect(frogs.leaked).toBe(1);
    expect(frogs.eaten).toBe(biteOf('beetle'));
    const hogs = sim([...beside('hedgehog', 2, [2, 4, 6, 8]), ...beside('hedgehog', 2, [2, 4, 6, 8], mid - 1).map((t) => ({ ...t, id: t.id + 10 }))]);
    hogs.queue = [{ tick: 0, kind: 'beetle' }];
    runWave(hogs);
    expect(hogs.stopped).toBe(1);
  });

  it('grows tougher wave by wave, and plays out the same every time', () => {
    expect(SIEGE.toughness).toHaveLength(WAVES.length);
    for (let w = 2; w <= WAVES.length; w++) expect(toughness(w)).toBeGreaterThan(toughness(w - 1));
    let s = act(newSiege('SAMESS'), { type: 'unlock', element: 'water' });
    s = act(s, { type: 'plant', cell: cellAt(3, mid + 1) });
    s = act(s, { type: 'grow', id: 1, into: 'frog' });
    const a = runWave(startWave(s)), b = runWave(startWave(s));
    expect([a.stopped, a.leaked, a.eaten, a.earned, a.tick]).toEqual([b.stopped, b.leaked, b.eaten, b.earned, b.tick]);
  });
});

describe('the tech tree', () => {
  it('unlocks elements, the first free and each one dearer', () => {
    let s = { ...newSiege('TREESS'), coins: 500 };
    expect(unlockPrice(s)).toBe(0);
    s = act(s, { type: 'unlock', element: 'earth' });
    expect(s.coins).toBe(500);
    for (const [i, e] of (['water', 'air', 'sun'] as const).entries()) {
      const before = s.coins;
      s = act(s, { type: 'unlock', element: e });
      expect(before - s.coins).toBe(SIEGE.elementPrices[i + 1]);
    }
    expect(unlockPrice(s)).toBe(null);
    expect(actSiege(s, { type: 'unlock', element: 'sun' }).reason).toMatch(/Already/);
  });

  it('grows brambles into unlocked elements\' defenders, and defenders at their best into hybrids', () => {
    let s = { ...newSiege('GROWSS'), coins: 500 };
    s = act(s, { type: 'plant', cell: cellAt(4, 2) });
    expect(actSiege(s, { type: 'grow', id: 1, into: 'frog' }).reason).toMatch(/Unlock water/);
    expect(actSiege(s, { type: 'upgrade', id: 1 }).reason).toMatch(/Grow it/);
    s = act(s, { type: 'unlock', element: 'water' });
    s = act(s, { type: 'grow', id: 1, into: 'frog' });
    expect(s.placed[0]).toMatchObject({ kind: 'frog', level: 0, spent: DEFENDERS.bramble.levels[0]!.cost + DEFENDERS.frog.levels[0]!.cost });
    // Not yet at its best: no hybrid.
    expect(growthsOf(s, s.placed[0]!)).toEqual([]);
    expect(actSiege(s, { type: 'grow', id: 1, into: 'toad' }).reason).toMatch(/best first/);
    s = act(act(s, { type: 'upgrade', id: 1 }), { type: 'upgrade', id: 1 });
    expect(growthsOf(s, s.placed[0]!).map((g) => [g.into, g.open])).toEqual([['toad', false], ['dragonfly', false], ['salamander', false]]);
    expect(growthsOf(s, { kind: 'bramble', level: 0 }).map((g) => g.into)).toEqual(['frog', 'hedgehog', 'thrush', 'marigold', 'hive']);
    expect(actSiege(s, { type: 'grow', id: 1, into: 'toad' }).reason).toMatch(/Unlock earth/);
    s = act(s, { type: 'unlock', element: 'earth' });
    s = act(s, { type: 'grow', id: 1, into: 'toad' });
    expect(s.placed[0]).toMatchObject({ kind: 'toad', level: 0 });
    // Selling gives back most of everything spent on the square.
    const before = s.coins;
    s = act(s, { type: 'sell', id: 1 });
    const spent = DEFENDERS.bramble.levels[0]!.cost + DEFENDERS.frog.levels.reduce((n, l) => n + l.cost, 0) + DEFENDERS.toad.levels[0]!.cost;
    expect(s.coins - before).toBe(refundOf({ spent }));
  });

  it('has a hybrid for every pair of elements, made of those two', () => {
    const pairs = new Set<string>();
    for (const a of Object.keys(ELEMENTS) as (keyof typeof ELEMENTS)[]) {
      for (const b of Object.keys(ELEMENTS) as (keyof typeof ELEMENTS)[]) {
        if (a === b) continue;
        const h = hybridOf(a, b)!;
        expect(DEFENDERS[h].tier).toBe(2);
        expect([...DEFENDERS[h].elements].sort()).toEqual([a, b].sort());
        pairs.add(h);
      }
    }
    expect(pairs.size).toBe(6);
  });
});

describe('a season', () => {
  it('pays a bonus and interest after each wave, and ends', () => {
    let s = { ...newSiege('SEASON'), coins: 5000 };
    for (const e of ['earth', 'air', 'sun', 'water'] as const) s = act(s, { type: 'unlock', element: e });
    // A strong garden: hedgehogs and thrushes beside the straight way down, all at their best.
    for (let r = 1; r < H - 1; r++) for (const col of [mid - 1, mid + 1]) s = act(s, { type: 'plant', cell: cellAt(r, col) });
    for (const p of s.placed.slice()) {
      s = act(s, { type: 'grow', id: p.id, into: p.id % 2 ? 'hedgehog' : 'thrush' });
      s = act(act(s, { type: 'upgrade', id: p.id }), { type: 'upgrade', id: p.id });
    }
    const coins = s.coins;
    const r = actSiege(s, { type: 'wave' });
    expect(r.record!.bonus).toBe(SIEGE.waveBonus + SIEGE.perWave);
    expect(r.record!.interest).toBe(Math.min(SHED_EFFECT.interestCap[0]!, Math.floor(coins * SHED_EFFECT.interest[0]!)));
    expect(r.state.coins).toBe(coins + r.record!.earned + r.record!.bonus + r.record!.interest + r.record!.honey);
    s = r.state;
    while (s.phase === 'build') s = act(s, { type: 'wave' });
    expect(s.records.length).toBeGreaterThan(5);
    expect(actSiege(s, { type: 'wave' }).ok).toBe(false);
  });

  it('is lost when the seedlings are eaten', () => {
    let s = newSiege('EMPTYS');
    while (s.phase === 'build') s = act(s, { type: 'wave' });
    expect(s.phase).toBe('lost');
    expect(s.seedlings).toBeLessThanOrEqual(0);
    expect(s.records.reduce((n, r) => n + r.eaten, 0)).toBe(SIEGE.seedlings);
  });
});

describe('the gardens', () => {
  it('are drawn evenly, with gaps on top, gates below, paired rabbit holes, and a way through', () => {
    const ids = new Set<string>();
    for (const m of MAPS) {
      expect(ids.has(m.id)).toBe(false);
      ids.add(m.id);
      const f = fieldOf(m);
      expect(m.rows.every((row) => row.length === f.w)).toBe(true);
      expect(m.rows.join('')).toMatch(/^[.#~,+12v^]*$/);
      expect(f.entries.length).toBeGreaterThan(0);
      expect(f.exits.length).toBeGreaterThan(0);
      expect(m.rows.slice(1).join('')).not.toContain('v');
      expect(m.rows.slice(0, -1).join('')).not.toContain('^');
      for (const d of ['1', '2']) expect([0, 2]).toContain([...m.rows.join('')].filter((ch) => ch === d).length);
      expect(walksOf(f, new Set())).not.toBe(null);
      // Neighbours go both ways, and are a tile width apart.
      for (let c = 0; c < f.cells; c++) {
        for (const n of f.nbrs[c]!) {
          expect(f.nbrs[n]).toContain(c);
          expect(Math.hypot(f.mids[n]!.x - f.mids[c]!.x, f.mids[n]!.y - f.mids[c]!.y)).toBeCloseTo(1, 5);
        }
      }
    }
  });

  it('give hexagons six neighbours in the middle, squares four', () => {
    const hex = fieldOf('meadow');
    expect(hex.nbrs[hex.cellAt(4, 4)]).toHaveLength(6);
    expect(hex.nbrs[hex.cellAt(5, 4)]).toHaveLength(6);
    expect(kitchen.nbrs[kitchen.cellAt(4, 4)]).toHaveLength(4);
    // A whole row of brambles across the hexes, save one end, turns the way to that end.
    let s = { ...newSiege('HEXESS', 'HEXESS', 'meadow'), coins: 999 };
    for (let k = 0; k < hex.w - 1; k++) s = act(s, { type: 'plant', cell: hex.cellAt(6, k) });
    expect(walksNow(s)[0]).toContain(hex.cellAt(6, hex.w - 1));
    expect(plantBlocker(s, hex.cellAt(6, hex.w - 1))).toMatch(/close the way/);
  });

  it('refuse planting on rock, pond, mud and rabbit holes', () => {
    const at = (map: string, ch: string) => { const m = MAPS.find((x) => x.id === map)!; return m.rows.join('').indexOf(ch); };
    const s = (map: string) => ({ ...newSiege('TERRAN', 'TERRAN', map), coins: 99 });
    expect(plantBlocker(s('rockery'), at('rockery', '#'))).toMatch(/^Rock/);
    expect(plantBlocker(s('water'), at('water', '~'))).toMatch(/pond/);
    expect(plantBlocker(s('water'), at('water', ','))).toMatch(/^Mud/);
    expect(plantBlocker(s('warren'), at('warren', '1'))).toMatch(/rabbit hole/);
    expect(plantBlocker(s('rockery'), at('rockery', '+'))).toBe(null);
  });

  it('drop pests that step on a rabbit hole out of its partner, once, out of reach underground', () => {
    const f = fieldOf('warren');
    // On an open lawn the way misses every hole.
    expect(walkOf(f, new Set())!.some((c) => f.terrain[c] === 'hole')).toBe(false);
    // A wall across row 12 with its gap over a low hole: pests drop in, come up near the top, and walk down again.
    const low = f.cellAt(13, 2), high = f.holeTo[low]!;
    expect(f.rowOf(high)).toBe(2);
    const wall = new Set(Array.from({ length: f.w }, (_, k) => f.cellAt(12, k)).filter((c) => c !== f.cellAt(12, 2)));
    const walk = walkOf(f, wall)!;
    const at = walk.indexOf(low);
    expect(walk[at + 1]).toBe(high);
    expect(walk.filter((c) => c === low)).toHaveLength(2);
    expect(walk.length).toBeGreaterThan(distances(f, wall)[f.entries[0]!]! * 1.8);
    const route = groundRoute(f, walk);
    expect(route.under.filter(Boolean)).toHaveLength(1);
    // Step a slug along: for a while it is underground, out of reach.
    const w = newWaveSim(f, 1, [walk], []);
    w.queue = [{ tick: 0, kind: 'slug' }];
    let under = 0;
    while (!w.done) { stepWave(w); if (w.mobs[0] && isUnder(w, w.mobs[0])) under++; }
    expect(under).toBeGreaterThan(0);
    expect(w.leaked).toBe(1);
  });

  it('slow pests in mud, reach further from rich soil, and strike harder for water on a pond bank', () => {
    const f = fieldOf('water');
    // Mud: a slug crossing mud takes longer than the same route on lawn would.
    const walk = walkOf(f, new Set())!;
    expect(walk.some((c) => f.terrain[c] === 'mud')).toBe(true);
    const slow = newWaveSim(f, 1, [walk], []);
    slow.queue = [{ tick: 0, kind: 'slug' }];
    runWave(slow);
    const len = groundRoute(f, walk).len;
    expect(slow.tick).toBeGreaterThan(Math.ceil(len / PESTS.slug.speed / SIEGE.tick) + 2);
    // Rich soil and the pond bank.
    const rich = f.terrain.indexOf('rich');
    const bank = rich; // the Water Garden's rich soil sits on the ponds' banks
    const w = newWaveSim(f, 1, [walk], [{ id: 1, kind: 'frog', level: 0, cell: bank }, { id: 2, kind: 'hedgehog', level: 0, cell: bank }]);
    expect(w.towers[0]!.range).toBeCloseTo(DEFENDERS.frog.levels[0]!.range + SIEGE.richReach);
    expect(w.towers[0]!.boost).toBe(SIEGE.pondBoost);
    expect(w.towers[1]!.boost).toBe(1);
  });

  it('send pests in by both gaps in turn, and refuse closing either', () => {
    const f = fieldOf('twogates');
    expect(f.entries).toHaveLength(2);
    let s = newSiege('GATESS', 'GATESS', 'twogates');
    const w = runWave(startWave(s));
    expect(w.stopped + w.leaked).toBeGreaterThan(0);
    const sim = startWave(s);
    for (let i = 0; i < 200; i++) stepWave(sim);
    expect(new Set(sim.mobs.map((m) => m.entry)).size).toBe(2);
    // Wall off the left gap's corner: the last bramble that would shut it in is refused.
    s = { ...s, coins: 99 };
    const left = f.colOf(f.entries[0]!);
    for (const c of [f.cellAt(0, left - 1), f.cellAt(0, left + 1), f.cellAt(1, left - 1), f.cellAt(1, left + 1)]) s = act(s, { type: 'plant', cell: c });
    expect(plantBlocker(s, f.cellAt(1, left))).toMatch(/close a way/);
  });

  it('reads seasons saved before gardens as the Kitchen Garden', () => {
    const v2 = { ...newSiege('OLDOLD'), v: 2 } as Record<string, unknown>;
    delete v2.map;
    expect(migrateSiege(v2)).toMatchObject({ v: 3, map: 'kitchen' });
    expect(migrateSiege({ v: 1, placed: [] })).toBe(null);
    expect(distances(kitchen, new Set())[ENTRY]).toBe(H - 1);
  });
});

describe('the economy', () => {
  it('pays honey from beehives after each wave, more for each upgrade, and hives never strike', () => {
    let s = { ...newSiege('HONEYS'), coins: 200 };
    s = act(s, { type: 'plant', cell: kitchen.cellAt(4, 2) });
    s = act(s, { type: 'grow', id: 1, into: 'hive' });
    expect(honeyOf(s)).toBe(DEFENDERS.hive.levels[0]!.honey);
    s = act(act(s, { type: 'upgrade', id: 1 }), { type: 'upgrade', id: 1 });
    expect(honeyOf(s)).toBe(DEFENDERS.hive.levels[2]!.honey);
    expect(growthsOf(s, s.placed[0]!)).toEqual([]);
    expect(startWave(s).towers).toHaveLength(0);
    const before = s.coins;
    const r = actSiege(s, { type: 'wave' });
    expect(r.record!.honey).toBe(DEFENDERS.hive.levels[2]!.honey);
    expect(r.state.coins).toBe(before + r.record!.earned + r.record!.bonus + r.record!.interest + r.record!.honey);
  });

  it('sells the Shed\'s improvements rank by rank, and each one does what it says', () => {
    let s = { ...newSiege('SHEDSS'), coins: 1000 };
    expect(interestOn({ ...s, coins: 50 })).toBe(Math.floor(50 * SHED_EFFECT.interest[0]!));
    expect(interestOn({ ...s, coins: 900 })).toBe(SHED_EFFECT.interestCap[0]);
    for (let rank = 0; rank < SHED.compost.costs.length; rank++) {
      const before = s.coins;
      s = act(s, { type: 'improve', item: 'compost' });
      expect(before - s.coins).toBe(SHED.compost.costs[rank]);
    }
    expect(improvePrice(s, 'compost')).toBe(null);
    expect(actSiege(s, { type: 'improve', item: 'compost' }).reason).toMatch(/as good as it gets/);
    expect(interestOn({ ...s, coins: 100 })).toBe(Math.min(SHED_EFFECT.interestCap[3]!, Math.floor(100 * SHED_EFFECT.interest[3]!)));
    // Thorns and the watering can reach into the wave; the cold frame into prices.
    s = act(act(s, { type: 'improve', item: 'thorns' }), { type: 'improve', item: 'can' });
    expect(startWave(s).mods).toEqual({ thorns: SHED_EFFECT.thorns[1], harm: SHED_EFFECT.harm[1] });
    s = act(act(s, { type: 'improve', item: 'frame' }), { type: 'improve', item: 'frame' });
    s = act(s, { type: 'plant', cell: kitchen.cellAt(4, 2) });
    s = act(s, { type: 'unlock', element: 'water' });
    const before = s.coins;
    s = act(s, { type: 'grow', id: s.placed[0]!.id, into: 'frog' });
    expect(before - s.coins).toBe(Math.ceil(DEFENDERS.frog.levels[0]!.cost * (1 - SHED_EFFECT.discount[2]!)));
  });

  it('makes sharper thorns stop a slug that plain brambles only scratch', () => {
    const walk = walkOf(kitchen, new Set())!;
    const lane = [2, 3, 4].map((r, i) => ({ id: i + 1, kind: 'bramble' as const, level: 0, cell: kitchen.cellAt(r, mid + 1) }));
    const plain = newWaveSim(kitchen, 8, [walk], lane, { thorns: SHED_EFFECT.thorns[0]!, harm: 1 });
    plain.queue = [{ tick: 0, kind: 'slug' }];
    runWave(plain);
    const sharp = newWaveSim(kitchen, 8, [walk], lane, { thorns: SHED_EFFECT.thorns[3]!, harm: 1 });
    sharp.queue = [{ tick: 0, kind: 'slug' }];
    runWave(sharp);
    expect(plain.leaked).toBe(1);
    expect(sharp.stopped).toBe(1);
  });
});
