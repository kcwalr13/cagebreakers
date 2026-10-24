/**
 * Opponents are built by the same rules the player plays by: a generated page, units bought
 * from the same roster, numbers that obey the Latin rule, cages sealed by filling them.
 * Every opponent in a run depends only on the run seed and the clash number (except the
 * Mirror Scribe, which copies the player's page).
 */
import { ENEMY_CURVE, SHOP_ODDS, unitValue } from '../content/balance';
import { RELICS } from '../content/items';
import { ARCHETYPES, type Archetype, KEEPER_RULES, KEEPERS, type Keeper } from '../content/opponents';
import { SPECIES, speciesById } from '../content/species';
import type { CallingId, Species } from '../content/types';
import type { TeamRules, UnitSpec } from './clash';
import { neighbors, rowOf } from './grid';
import { type Page, generatePage } from './page';
import { type Rng, stream } from './rng';

export interface Opponent {
  clash: number;
  page: Page;
  units: UnitSpec[];
  name: string;
  plan: string;
  archetype: string;
  keeper: Keeper | null;
  rules?: TeamRules;
  /** Rules the Keeper imposes on the player's side, if any. */
  playerRules?: TeamRules;
}

/** Front-liners first, then those that want to stand behind them. */
const ROLE_ORDER: Record<CallingId, number> = { warden: 0, lancer: 1, breaker: 2, sweeper: 3, mender: 4, marksman: 5 };

export function tierOdds(reach: number): readonly number[] {
  let odds = SHOP_ODDS[0]![1];
  for (const [from, row] of SHOP_ODDS) if (reach >= from) odds = row;
  return odds;
}

export function rollTier(rng: Rng, reach: number): number {
  const odds = tierOdds(reach);
  return rng.weighted(odds.map((w, i) => [i + 1, w] as const).filter(([, w]) => w > 0));
}

/** A species of the given tier (or the nearest lower tier that has any), leaning toward a plan. */
export function pickSpecies(rng: Rng, tier: number, plan?: Archetype, banned?: readonly string[]): Species {
  for (let t = tier; t >= 1; t--) {
    const pool = SPECIES.filter((s) => s.tier === t && !banned?.includes(s.id));
    if (!pool.length) continue;
    if (!plan) return rng.pick(pool);
    return rng.weighted(pool.map((s) => [s, 1 + (s.kin && plan.kins.includes(s.kin) ? 3 : 0) + (plan.callings.includes(s.calling) ? 2 : 0)] as const));
  }
  return SPECIES[0]!;
}

function buildArmy(rng: Rng, clash: number, plan: Archetype): { species: Species; stars: 1 | 2 | 3 }[] {
  const count = ENEMY_CURVE.units[clash - 1]!;
  let gold = ENEMY_CURVE.gold[clash - 1]!;
  const reach = 2 + Math.round(clash * 0.9);
  const army: { species: Species; stars: 1 | 2 | 3 }[] = [];
  for (let i = 0; i < count; i++) {
    const slotsLeft = count - i - 1;
    let tier = rollTier(rng, reach);
    while (tier > 1 && gold - tier < slotsLeft) tier--;
    const sp = pickSpecies(rng, tier, plan);
    army.push({ species: sp, stars: 1 });
    gold -= sp.tier;
  }
  // Spend what's left on stars, favouring the plan and the costliest units.
  for (let guard = 0; guard < 40 && gold > 0; guard++) {
    const options = army
      .map((u, i) => ({ i, cost: unitValue(u.species.tier, u.stars + 1) - unitValue(u.species.tier, u.stars), u }))
      .filter((o) => o.u.stars < 3 && o.cost <= gold);
    if (!options.length) break;
    const pick = rng.weighted(options.map((o) => [o, 1 + (o.u.species.kin && plan.kins.includes(o.u.species.kin) ? 2 : 0) + o.u.species.tier] as const));
    army[pick.i]!.stars = (army[pick.i]!.stars + 1) as 2 | 3;
    gold -= pick.cost;
  }
  return army;
}

