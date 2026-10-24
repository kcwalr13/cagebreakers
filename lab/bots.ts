/**
 * Bots play the real run rules headlessly. They are not clever; they are consistent, so
 * changes to balance show up as changes in their results.
 *  - random:  legal moves at random
 *  - greedy:  buys the strongest unit it can afford and places it anywhere legal
 *  - planner: claims toward the front, hunts seals and traits, saves for interest, uses items
 *  - oracle:  shops like the planner, then test-fights layouts against the scouted enemy
 */
import { RUN, unitValue } from '../src/content/balance';
import { ITEMS, isRelic } from '../src/content/items';
import { speciesById } from '../src/content/species';
import { CALLINGS, KINS } from '../src/content/traits';
import type { ItemId } from '../src/content/types';
import { PLAYER, simulateClash } from '../src/core/clash';
import { rowOf } from '../src/core/grid';
import { pieceKind } from '../src/core/pieces';
import { type Rng, createRng } from '../src/core/rng';
import { completions } from '../src/core/rules';
import {
  type OwnedUnit, type RunAction, type RunState, act, claimCost, dominoSpots, emptyHeld, newRun, offerFits, onBench, onBoard,
  openCells, reach, runPage, scout, sealedNow, toSpecs, unitAtCell, values,
} from '../src/core/run';

export type BotName = 'random' | 'greedy' | 'planner' | 'oracle';

interface Ctx { rng: Rng; bot: BotName }
const smart = (ctx: Ctx) => ctx.bot === 'planner' || ctx.bot === 'oracle';

function tryAct(s: RunState, a: RunAction): RunState | null {
  const r = act(s, a);
  return r.ok && r.state !== s ? r.state : null;
}

/** Cells a unit could be placed on right now (for a Domino, cells for its first half). */
function legalCells(s: RunState, u: OwnedUnit): number[] {
  const empty = emptyHeld(s);
  const kind = pieceKind(u.species);
  if (kind === 'domino') return empty.filter((c) => dominoSpots(s, u, c).length > 0);
  return empty.filter((c) => tryAct(s, { type: 'place', uid: u.uid, cell: c }) !== null);
}

/** Claimed cages that can no longer be completed with what stands in them. */
function deadCages(s: RunState): number {
  const page = runPage(s), vals = values(s);
  return s.claimed.filter((id) => completions(page, vals, page.cages[id]!).length === 0).length;
}

function placementScore(before: RunState, after: RunState, u: OwnedUnit, ctx: Ctx): number {
  if (!smart(ctx)) return ctx.rng.next();
  const page = runPage(after);
  const sp = speciesById(u.species);
  const placed = after.units.find((x) => x.uid === u.uid)!;
  let score = 12 * (sealedNow(after).size - sealedNow(before).size) - 6 * (deadCages(after) - deadCages(before));
  const row = rowOf(placed.cell);
  if (sp.calling === 'warden') score += (5 - row) * 1.2;
  if (sp.calling === 'marksman' || sp.calling === 'mender') score += row * 0.8;
  if (sp.kin === 'snail' && [placed.cell - 6, placed.cell + 6, placed.cell - 1, placed.cell + 1].some((n) => n >= 0 && n < 36 && page.stones[n])) score += 2;
  return score + ctx.rng.next() * 0.5;
}

/** How much an offer would add to the army's Kins and Callings. */
function traitGain(s: RunState, species: string): number {
  const sp = speciesById(species);
  const owned = new Set(s.units.map((u) => u.species));
  if (owned.has(species)) return 0;
  const count = (pred: (id: string) => boolean) => [...owned].filter(pred).length;
  let g = 0;
  if (sp.kin) {
    const have = count((id) => speciesById(id).kin === sp.kin);
    g += KINS[sp.kin].thresholds.includes(have + 1) ? 4 : have > 0 ? 1.5 : 0.5;
  }
  const haveC = count((id) => speciesById(id).calling === sp.calling);
  g += CALLINGS[sp.calling].thresholds.includes(haveC + 1) ? 3 : haveC > 0 ? 1 : 0.3;
  return g;
}

