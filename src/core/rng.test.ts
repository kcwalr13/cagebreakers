import { describe, expect, it } from 'vitest';
import { createRng, stream } from './rng';
import { normalizeSeed, seedFromInts } from './seed';

describe('rng', () => {
  it('repeats exactly for the same seed and differs across streams', () => {
    const a = createRng('ABC123'), b = createRng('ABC123');
    const seqA = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(seqA);
    const s1 = stream('ABC123', 'shop'), s2 = stream('ABC123', 'page');
    expect(s1.next()).not.toBe(s2.next());
  });

  it('keeps int and weighted in range', () => {
    const r = createRng('RANGE');
    for (let i = 0; i < 2000; i++) {
      const n = r.int(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
      expect(['a', 'b']).toContain(r.weighted([['a', 1], ['b', 3]]));
    }
  });

  it('shuffles without losing or mutating items', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const out = createRng('S').shuffle(items);
    expect(out.slice().sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('seeds', () => {
  it('normalizes typed codes and rejects ambiguous characters', () => {
    expect(normalizeSeed(' 7kq2x4 ')).toBe('7KQ2X4');
    expect(normalizeSeed('O0I1L')).toBeNull();
    expect(normalizeSeed('ABC')).toBeNull();
    expect(seedFromInts([0, 1, 2, 3, 4, 5])).toHaveLength(6);
  });
});