/** Chooses cells: whole cages first, front rows first, then whatever is left at the front. */
function chooseCells(page: Page, count: number, rng: Rng): number[] {
  const open = (cageId: number) => page.cages[cageId]!.cells.filter((c) => !page.stones[c]);
  const cages = rng.shuffle(page.cages.map((c) => c.id))
    .sort((a, b) => Math.min(...open(a).map(rowOf)) - Math.min(...open(b).map(rowOf)));
  const cells: number[] = [];
  for (const id of cages) {
    const o = open(id);
    if (cells.length + o.length <= count) cells.push(...o);
    if (cells.length === count) break;
  }
  if (cells.length < count) {
    const rest = page.solution.map((_, c) => c).filter((c) => !page.stones[c] && !cells.includes(c)).sort((a, b) => rowOf(a) - rowOf(b) || a - b);
    cells.push(...rest.slice(0, count - cells.length));
  }
  return cells;
}

export function keeperFor(clash: number): Keeper | null {
  return KEEPERS.find((k) => k.clash === clash) ?? null;
}

export function generateOpponent(seed: string, clash: number, player?: { page: Page; units: UnitSpec[] }): Opponent {
  const keeper = keeperFor(clash);
  const rng = stream(seed, `enemy:${clash}`);
  const plan = rng.pick(ARCHETYPES);

  if (keeper?.id === 'mirror-scribe' && player && player.units.length) {
    return {
      clash, keeper, page: player.page, archetype: 'mirror',
      units: player.units.map((u) => ({ ...u, uid: `m-${u.uid}` })),
      name: keeper.name, plan: keeper.twist, rules: { buff: KEEPER_RULES.mirrorBuff },
    };
  }

  const page = generatePage(`${seed}:enemy:${clash}`);
  const army = buildArmy(rng, clash, plan);
  const dominoes = army.filter((u) => u.species.misprint === 'domino').length;
  const cells = chooseCells(page, army.length + dominoes, rng);
  // Front cells go to front-liners; ties keep the roll order.
  const pool = cells.slice().sort((a, b) => rowOf(a) - rowOf(b) || a - b);
  const sortedArmy = army.slice().sort((a, b) => ROLE_ORDER[a.species.calling] - ROLE_ORDER[b.species.calling]);
  const units: UnitSpec[] = sortedArmy.map((u, i) => {
    const cell = pool.shift()!;
    const base = { uid: `e${clash}-${i}`, stars: u.stars, cell };
    if (u.species.misprint === 'domino') {
      // A Domino needs a free neighbor; without one, the enemy fields the Blank instead.
      const j = pool.findIndex((c) => neighbors(cell).includes(c));
      if (j >= 0) {
        const cell2 = pool.splice(j, 1)[0]!;
        return { ...base, species: u.species.id, n: page.solution[cell]!, n2: page.solution[cell2]!, cell2 };
      }
      return { ...base, species: 'blank', n: 0 };
    }
    return { ...base, species: u.species.id, n: u.species.misprint === 'blank' ? 0 : page.solution[cell]! };
  });
  // Relics go to the strongest units, as a player would hand them out.
  const relicCount = Math.min(units.length, ENEMY_CURVE.relics[clash - 1] ?? 0);
  const strongest = units.map((u, i) => ({ i, v: unitValue(speciesById(u.species).tier, u.stars) })).sort((a, b) => b.v - a.v || a.i - b.i);
  for (const { i } of strongest.slice(0, relicCount)) units[i]!.relic = rng.pick(RELICS);

  const op: Opponent = { clash, keeper, page, units, archetype: plan.id, name: keeper?.name ?? plan.name, plan: keeper?.twist ?? plan.plan };
  if (keeper?.id === 'proofreader') op.playerRules = { unsealedPenalty: KEEPER_RULES.proofreaderPenalty };
  if (keeper?.id === 'binder') op.rules = { unshatterable: true };
  return op;
}