function choosePick(s: RunState, ctx: Ctx): number {
  const opts = s.pick!;
  if (!smart(ctx)) return ctx.rng.int(0, opts.length - 1);
  const worth: Record<ItemId, number> = { blade: 6, hourglass: 6, bulwark: 5, quill: 4, thorn: 4, chisel: 3, flip: 3, eraser: 3.5, inkpot: 2, lens: 0.5 };
  return opts.map((id, i) => ({ i, v: worth[id] + ctx.rng.next() * 0.1 })).sort((a, b) => b.v - a.v)[0]!.i;
}

/** Spends items the way a sensible player would: relics on the strongest, tools where they help. */
function useItems(s: RunState, ctx: Ctx): RunState {
  if (ctx.bot === 'greedy' || ctx.bot === 'random') {
    // Simple bots only hand out relics.
    for (let slot = s.satchel.length - 1; slot >= 0; slot--) {
      const item = s.satchel[slot]!;
      if (!isRelic(item)) continue;
      const bearer = ctx.bot === 'random' ? ctx.rng.pick(s.units.length ? s.units : [null as unknown as OwnedUnit]) : onBoard(s).filter((u) => !u.relic).sort((a, b) => strength(b) - strength(a))[0];
      if (bearer) s = tryAct(s, { type: 'use', slot, uid: bearer.uid }) ?? s;
    }
    return s;
  }
  for (let guard = 0; guard < 8; guard++) {
    let used = false;
    for (let slot = s.satchel.length - 1; slot >= 0 && !used; slot--) {
      const item = s.satchel[slot]!;
      let next: RunState | null = null;
      if (isRelic(item)) {
        const bearer = onBoard(s).filter((u) => !u.relic).sort((a, b) => strength(b) - strength(a))[0];
        if (bearer && onBoard(s).length >= Math.min(3, reach(s))) next = tryAct(s, { type: 'use', slot, uid: bearer.uid });
      } else if (item === 'eraser') {
        const page = runPage(s);
        const stone = s.claimed.flatMap((id) => page.cages[id]!.cells).find((c) => page.stones[c]);
        if (stone !== undefined) next = tryAct(s, { type: 'use', slot, cell: stone });
      } else if (item === 'chisel' || item === 'flip') {
        // Make a stranded bench unit fit somewhere.
        for (const u of onBench(s)) {
          if (legalCells(s, u).length) continue;
          for (const dir of [1, -1] as const) {
            const t = tryAct(s, { type: 'use', slot, uid: u.uid, dir });
            if (t && legalCells(t, t.units.find((x) => x.uid === u.uid)!).length) { next = t; break; }
          }
          if (next) break;
        }
      } else if (item === 'inkpot') {
        const page = runPage(s);
        for (const id of s.claimed) {
          const t = tryAct(s, { type: 'use', slot, cage: id });
          if (t && sealedNow(t).size > sealedNow(s).size) { next = t; break; }
          void page;
        }
      }
      if (next) { s = next; used = true; }
    }
    if (!used) break;
  }
  return s;
}

const strength = (u: OwnedUnit) => unitValue(speciesById(u.species).tier, u.stars);

/** Puts the strongest bench unit in place of weaker units on the page, if that's a clear gain. */
function upgrade(s: RunState): RunState | null {
  const bench = onBench(s).sort((a, b) => strength(b) - strength(a));
  const board = onBoard(s).sort((a, b) => strength(a) - strength(b));
  for (const u of bench) {
    if (pieceKind(u.species) === 'domino') {
      // Clear two weak neighbors and lay the Domino across them.
      for (const a of board) for (const b of board) {
        if (a === b || strength(a) + strength(b) >= strength(u)) continue;
        if (!a.cell2 && !b.cell2 && [1, -1, 6, -6].includes(b.cell - a.cell)) {
          let t: RunState | null = tryAct(s, { type: 'place', uid: a.uid, cell: -1 });
          t = t && tryAct(t, { type: 'place', uid: b.uid, cell: -1 });
          t = t && tryAct(t, { type: 'place', uid: u.uid, cell: a.cell, cell2: b.cell });
          if (t) return t;
        }
      }
      continue;
    }
    for (const w of board) {
      if (strength(w) * 1.5 > strength(u) || w.cell2 !== undefined) continue;
      const t = tryAct(s, { type: 'place', uid: u.uid, cell: w.cell });
      if (t) return t;
    }
  }
  return null;
}

