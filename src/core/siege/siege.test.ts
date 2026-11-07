import { describe, expect, it } from 'vitest';
import { BASIC, DEFENDERS, PESTS, SIEGE, WAVES } from '../../content/siege';
import { ENTRY, EXIT, H, W, cellAt, walkOf } from './field';
import { actSiege, buildBlocker, newSiege, refundOf, startWave, walkNow, type SiegeState } from './run';
import { biteOf, layersOf, newWaveSim, runWave, toughness } from './sim';

const act = (s: SiegeState, a: Parameters<typeof actSiege>[1]) => { const r = actSiege(s, a); expect(r.reason ?? null).toBe(null); return r.state; };

describe('the field', () => {
  it('walks straight down when nothing is planted, from the gap to the bed', () => {
    const walk = walkOf(new Set())!;
    expect(walk[0]).toBe(ENTRY);
    expect(walk[walk.length - 1]).toBe(EXIT);
    expect(walk).toHaveLength(H + Math.abs(SIEGE.exitCol - SIEGE.entryCol));
  });

  it('walks around hedges, and refuses a hedge that would close the way', () => {
    let s = { ...newSiege('FIELD'), coins: 999 };
    // A wall across row 5, all but the last square.
    for (let k = 0; k < W - 1; k++) s = act(s, { type: 'build', kind: 'hedge', cell: cellAt(5, k) });
    const walk = walkNow(s);
    expect(walk).toContain(cellAt(5, W - 1));
    expect(walk.length).toBeGreaterThan(H + 4);
    expect(buildBlocker(s, 'hedge', cellAt(5, W - 1))).toMatch(/close the way/);
    expect(buildBlocker(s, 'frog', ENTRY)).toMatch(/gap/);
    expect(buildBlocker(s, 'frog', EXIT)).toMatch(/bed/);
  });
});

describe('a wave', () => {
  const walk = walkOf(new Set())!;

  it('leaves each layer behind: a snail stopped leaves a slug', () => {
    expect(layersOf('snail')).toBe(2);
    expect(layersOf('aphids')).toBe(4);
    expect(biteOf('snail')).toBe(2);
    expect(biteOf('greatSnail')).toBe((PESTS.greatSnail.bite ?? 1) + 4 * 2);
    const w = newWaveSim(1, walk, [1, 2, 3, 4, 5, 6].map((r, i) => ({ id: i + 1, kind: 'frog' as const, level: 2, cell: cellAt(r, SIEGE.entryCol + 1) })));
    w.queue = [{ tick: 0, kind: 'snail' }];
    runWave(w);
    expect(w.stopped).toBe(2);
    expect(w.leaked).toBe(0);
    expect(w.earned).toBe(PESTS.snail.bounty + PESTS.slug.bounty);
  });

  it('lets moths fly over frogs, and thrushes reach them', () => {
    const frogs = newWaveSim(1, walk, [{ id: 1, kind: 'frog', level: 2, cell: cellAt(5, SIEGE.entryCol + 1) }]);
    frogs.queue = [{ tick: 0, kind: 'moth' }];
    runWave(frogs);
    expect(frogs.leaked).toBe(1);
    const thrushes = newWaveSim(1, walk, [3, 6, 9].map((r, i) => ({ id: i + 1, kind: 'thrush' as const, level: 2, cell: cellAt(r, SIEGE.entryCol + 1) })));
    thrushes.queue = [{ tick: 0, kind: 'moth' }];
    runWave(thrushes);
    expect(thrushes.stopped).toBe(1);
  });

  it('takes armour off frogs\' bites, but not hedgehogs\'', () => {
    expect(DEFENDERS.frog.levels[0].damage).toBeLessThanOrEqual(PESTS.beetle.armour);
    const frogs = newWaveSim(1, walk, [{ id: 1, kind: 'frog', level: 0, cell: cellAt(5, SIEGE.entryCol + 1) }]);
    frogs.queue = [{ tick: 0, kind: 'beetle' }];
    runWave(frogs);
    expect(frogs.leaked).toBe(1);
    expect(frogs.eaten).toBe(biteOf('beetle'));
    const hogs = newWaveSim(1, walk, [2, 4, 6, 8].flatMap((r, i) => [{ id: 2 * i + 1, kind: 'hedgehog' as const, level: 2, cell: cellAt(r, SIEGE.entryCol + 1) }, { id: 2 * i + 2, kind: 'hedgehog' as const, level: 2, cell: cellAt(r, SIEGE.entryCol - 1) }]));
    hogs.queue = [{ tick: 0, kind: 'beetle' }];
    runWave(hogs);
    expect(hogs.stopped).toBe(1);
  });

  it('grows tougher wave by wave, and plays out the same every time', () => {
    for (let w = 2; w <= WAVES.length; w++) expect(toughness(w)).toBeGreaterThan(toughness(w - 1));
    const s = act({ ...newSiege('SAME'), coins: 60 }, { type: 'build', kind: 'frog', cell: cellAt(3, 4) });
    const a = runWave(startWave(s)), b = runWave(startWave(s));
    expect([a.stopped, a.leaked, a.eaten, a.earned, a.tick]).toEqual([b.stopped, b.leaked, b.eaten, b.earned, b.tick]);
  });
});

