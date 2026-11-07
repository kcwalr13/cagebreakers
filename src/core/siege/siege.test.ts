import { describe, expect, it } from 'vitest';
import { DEFENDERS, ELEMENTS, PESTS, SIEGE, WAVES } from '../../content/siege';
import { ENTRY, EXIT, H, W, cellAt, walkOf } from './field';
import { type SiegeAction, type SiegeState, actSiege, growthsOf, hybridOf, newSiege, plantBlocker, refundOf, startWave, unlockPrice, walkNow } from './run';
import { biteOf, layersOf, newWaveSim, runWave, toughness } from './sim';

const act = (s: SiegeState, a: SiegeAction) => { const r = actSiege(s, a); expect(r.reason ?? null).toBe(null); return r.state; };
const mid = SIEGE.entryCol;

describe('the field', () => {
  it('walks straight down when nothing is planted, from the gap to the bed', () => {
    const walk = walkOf(new Set())!;
    expect(walk[0]).toBe(ENTRY);
    expect(walk[walk.length - 1]).toBe(EXIT);
    expect(walk).toHaveLength(H + Math.abs(SIEGE.exitCol - SIEGE.entryCol));
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
  const walk = walkOf(new Set())!;
  const beside = (kind: Parameters<typeof newWaveSim>[2][number]['kind'], level: number, rows: number[], col = mid + 1) =>
    rows.map((r, i) => ({ id: i + 1, kind, level, cell: cellAt(r, col) }));

  it('leaves each layer behind: a snail stopped leaves a slug', () => {
    expect(layersOf('snail')).toBe(2);
    expect(layersOf('aphids')).toBe(4);
    expect(biteOf('snail')).toBe(2);
    expect(biteOf('greatSnail')).toBe((PESTS.greatSnail.bite ?? 1) + 4 * 2);
    const w = newWaveSim(1, walk, beside('frog', 2, [1, 2, 3, 4, 5, 6]));
    w.queue = [{ tick: 0, kind: 'snail' }];
    runWave(w);
    expect(w.stopped).toBe(2);
    expect(w.leaked).toBe(0);
    expect(w.earned).toBe(PESTS.snail.bounty + PESTS.slug.bounty);
  });

  it('scratches slugs with brambles, but not armoured beetles or moths', () => {
    const rows = Array.from({ length: H - 2 }, (_, i) => i + 1);
    const lane = [...beside('bramble', 0, rows, mid - 1), ...beside('bramble', 0, rows, mid + 1).map((t) => ({ ...t, id: t.id + 100 }))];
    const slug = newWaveSim(1, walk, lane);
    slug.queue = [{ tick: 0, kind: 'slug' }];
    runWave(slug);
    expect(slug.stopped).toBe(1);
    for (const kind of ['beetle', 'moth'] as const) {
      const w = newWaveSim(1, walk, lane);
      w.queue = [{ tick: 0, kind }];
      runWave(w);
      expect(w.leaked).toBe(1);
    }
  });

  it('lets moths fly over frogs, and thrushes reach them', () => {
    const frogs = newWaveSim(1, walk, beside('frog', 2, [5]));
    frogs.queue = [{ tick: 0, kind: 'moth' }];
    runWave(frogs);
    expect(frogs.leaked).toBe(1);
    const thrushes = newWaveSim(1, walk, beside('thrush', 2, [3, 6, 9]));
    thrushes.queue = [{ tick: 0, kind: 'moth' }];
    runWave(thrushes);
    expect(thrushes.stopped).toBe(1);
  });

  it('takes armour off frogs\' bites, but not hedgehogs\'', () => {
    expect(DEFENDERS.frog.levels[0]!.damage).toBeLessThanOrEqual(PESTS.beetle.armour);
    const frogs = newWaveSim(1, walk, beside('frog', 0, [5]));
    frogs.queue = [{ tick: 0, kind: 'beetle' }];
    runWave(frogs);
    expect(frogs.leaked).toBe(1);
    expect(frogs.eaten).toBe(biteOf('beetle'));
    const hogs = newWaveSim(1, walk, [...beside('hedgehog', 2, [2, 4, 6, 8]), ...beside('hedgehog', 2, [2, 4, 6, 8], mid - 1).map((t) => ({ ...t, id: t.id + 10 }))]);
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
    expect(r.record!.interest).toBe(Math.min(SIEGE.interestCap, Math.floor(coins * SIEGE.interest)));
    expect(r.state.coins).toBe(coins + r.record!.earned + r.record!.bonus + r.record!.interest);
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