/** Plays one planning phase, then clashes. Returns the state after the clash. */
function playRound(s: RunState, ctx: Ctx): RunState {
  const { rng, bot } = ctx;
  for (let step = 0; step < 80; step++) {
    if (s.phase === 'pick') { s = act(s, { type: 'pick', choice: choosePick(s, ctx) }).state; continue; }
    if (s.phase === 'merge') {
      const keep = smart(ctx)
        ? s.merge!.uids.slice().sort((a, b) => Number((s.units.find((u) => u.uid === b)!.cell >= 0)) - Number((s.units.find((u) => u.uid === a)!.cell >= 0)))[0]!
        : rng.pick(s.merge!.uids);
      s = act(s, { type: 'merge', keep }).state;
      continue;
    }
    // Place bench units while the army has room, strongest first.
    let placed = false;
    const benchOrder = smart(ctx) || bot === 'greedy' ? onBench(s).sort((a, b) => strength(b) - strength(a)) : onBench(s);
    for (const u of benchOrder) {
      if (onBoard(s).length >= reach(s)) break;
      const cells = legalCells(s, u);
      if (!cells.length) continue;
      const options = cells.map((c) => tryAct(s, { type: 'place', uid: u.uid, cell: c })).filter((x): x is RunState => !!x);
      if (!options.length) continue;
      const best = options.map((n) => ({ n, v: placementScore(s, n, u, ctx) })).sort((a, b) => b.v - a.v)[0]!;
      s = best.n; placed = true;
    }
    if (placed) continue;
    // Smart bots swap a stronger bench unit in for the weakest on the page.
    if (smart(ctx)) {
      const up = upgrade(s);
      if (up) { s = up; continue; }
    }

    // Buy.
    const keep = smart(ctx) && s.clash >= 4 && onBoard(s).length >= reach(s) ? Math.min(10, s.gold) : 0;
    const affordable = s.offers.map((o, i) => ({ o, i })).filter(({ o }) => !o.sold && speciesById(o.species).tier <= s.gold - keep);
    if (affordable.length && onBench(s).length < RUN.benchSize) {
      let pick = affordable[0]!;
      if (bot === 'random') pick = rng.pick(affordable);
      else {
        const owned = new Map<string, number>();
        for (const u of s.units) owned.set(u.species, (owned.get(u.species) ?? 0) + 1);
        pick = affordable.map((a) => ({
          a,
          v: speciesById(a.o.species).tier * 2 + (owned.get(a.o.species) ?? 0) * 3 + (offerFits(s, a.o) ? 2 : 0)
            + (smart(ctx) ? traitGain(s, a.o.species) : 0) + rng.next(),
        })).sort((x, y) => y.v - x.v)[0]!.a;
        const misprint = speciesById(pick.o.species).tier === 5;
        if (smart(ctx) && !misprint && !offerFits(s, pick.o) && onBoard(s).length < reach(s) && onBench(s).length >= 2) pick = { o: pick.o, i: -1 };
      }
      if (pick.i >= 0) { const next = tryAct(s, { type: 'buy', offer: pick.i }); if (next) { s = next; continue; } }
    }
    // A waiting Domino with nowhere to lie: claim a cage that gives it room, as a player would.
    const page = runPage(s);
    const strandedDomino = smart(ctx) ? onBench(s).find((u) => pieceKind(u.species) === 'domino' && !legalCells(s, u).length) : undefined;
    if (strandedDomino) {
      const room = page.cages.filter((c) => !s.claimed.includes(c.id) && claimCost(s, c.id) <= s.gold)
        .map((c) => ({ id: c.id, t: tryAct(s, { type: 'claim', cage: c.id }) }))
        .filter((x): x is { id: number; t: RunState } => !!x.t && legalCells(x.t, strandedDomino).length > 0)
        .sort((a, b) => claimCost(s, a.id) - claimCost(s, b.id))[0];
      if (room) { s = room.t; continue; }
    }
    // Claim a cage when the army is full and something is waiting.
    const wantClaim = onBench(s).length > 0 && onBoard(s).length >= reach(s);
    if (wantClaim) {
      const options = page.cages.filter((c) => !s.claimed.includes(c.id)).map((c) => c.id)
        .filter((id) => claimCost(s, id) <= s.gold - (smart(ctx) && s.clash > 3 ? 2 : 0));
      if (options.length) {
        const pick = smart(ctx)
          ? options.sort((a, b) => Math.min(...openCells(page, a).map(rowOf)) - Math.min(...openCells(page, b).map(rowOf)) || claimCost(s, a) - claimCost(s, b))[0]!
          : bot === 'greedy' ? options.sort((a, b) => claimCost(s, a) - claimCost(s, b))[0]! : rng.pick(options);
        const next = tryAct(s, { type: 'claim', cage: pick });
        if (next) { s = next; continue; }
      }
    }

    // Smart bots reroll with spare gold when their army has open places.
    if (smart(ctx) && s.gold > 12 && onBoard(s).length < reach(s)) { const next = tryAct(s, { type: 'reroll' }); if (next) { s = next; continue; } }
    // Sell bench clutter that can't fit, to make room.
    if (bot !== 'random' && onBench(s).length >= RUN.benchSize) {
      const junk = onBench(s).sort((a, b) => speciesById(a.species).tier - speciesById(b.species).tier)[0]!;
      s = act(s, { type: 'sell', uid: junk.uid }).state;
      continue;
    }
    break;
  }
  if (s.phase === 'plan') s = useItems(s, ctx);
  if (!onBoard(s).length) {
    // Nothing placed: force any legal placement so the run can go on.
    for (const u of onBench(s)) { const cells = legalCells(s, u); if (cells.length) { s = act(s, { type: 'place', uid: u.uid, cell: cells[0]! }).state; break; } }
  }
  if (bot === 'oracle') s = optimizeLayout(s, ctx);
  const r = act(s, { type: 'clash' });
  return r.ok ? r.state : { ...s, phase: 'lost' };
}

