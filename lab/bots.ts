/**
 * Bots that play whole runs through the same core the phone uses. They stand in for three kinds
 * of player, so the balance report can say whether commissions reward rearranging:
 *  - Hasty places dealt numbers anywhere legal and never moves the old ones.
 *  - Tidy keeps its layout and places new numbers where they help this round's commissions.
 *  - Careful searches whole layouts: the required commission first, then bounties, then seals. It
 *    never moves a number that's already right, as a player who has worked one out wouldn't.
 * When a bot paints itself into a corner it falls back to a layout taken from the hidden
 * solution, which is always legal; a person would find their own way out.
 */
import { RUN } from '../src/content/balance';
import { choices, isMet, viewOf } from '../src/core/commission';
import { type Rng, stream } from '../src/core/rng';
import { isLegal } from '../src/core/rules';
import {
  type RunAction, type RunState, type Token, type RunSetup, act, dealtThisRound, inkBlocker, legalCells, newRun, runPage, valuesOf,
} from '../src/core/run';

export type BotName = 'hasty' | 'tidy' | 'careful';
export const BOTS: BotName[] = ['hasty', 'tidy', 'careful'];

/** A run's state plus every action taken, so a run can be replayed. */
export interface Played { state: RunState; actions: RunAction[] }

class Player {
  actions: RunAction[] = [];
  constructor(public s: RunState) {}
  do(a: RunAction): boolean {
    const r = act(this.s, a);
    if (r.ok) { this.s = r.state; this.actions.push(a); }
    return r.ok;
  }
  /** Moves tokens into a target layout (token id → cell; ids left out go to the hand). */
  layout(target: Map<number, number>) {
    for (const t of this.s.tokens) if (t.cell >= 0 && target.get(t.id) !== t.cell) this.do({ type: 'place', id: t.id, cell: -1 });
    for (const [id, cell] of target) {
      const t = this.s.tokens.find((x) => x.id === id)!;
      if (t.cell !== cell && !this.do({ type: 'place', id, cell })) throw new Error(`layout move refused: ${id}→${cell}`);
    }
  }
}

/** Whether a token stands where the hidden solution has its number. */
const isRight = (s: RunState, t: Token) => t.cell >= 0 && runPage(s).solution[t.cell] === t.n;

/**
 * A layout of these tokens on the hidden solution's cells: always legal. Tokens that are already
 * right stay where they stand.
 */
function witness(s: RunState, which: readonly Token[], rng: Rng): Map<number, number> {
  const page = runPage(s);
  // Callers may hold token objects from before this round's moves: read where each stands now.
  const tokens = which.map((w) => s.tokens.find((t) => t.id === w.id)!);
  const out = new Map<number, number>();
  const taken = new Set<number>();
  for (const t of s.tokens) if (isRight(s, t)) taken.add(t.cell);
  for (const t of tokens) if (isRight(s, t)) out.set(t.id, t.cell);
  for (let n = 1; n <= page.size; n++) {
    const mine = tokens.filter((t) => t.n === n && !out.has(t.id));
    if (!mine.length) continue;
    const cells = rng.shuffle(page.stones.map((_, c) => c).filter((c) => !page.stones[c] && page.solution[c] === n && !taken.has(c)));
    mine.forEach((t, i) => out.set(t.id, cells[i]!));
  }
  return out;
}

/** What a layout earns this round, as a bot weighs it: required ≫ bounties > seals. */
function worth(s: RunState, values: number[]): number {
  const v = viewOf(runPage(s), values);
  let score = v.sealed.size * RUN.sealGold * 2;
  for (const p of s.posted) if (isMet(p.c, v)) score += p.required ? 1000 : p.gold * 10;
  return score;
}

const valuesWith = (s: RunState, target: Map<number, number>) => {
  const page = runPage(s);
  const values = page.stones.slice();
  for (const t of s.tokens) { const c = target.get(t.id); if (c !== undefined) values[c] = t.n; }
  return values;
};

/** Fills the rest of the page by backtracking on the Latin rule alone, as a player who ignores cages would. */
function latinFill(p: Player, rng: Rng): boolean {
  const s = p.s;
  const page = runPage(s);
  const values = valuesOf(s);
  const loose = s.tokens.filter((t) => t.cell < 0);
  const empty = rng.shuffle(values.map((_, c) => c).filter((c) => !values[c]));
  const used = new Array<boolean>(loose.length).fill(false);
  const plan: [number, number][] = [];
  let budget = 20000;
  const walk = (k: number): boolean => {
    if (k === empty.length) return true;
    if (--budget < 0) return false;
    const cell = empty[k]!;
    const tried = new Set<number>();
    for (let i = 0; i < loose.length; i++) {
      const t = loose[i]!;
      if (used[i] || tried.has(t.n) || !isLegal(page, values, cell, t.n)) continue;
      tried.add(t.n);
      used[i] = true; values[cell] = t.n; plan.push([t.id, cell]);
      if (walk(k + 1)) return true;
      used[i] = false; values[cell] = 0; plan.pop();
    }
    return false;
  };
  if (!walk(0)) return false;
  for (const [id, cell] of plan) p.do({ type: 'place', id, cell });
  return true;
}