describe('a season', () => {
  it('builds, upgrades and sells for coins', () => {
    let s = newSiege('COINS');
    s = act(s, { type: 'build', kind: 'frog', cell: cellAt(3, 4) });
    expect(s.coins).toBe(SIEGE.startCoins - DEFENDERS.frog.levels[0].cost);
    s = act(s, { type: 'upgrade', id: 1 });
    expect(s.placed[0]!.level).toBe(1);
    const spent = DEFENDERS.frog.levels[0].cost + DEFENDERS.frog.levels[1].cost;
    expect(s.placed[0]!.spent).toBe(spent);
    const before = s.coins;
    s = act(s, { type: 'sell', id: 1 });
    expect(s.coins).toBe(before + refundOf({ spent }));
    expect(actSiege(s, { type: 'build', kind: 'toad', cell: cellAt(3, 4) }).reason).toMatch(/hybrid/);
  });

  it('pays a bonus and interest after each wave, offers hybrids, and ends', () => {
    let s = newSiege('SEASON');
    // A strong garden from the start: rows of hedgehogs and thrushes beside the straight way down.
    s = { ...s, coins: 2000 };
    for (let r = 1; r < H - 1; r++) {
      s = act(s, { type: 'build', kind: r % 2 ? 'hedgehog' : 'thrush', cell: cellAt(r, SIEGE.entryCol - 1) });
      s = act(s, { type: 'build', kind: r % 3 ? 'marigold' : 'hedgehog', cell: cellAt(r, SIEGE.entryCol + 1) });
    }
    for (const p of s.placed) { s = act(s, { type: 'upgrade', id: p.id }); s = act(s, { type: 'upgrade', id: p.id }); }
    const coins = s.coins;
    const r = actSiege(s, { type: 'wave' });
    expect(r.record!.bonus).toBe(SIEGE.waveBonus + SIEGE.perWave);
    expect(r.record!.interest).toBe(Math.min(SIEGE.interestCap, Math.floor(coins * SIEGE.interest)));
    expect(r.state.coins).toBe(coins + r.record!.earned + r.record!.bonus + r.record!.interest);
    s = r.state;
    while (s.phase === 'build' || s.phase === 'pick') {
      if (s.phase === 'pick') {
        expect(s.offer).toHaveLength(2);
        expect(actSiege(s, { type: 'wave' }).ok).toBe(false);
        s = act(s, { type: 'pick', kind: s.offer[0]! });
        continue;
      }
      s = act(s, { type: 'wave' });
    }
    expect(s.unlocked).toHaveLength(SIEGE.hybridAfter.length);
    expect(s.records).toHaveLength(s.phase === 'won' ? WAVES.length : s.records.length);
    expect(actSiege(s, { type: 'wave' }).ok).toBe(false);
  });

  it('is lost when the seedlings are eaten', () => {
    let s = newSiege('EMPTY');
    while (s.phase === 'build') s = act(s, { type: 'wave' });
    expect(s.phase).toBe('lost');
    expect(s.seedlings).toBeLessThanOrEqual(0);
    expect(s.records.reduce((n, r) => n + r.eaten, 0)).toBe(SIEGE.seedlings);
  });

  it('only plants the four basic defenders until a hybrid is picked', () => {
    expect(BASIC).toEqual(['frog', 'hedgehog', 'thrush', 'marigold']);
  });
});
