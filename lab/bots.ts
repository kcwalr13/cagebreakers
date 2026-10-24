/**
 * Bots play the real run rules headlessly. They are not clever; they are consistent, so
 * changes to balance show up as changes in their results.
 */
import { RUN } from '../src/content/balance';
import { speciesById } from '../src/content/species';
import { PLAYER, simulateClash } from '../src/core/clash';
import { rowOf } from '../src/core/grid';
import { type Rng, createRng } from '../src/core/rng';
import { hintFor, isLegal } from '../src/core/rules';
import {
  type RunAction, type RunState, act, claimCost, isClaimed, newRun, onBench, onBoard, openCells, pageOf, reach, scout, toSpecs, values,
} from '../src/core/run';

export type BotName = 'random' | 'greedy' | 'planner' | 'oracle';

interface Ctx { rng: Rng; bot: BotName }

function legalCells(s: RunState, uid: string): number[] {
  const page = pageOf(s.seed), vals = values(s);
  const u = s.units.find((x) => x.uid === uid)!;
  const out: number[] = [];
  for (let c = 0; c < 36; c++) {
    if (vals[c] || page.stones[c] || !isClaimed(s, c)) continue;
    if (isLegal(page, vals, c, u.n, u.cell)) out.push(c);
  }
  return out;
}

function placementScore(s: RunState, uid: string, cell: number, ctx: Ctx): number {
  if (ctx.bot !== 'planner' && ctx.bot !== 'oracle') return ctx.rng.next();
  const page = pageOf(s.seed);
  const u = s.units.find((x) => x.uid === uid)!;
  const sp = speciesById(u.species);
  const hint = hintFor(page, values(s), cell, u.n, u.cell);
  let score = hint === 'seals' ? 12 : hint === 'dead' ? -6 : 0;
  const row = rowOf(cell);
  if (sp.calling === 'warden') score += (5 - row) * 1.2;
  if (sp.calling === 'marksman' || sp.calling === 'mender') score += row * 0.8;
  if (sp.kin === 'snail' && [cell - 6, cell + 6, cell - 1, cell + 1].some((n) => n >= 0 && n < 36 && page.stones[n])) score += 2;
  return score + ctx.rng.next() * 0.5;
}

function tryAct(s: RunState, a: RunAction): RunState | null {
  const r = act(s, a);
  return r.ok ? r.state : null;
}