/** Puts every number on the solution's cells: the way out of any corner. */
function rescue(p: Player, rng: Rng, which: readonly Token[]) {
  p.layout(witness(p.s, which, rng));
}

function hastyRound(p: Player, rng: Rng) {
  const s = p.s;
  const final = s.round === s.setup.rounds;
  const fresh = rng.shuffle(dealtThisRound(s)).slice(0, final ? undefined : s.need);
  if (final && latinFill(p, rng)) return;
  for (const t of fresh) {
    const cells = legalCells(p.s, t.id).filter((c) => !p.s.tokens.some((o) => o.cell === c));
    if (!cells.length) { rescue(p, rng, [...p.s.tokens.filter((x) => x.round < p.s.round), ...fresh]); return; }
    p.do({ type: 'place', id: t.id, cell: rng.pick(cells) });
  }
}

function tidyRound(p: Player, rng: Rng) {
  const final = p.s.round === p.s.setup.rounds;
  if (final) { if (!latinFill(p, rng)) rescue(p, rng, p.s.tokens); return; }
  const fresh = dealtThisRound(p.s);
  for (let k = 0; k < p.s.need; k++) {
    let best: { id: number; cell: number; w: number } | null = null;
    for (const t of fresh) {
      if (p.s.tokens.find((x) => x.id === t.id)!.cell >= 0) continue;
      for (const cell of legalCells(p.s, t.id)) {
        if (p.s.tokens.some((o) => o.cell === cell)) continue;
        const values = valuesOf(p.s);
        values[cell] = t.n;
        const w = worth(p.s, values) + rng.next();
        if (!best || w > best.w) best = { id: t.id, cell, w };
      }
    }
    if (!best) { rescue(p, rng, [...p.s.tokens.filter((x) => x.round < p.s.round), ...fresh.slice(0, p.s.need)]); return; }
    p.do({ type: 'place', id: best.id, cell: best.cell });
  }
}

function carefulRound(p: Player, rng: Rng) {
  const s = p.s;
  const page = runPage(s);
  const kept = s.tokens.filter((t) => t.round < s.round);
  const fresh = dealtThisRound(s);
  if (s.round === s.setup.rounds) { rescue(p, rng, s.tokens); return; }
  // Every distinct choice of dealt numbers to place, as token lists.
  const sets = choices({ kept: [], dealt: fresh.map((t) => t.n), need: s.need }).map((nums) => {
    const pool = fresh.slice();
    return nums.map((n) => pool.splice(pool.findIndex((t) => t.n === n), 1)[0]!);
  });
  let best: { target: Map<number, number>; w: number } | null = null;
  for (const set of sets) {
    const tokens = [...kept, ...set];
    // Placing every new number pays the full-hand bonus, weighed like a bounty's gold.
    const bonus = set.length === fresh.length && fresh.length > s.need ? RUN.fullHandGold * 10 : 0;
    for (let i = 0; i < 40; i++) {
      const target = witness(s, tokens, rng);
      const w = worth(s, valuesWith(s, target)) + bonus;
      if (!best || w > best.w) best = { target, w };
    }
  }
  // Polish the best layout: single moves to any legal empty cell that earn more. Right numbers stay.
  const target = best!.target;
  for (let pass = 0; pass < 2; pass++) {
    let improved = false;
    for (const [id, from] of [...target]) {
      const tok = s.tokens.find((t) => t.id === id)!;
      if (isRight(s, tok)) continue;
      const n = tok.n;
      const values = valuesWith(s, target);
      const base = worth(s, values);
      values[from] = 0;
      let move: { cell: number; w: number } | null = null;
      for (let c = 0; c < values.length; c++) {
        if (values[c] || page.stones[c] || !isLegal(page, values, c, n)) continue;
        values[c] = n;
        const w = worth(s, values);
        values[c] = 0;
        if (w > base && (!move || w > move.w)) move = { cell: c, w };
      }
      if (move) { target.set(id, move.cell); improved = true; }
    }
    if (!improved) break;
  }
  p.layout(target);
}

const ROUND: Record<BotName, (p: Player, rng: Rng) => void> = { hasty: hastyRound, tidy: tidyRound, careful: carefulRound };

export function playRun(seed: string, bot: BotName, setup?: RunSetup): Played {
  const p = new Player(newRun(seed, { setup }));
  const rng = stream(seed, `bot:${bot}`);
  while (p.s.phase === 'arrange') {
    ROUND[bot](p, rng);
    if (inkBlocker(p.s)) rescue(p, rng, [...p.s.tokens.filter((t) => t.round < p.s.round), ...dealtThisRound(p.s).slice(0, p.s.need)]);
    if (!p.do({ type: 'ink' })) throw new Error(`ink refused: ${inkBlocker(p.s)}`);
  }
  return { state: p.s, actions: p.actions };
}
