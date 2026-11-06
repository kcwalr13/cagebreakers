import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFENDERS, NIGHTS, PESTS, WATCH } from '../../content/watch';
import { createRng } from '../rng';
import { SEED_ALPHABET } from '../seed';
import { boardOf } from './board';
import {
  type WatchState, actWatch, harmMap, knownAt, markedTrail, newWatch, nightOf, pestsOf, reachOf, readout, walk, watchBoard, watchScore,
} from './run';
import { CLEAR, TRAIL, UNKNOWN, allClues, deduce, drawTrail, makeClues } from './trail';

const seedArb = fc.string({ unit: fc.constantFrom(...SEED_ALPHABET), minLength: 6, maxLength: 6 });
const b = watchBoard();

/** True when the squares are one trail from `entry` to `exit` that never touches itself along an edge. */
function isOneTrail(cells: readonly number[], entry: number, exit: number): boolean {
  const on = new Set(cells);
  if (!on.has(entry) || !on.has(exit)) return false;
  for (const c of cells) {
    const deg = b.orth[c]!.filter((n) => on.has(n)).length;
    if (deg !== (c === entry || c === exit ? 1 : 2)) return false;
  }
  const seen = new Set([entry]), stack = [entry];
  while (stack.length) { const x = stack.pop()!; for (const n of b.orth[x]!) if (on.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); } }
  return seen.size === on.size;
}

describe('the hidden trail', () => {
  it('runs from the top row to the bottom row, never touching itself, within its length', () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const trail = drawTrail(createRng(seed), b, WATCH.trail[0], WATCH.trail[1]);
      expect(b.rowOf(trail[0]!)).toBe(0);
      expect(b.rowOf(trail[trail.length - 1]!)).toBe(b.height - 1);
      expect(trail.length).toBeGreaterThanOrEqual(WATCH.trail[0]);
      expect(trail.length).toBeLessThanOrEqual(WATCH.trail[1]);
      for (let i = 1; i < trail.length; i++) expect(b.orth[trail[i - 1]!]).toContain(trail[i]);
      expect(isOneTrail(trail, trail[0]!, trail[trail.length - 1]!)).toBe(true);
    }), { numRuns: 300 });
  });

  it('every night of a season can be worked out from its clues, and only one trail fits', () => {
    fc.assert(fc.property(seedArb, fc.integer({ min: 1, max: WATCH.nights }), (seed, night) => {
      const { trail, clues } = nightOf(seed, night);
      const shape = NIGHTS[night - 1]!.clues;
      const d = deduce(b, clues, shape.depth);
      expect(d.solved).toBe(true);
      expect(b.all.filter((c) => d.marks[c] === TRAIL).sort((p, q) => p - q)).toEqual(trail.slice().sort((p, q) => p - q));
      // Clues tell the truth: tallies count trail squares, dew never sits on the trail.
      const full = allClues(b, trail);
      clues.rows.forEach((x, r) => { if (x !== null) expect(x).toBe(full.rows[r]); });
      clues.cols.forEach((x, k) => { if (x !== null) expect(x).toBe(full.cols[k]); });
      for (const dw of clues.dew) {
        expect(trail).not.toContain(dw.cell);
        expect(dw.n).toBe(b.around[dw.cell]!.filter((c) => trail.includes(c)).length);
      }
      for (const g of clues.glints) expect(trail).toContain(g);
    }), { numRuns: 120 });
  });

  it('reasons like a player: a full tally clears the rest of its row, and dead ends are clear', () => {
    const small = boardOf(3, 3);
    // A trail straight down the middle column.
    const trail = [1, 4, 7];
    const clues = { ...allClues(small, trail), dew: [] };
    const d = deduce(small, clues, 0);
    expect(d.solved).toBe(true);
    expect(d.marks).toEqual([CLEAR, TRAIL, CLEAR, CLEAR, TRAIL, CLEAR, CLEAR, TRAIL, CLEAR]);
  });

  it('notices when the marks admit no trail', () => {
    const { clues } = nightOf('STUCKA', 1);
    const marks = new Array(b.cells).fill(UNKNOWN);
    // Mark every square beside the gap clear: the trail can't leave it.
    for (const n of b.orth[clues.entry]!) marks[n] = CLEAR;
    expect(deduce(b, clues, 0, marks).stuck).toBe(true);
  });

  it('makes the same night from the same seed', () => {
    expect(nightOf('SAMEWT', 3)).toEqual(nightOf('SAMEWT', 3));
    expect(nightOf('SAMEWT', 3)).not.toEqual(nightOf('SAMEWT', 4));
    const t = drawTrail(createRng('x'), b, 11, 17);
    expect(makeClues(createRng('y'), b, t, NIGHTS[2]!.clues)).toEqual(makeClues(createRng('y'), b, t, NIGHTS[2]!.clues));
  });
});

