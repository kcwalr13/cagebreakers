import { describe, expect, it } from 'vitest';
import { FIRST_BLOOD } from '../../content/encounters';
import { type UnitSpec, simulateClash } from '../../core/clash';
import { generatePage } from '../../core/page';
import { explainClash } from './explain';

const playerPage = generatePage(FIRST_BLOOD.playerSeed);
const enemyPage = generatePage(FIRST_BLOOD.enemySeed);
const thoughtful: UnitSpec[] = ([
  ['p-shellguard', 2], ['p-warren-guard', 4], ['p-stag-reaper', 5], ['p-tusk-ram', 8],
  ['p-moss-tender', 9], ['p-boar-smasher', 11], ['p-owl-archivist', 16], ['p-hare-fletcher', 22],
] as const).map(([uid, cell]) => ({ ...FIRST_BLOOD.roster.find((u) => u.uid === uid)!, cell }));

describe('explainClash', () => {
  const r = simulateClash({ page: playerPage, units: thoughtful }, { page: enemyPage, units: FIRST_BLOOD.enemy });
  const x = explainClash(r, [playerPage, enemyPage]);

  it('names the verdict and the seals on both sides', () => {
    expect(['Victory', 'Defeat', 'Draw']).toContain(x.verdict);
    expect(x.lines[0]).toMatch(/^You sealed 4 cages/);
    expect(x.lines[1]).toMatch(/^They sealed 3 cages/);
  });

  it('says who broke each shattered seal', () => {
    const shatters = r.events.filter((e) => e.type === 'shatter' && e.team === 0).length;
    const mentions = (x.lines[0]!.match(/ at \d+\.\d s /g) ?? []).length;
    expect(mentions).toBe(shatters);
    expect(x.lines[0]).toMatch(/by their Coil Unmaker/);
  });

  it('lists every unit in the damage bars, biggest first', () => {
    expect(x.bars).toHaveLength(r.fighters.length);
    for (let i = 1; i < x.bars.length; i++) expect(x.bars[i - 1]!.dealt).toBeGreaterThanOrEqual(x.bars[i]!.dealt);
  });
});