/** Plays one planning phase, then clashes. Returns the state after the clash. */
function playRound(s: RunState, ctx: Ctx): RunState {
  const { rng, bot } = ctx;
  for (let step = 0; step < 60; step++) {
    if (s.phase === 'merge') {
      const keep = bot === 'planner' || bot === 'oracle'
        ? s.merge!.uids.slice().sort((a, b) => Number((s.units.find((u) => u.uid === b)!.cell >= 0)) - Number((s.units.find((u) => u.uid === a)!.cell >= 0)))[0]!
        : rng.pick(s.merge!.uids);
      s = act(s, { type: 'merge', keep }).state;
      continue;
    }
    // Place bench units while the army has room.
    let placed = false;
    for (const u of onBench(s)) {
      if (onBoard(s).length >= reach(s)) break;
      const cells = legalCells(s, u.uid);
      if (!cells.length) continue;
      const best = cells.map((c) => ({ c, v: placementScore(s, u.uid, c, ctx) })).sort((a, b) => b.v - a.v)[0]!;
      const next = tryAct(s, { type: 'place', uid: u.uid, cell: best.c });
      if (next) { s = next; placed = true; }
    }
    if (placed) continue;

    // Buy.
    const page = pageOf(s.seed);
    const smart = bot === 'planner' || bot === 'oracle';
    const keep = smart && s.clash >= 4 && onBoard(s).length >= reach(s) ? Math.min(10, s.gold) : 0;
    const affordable = s.offers.map((o, i) => ({ o, i })).filter(({ o }) => !o.sold && speciesById(o.species).tier <= s.gold - keep);
    if (affordable.length && onBench(s).length < RUN.benchSize) {
      let pick = affordable[0]!;
      if (bot === 'random') pick = rng.pick(affordable);
      else {
        const owned = new Map<string, number>();
        for (const u of s.units) owned.set(u.species, (owned.get(u.species) ?? 0) + 1);
        const fits = (n: number) => page.cages.some((c) => s.claimed.includes(c.id) && c.cells.some((cell) => !values(s)[cell] && !page.stones[cell] && isLegal(page, values(s), cell, n)));
        pick = affordable.map((a) => ({ a, v: speciesById(a.o.species).tier * 2 + (owned.get(a.o.species) ?? 0) * 3 + (fits(a.o.n) ? 2 : 0) + rng.next() }))
          .sort((x, y) => y.v - x.v)[0]!.a;
        if (smart && !fits(pick.o.n) && onBoard(s).length < reach(s) && onBench(s).length >= 2) pick = { o: pick.o, i: -1 };
      }
      if (pick.i >= 0) { const next = tryAct(s, { type: 'buy', offer: pick.i }); if (next) { s = next; continue; } }
    }
    // Claim a cage when the army is full and something is waiting.
    const wantClaim = onBench(s).length > 0 && onBoard(s).length >= reach(s);
    if (wantClaim) {
      const options = page.cages.filter((c) => !s.claimed.includes(c.id)).map((c) => c.id)
        .filter((id) => claimCost(s, id) <= s.gold - (bot === 'planner' && s.clash > 3 ? 2 : 0));
      if (options.length) {
        const pick = bot === 'planner'
          ? options.sort((a, b) => Math.min(...openCells(page, a).map(rowOf)) - Math.min(...openCells(page, b).map(rowOf)) || claimCost(s, a) - claimCost(s, b))[0]!
          : bot === 'greedy' ? options.sort((a, b) => claimCost(s, a) - claimCost(s, b))[0]! : rng.pick(options);
        const next = tryAct(s, { type: 'claim', cage: pick });
        if (next) { s = next; continue; }
      }
    }

    // Planner rerolls with spare gold when its army has open places.
    if ((bot === 'planner' || bot === 'oracle') && s.gold > 12 && onBoard(s).length < reach(s)) { const next = tryAct(s, { type: 'reroll' }); if (next) { s = next; continue; } }
    // Sell bench clutter that can't fit, to make room.
    if (bot !== 'random' && onBench(s).length >= RUN.benchSize) {
      const junk = onBench(s).sort((a, b) => speciesById(a.species).tier - speciesById(b.species).tier)[0]!;
      s = act(s, { type: 'sell', uid: junk.uid }).state;
      continue;
    }
    break;
  }
  if (!onBoard(s).length) {
    // Nothing placed: force any legal placement so the run can go on.
    for (const u of onBench(s)) { const cells = legalCells(s, u.uid); if (cells.length) { s = act(s, { type: 'place', uid: u.uid, cell: cells[0]! }).state; break; } }
  }
  if (bot === 'oracle') s = optimizeLayout(s, ctx);
  const r = act(s, { type: 'clash' });
  return r.ok ? r.state : { ...s, phase: 'lost' };
}

/** Score of fighting the scouted enemy with the current layout: winning big is best. */
function fightScore(s: RunState): number {
  const page = pageOf(s.seed);
  const units = toSpecs(onBoard(s));
  if (!units.length) return -1e9;
  const op = scout(s);
  const r = simulateClash({ page, units, rules: op.playerRules }, { page: op.page, units: op.units, rules: op.rules });
  const mine = r.survivors.filter((u) => r.fighters.find((f) => f.uid === u)?.team === PLAYER).length;
  const theirs = r.survivors.length - mine;
  return (r.winner === PLAYER ? 100 : r.winner === 'draw' ? 0 : -100) + 10 * (mine - theirs) - r.beats / 50;
}

/** Hill-climbs the layout with moves and swaps, judged by test fights against the scouted enemy. */
function optimizeLayout(s: RunState, ctx: Ctx): RunState {
  let best = s, bestScore = fightScore(s);
  for (let i = 0; i < 60; i++) {
    const u = ctx.rng.pick(s.units);
    const cells = legalCells(best, u.uid).concat(onBoard(best).map((x) => x.cell));
    if (!cells.length) continue;
    const next = tryAct(best, { type: 'place', uid: u.uid, cell: ctx.rng.pick(cells) });
    if (!next || next === best) continue;
    const sc = fightScore(next);
    if (sc >= bestScore) { best = next; bestScore = sc; }
  }
  return best;
}

export function playRun(seed: string, bot: BotName): RunState {
  const ctx: Ctx = { rng: createRng(`${bot}:${seed}`), bot };
  let s = newRun(seed);
  const page = pageOf(seed);
  const twos = page.cages.filter((c) => c.cells.length === 2);
  const first = bot === 'planner' || bot === 'oracle'
    ? twos.slice().sort((a, b) => Math.min(...a.cells.map(rowOf)) - Math.min(...b.cells.map(rowOf)) || openCells(page, b.id).length - openCells(page, a.id).length)[0]!
    : ctx.rng.pick(twos);
  s = act(s, { type: 'first-claim', cage: first.id }).state;
  for (let guard = 0; guard < 20 && s.phase !== 'won' && s.phase !== 'lost'; guard++) s = playRound(s, ctx);
  return s;
}