describe('defenders and pests', () => {
  it('reach the squares their kind says', () => {
    const mid = b.cellAt(4, 3);
    expect(reachOf(b, 'frog', mid)).toHaveLength(8);
    expect(reachOf(b, 'hedgehog', mid).sort((p, q) => p - q)).toEqual([b.cellAt(3, 3), b.cellAt(4, 2), b.cellAt(4, 4), b.cellAt(5, 3)].sort((p, q) => p - q));
    expect(reachOf(b, 'thrush', mid)).toHaveLength(8);
    expect(reachOf(b, 'thrush', b.cellAt(0, 0))).toHaveLength(4);
  });

  it('harm a pest on every square of their reach it crosses, and stop it once harm reaches its strength', () => {
    const trail = [b.cellAt(0, 1), b.cellAt(1, 1), b.cellAt(2, 1), b.cellAt(3, 1)];
    // A hedgehog beside one trail square (2 harm), a frog touching three (1 each).
    const defenders = [{ kind: 'hedgehog' as const, cell: b.cellAt(1, 2) }, { kind: 'frog' as const, cell: b.cellAt(2, 0) }];
    const map = harmMap(b, defenders);
    expect(map[b.cellAt(1, 1)]).toBe(2 + 1);
    const slug = walk(b, defenders, trail, 'slug');
    expect(slug.harm).toEqual([0, 3, 4, 5]);
    expect(slug.stoppedAt).toBeNull();
    // A thrush below the trail's end adds its harm on the last two squares, and the slug is stopped there.
    const more = [...defenders, { kind: 'thrush' as const, cell: b.cellAt(4, 1) }];
    expect(walk(b, more, trail, 'slug').harm).toEqual([0, 3, 5, 7]);
    expect(walk(b, more, trail, 'slug').stoppedAt).toBe(3);
    expect(walk(b, more, trail, 'snail').stoppedAt).toBeNull();
  });
});

function plan(s: WatchState): WatchState {
  // Mark the true trail, move every defender to the free square where it reaches the most trail,
  // then buy frogs for the best squares left until the readout says every pest is stopped.
  for (const c of s.current.trail) if (knownAt(s, c) === null) s = actWatch(s, { type: 'mark', cell: c, mark: TRAIL }).state;
  const on = new Set(s.current.trail);
  const covers = (kind: Parameters<typeof reachOf>[1], c: number) => reachOf(b, kind, c).filter((x) => on.has(x)).length;
  const bestFree = (kind: Parameters<typeof reachOf>[1], ignore = -1) => b.all
    .filter((c) => !on.has(c) && !s.defenders.some((d) => d.cell === c && d.id !== ignore))
    .reduce((p, q) => (covers(kind, q) > covers(kind, p) ? q : p));
  for (const d of s.defenders.slice()) s = actWatch(s, { type: 'move', id: d.id, cell: bestFree(d.kind, d.id) }).state;
  while (!readout(s).every((r) => r.harm >= r.hp)) {
    const r = actWatch(s, { type: 'plant', kind: 'frog', cell: bestFree('frog') });
    if (!r.ok) break;
    s = r.state;
  }
  return s;
}