/** Score of fighting the scouted enemy with the current layout: winning big is best. */
function fightScore(s: RunState): number {
  const units = toSpecs(onBoard(s));
  if (!units.length) return -1e9;
  const op = scout(s);
  const r = simulateClash({ page: runPage(s), units, rules: op.playerRules }, { page: op.page, units: op.units, rules: op.rules });
  const mine = r.survivors.filter((u) => r.fighters.find((f) => f.uid === u)?.team === PLAYER).length;
  const theirs = r.survivors.length - mine;
  return (r.winner === PLAYER ? 100 : r.winner === 'draw' ? 0 : -100) + 10 * (mine - theirs) - r.beats / 50;
}

/** Hill-climbs the layout with moves, swaps and Domino turns, judged by test fights against the scouted enemy. */
function optimizeLayout(s: RunState, ctx: Ctx): RunState {
  let best = s, bestScore = fightScore(s);
  for (let i = 0; i < 60; i++) {
    if (!best.units.length) break;
    const u = ctx.rng.pick(best.units);
    let next: RunState | null;
    if (pieceKind(u.species) === 'domino' && u.cell >= 0 && ctx.rng.next() < 0.3) next = tryAct(best, { type: 'turn', uid: u.uid });
    else {
      const cells = legalCells(best, u).concat(onBoard(best).flatMap((x) => [x.cell]));
      if (!cells.length) continue;
      const cell = ctx.rng.pick(cells);
      next = unitAtCell(best, cell)?.uid === u.uid ? null : tryAct(best, { type: 'place', uid: u.uid, cell });
    }
    if (!next) continue;
    const sc = fightScore(next);
    if (sc >= bestScore) { best = next; bestScore = sc; }
  }
  return best;
}

export interface PlayOptions { banned?: readonly string[] }

export function playRun(seed: string, bot: BotName, opts: PlayOptions = {}): RunState {
  const ctx: Ctx = { rng: createRng(`${bot}:${seed}`), bot };
  let s = newRun(seed);
  if (opts.banned?.length) s = { ...s, mods: { banned: opts.banned } };
  const page = runPage(s);
  const twos = page.cages.filter((c) => c.cells.length === 2);
  const first = smart(ctx)
    ? twos.slice().sort((a, b) => Math.min(...a.cells.map(rowOf)) - Math.min(...b.cells.map(rowOf)) || openCells(page, b.id).length - openCells(page, a.id).length)[0]!
    : ctx.rng.pick(twos);
  s = act(s, { type: 'first-claim', cage: first.id }).state;
  for (let guard = 0; guard < 20 && s.phase !== 'won' && s.phase !== 'lost'; guard++) s = playRound(s, ctx);
  return s;
}

export const itemName = (id: ItemId) => ITEMS[id].name;