describe('a season', () => {
  it('starts with seedlings, coins and the first night under mist', () => {
    const s = newWatch('STARTW');
    expect(s.seedlings).toBe(WATCH.seedlings);
    expect(s.coins).toBe(WATCH.startCoins);
    expect(s.night).toBe(1);
    expect(markedTrail(s).sort((p, q) => p - q)).toEqual([s.current.clues.entry, s.current.clues.exit, ...s.current.clues.glints].sort((p, q) => p - q));
  });

  it('refuses what the garden can\'t take, with a reason', () => {
    let s = newWatch('REFUSE');
    const { clues } = s.current;
    expect(actWatch(s, { type: 'plant', kind: 'frog', cell: clues.entry }).ok).toBe(false);
    expect(actWatch(s, { type: 'mark', cell: clues.exit, mark: CLEAR }).reason).toBe('That square is already known');
    const spot = b.all.find((c) => knownAt(s, c) === null)!;
    s = actWatch(s, { type: 'plant', kind: 'hedgehog', cell: spot }).state;
    expect(s.coins).toBe(WATCH.startCoins - DEFENDERS.hedgehog.cost);
    expect(actWatch(s, { type: 'plant', kind: 'frog', cell: spot }).reason).toBe('Something is already there');
    // Taking back tonight's defender refunds it.
    const back = actWatch(s, { type: 'lift', id: s.defenders[0]!.id }).state;
    expect(back.coins).toBe(WATCH.startCoins);
    expect(actWatch({ ...s, coins: 1 }, { type: 'plant', kind: 'frog', cell: b.all.find((c) => knownAt(s, c) === null && c !== spot)! }).ok).toBe(false);
  });

  it('the lantern shows what a misty square holds, for a price', () => {
    const s = newWatch('LANTRN');
    const misty = b.all.filter((c) => knownAt(s, c) === null);
    const onTrail = misty.find((c) => s.current.trail.includes(c))!;
    const off = misty.find((c) => !s.current.trail.includes(c))!;
    const a = actWatch(s, { type: 'lantern', cell: onTrail }).state;
    expect(knownAt(a, onTrail)).toBe('trail');
    expect(a.coins).toBe(s.coins - WATCH.lantern);
    const c = actWatch(a, { type: 'lantern', cell: off }).state;
    expect(knownAt(c, off)).toBe('clear');
  });

  it('a defender on the trail is trodden down; pests that get through eat seedlings', () => {
    let s = newWatch('TRAMPL');
    const spot = s.current.trail.find((c) => knownAt(s, c) === null)!;
    s = actWatch(s, { type: 'plant', kind: 'frog', cell: spot }).state;
    const r = actWatch(s, { type: 'dusk' });
    expect(r.night!.trampled).toEqual(['frog']);
    expect(r.state.defenders).toHaveLength(0);
    expect(r.night!.lost).toBe(pestsOf(1).length);
    expect(r.state.seedlings).toBe(WATCH.seedlings - pestsOf(1).length);
    expect(r.state.night).toBe(2);
  });

  it('marking the true trail and covering it saves every seedling over a whole season', () => {
    fc.assert(fc.property(seedArb, (seed) => {
      let s = newWatch(seed);
      while (s.phase === 'plan') {
        s = plan(s);
        const before = readout(s);
        const r = actWatch(s, { type: 'dusk' });
        // The readout on the true trail is exactly what happens.
        for (const w of r.night!.walks) expect(w.stoppedAt !== null).toBe(before.find((x) => x.kind === w.kind)!.harm >= PESTS[w.kind].hp);
        s = r.state;
      }
      expect(s.phase).toBe('done');
      expect(s.records).toHaveLength(WATCH.nights);
      expect(watchScore(s).total).toBe(s.seedlings * WATCH.seedlingPoints + s.coins);
    }), { numRuns: 15 });
  }, 60_000);

  it('a season replays exactly from its seed and actions', () => {
    const play = () => { let s = newWatch('REPLAY'); for (let i = 0; i < 3; i++) s = actWatch(plan(s), { type: 'dusk' }).state; return s; };
    expect(play()).toEqual(play());
  });
});
