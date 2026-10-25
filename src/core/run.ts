/**
 * A run is a pure state machine: (state, action) → state. Eight rounds on one page: each round
 * deals numbers from the bag and posts three commissions; you arrange the page and ink it. Bots
 * play thousands of runs through this module, and a run is reproducible from its seed and actions.
 */
import { RUN, TOOLS, type ToolId } from '../content/balance';
import type { CommissionKind } from '../content/commissions';
import { type Holding, type Posted, type View, findLayout, isMet, planRound, possible, viewOf } from './commission';
import { CELLS, PEERS, colOf, rowOf } from './grid';
import { type Page, generatePage } from './page';
import { type Rng, stream } from './rng';
import { boardValues, isLegal } from './rules';

export interface Token {
  id: number;
  n: number;
  /** The round it was dealt in. Numbers from earlier rounds must all be on the page to ink. */
  round: number;
  /** -1 while in your hand. */
  cell: number;
}

export interface RoundRecord {
  round: number;
  /** Whether the required commission was met; null when none was posted. */
  required: boolean | null;
  blotted: boolean;
  inkSpilled: number;
  bounties: number;
  bountyGold: number;
  seals: number;
  sealGold: number;
}

export type RunPhase = 'arrange' | 'done' | 'ruined';

export interface RunState {
  v: 3;
  seed: string;
  /** Set on a Daily Page run: the calendar day it belongs to. */
  daily?: string;
  /** 1 to RUN.rounds. */
  round: number;
  phase: RunPhase;
  ink: number;
  gold: number;
  /** Numbers not yet dealt, as counts by value (index 1–6). With the tokens, exactly the page's open cells. */
  bag: number[];
  tokens: Token[];
  nextId: number;
  /** How many of this round's numbers must be on the page to ink. */
  need: number;
  /** Redraws bought this round. */
  redraws: number;
  posted: Posted[];
  /**
   * A legal layout of numbers you could hold that meets every posted commission at once: the
   * proof that all three are possible. Never shown to the player. (Absent in saves from before it existed.)
   */
  proof?: number[];
  /** Bought this round: missing the required commission spills no ink. */
  blotter: boolean;
  /** Cells whose hidden number the Lens has shown. */
  revealed: number[];
  records: RoundRecord[];
}

export type RunAction =
  /** Moves a number to a cell (swapping with whatever stands there), or to your hand with cell -1. */
  | { type: 'place'; id: number; cell: number }
  | { type: 'redraw' }
  | { type: 'lens'; cell: number }
  | { type: 'blotter' }
  | { type: 'ink' };

export interface ActResult {
  state: RunState;
  ok: boolean;
  /** Why an action was refused, in the player's terms. */
  reason?: string;
  /** Set when the action inked a round. */
  inked?: RoundRecord;
}

// ---- Pages and views ------------------------------------------------------------------------

const pages = new Map<string, Page>();
export function pageOf(seed: string): Page {
  let p = pages.get(seed);
  if (!p) { p = generatePage(seed); pages.set(seed, p); if (pages.size > 8) pages.delete(pages.keys().next().value!); }
  return p;
}

export const onPage = (s: RunState) => s.tokens.filter((t) => t.cell >= 0);
export const inHand = (s: RunState) => s.tokens.filter((t) => t.cell < 0);
export const tokenAt = (s: RunState, cell: number) => s.tokens.find((t) => t.cell === cell);
export const bagCount = (bag: readonly number[]) => bag.reduce((a, b) => a + b, 0);
export const dealtThisRound = (s: RunState) => s.tokens.filter((t) => t.round === s.round);

/** Every number standing on the page, stones included (0 where empty). */
export function valuesOf(s: RunState): number[] {
  const placed = new Array<number>(CELLS).fill(0);
  for (const t of s.tokens) if (t.cell >= 0) placed[t.cell] = t.n;
  return boardValues(pageOf(s.seed), placed);
}

export const viewNow = (s: RunState): View => viewOf(pageOf(s.seed), valuesOf(s));

/** For each posted commission, whether the page meets it right now. */
export const metNow = (s: RunState): boolean[] => { const v = viewNow(s); return s.posted.map((p) => isMet(p.c, v)); };

/** Cells a number could move to: legal for it once it leaves where it stands (swaps included). */
export function legalCells(s: RunState, id: number): number[] {
  const t = s.tokens.find((x) => x.id === id);
  if (!t) return [];
  const page = pageOf(s.seed);
  const values = valuesOf(s);
  if (t.cell >= 0) values[t.cell] = 0;
  const out: number[] = [];
  for (let c = 0; c < CELLS; c++) {
    if (page.stones[c] || c === t.cell) continue;
    const was = values[c]!;
    values[c] = 0;
    if (isLegal(page, values, c, t.n)) out.push(c);
    values[c] = was;
  }
  return out;
}

/** Why the round can't be inked yet, or null when it can. */
export function inkBlocker(s: RunState): string | null {
  if (s.phase !== 'arrange') return 'The run is over';
  const strays = s.tokens.filter((t) => t.round < s.round && t.cell < 0).length;
  if (strays) return strays === 1 ? 'Put your lifted number back on the page' : `Put your ${strays} lifted numbers back on the page`;
  const short = s.need - dealtThisRound(s).filter((t) => t.cell >= 0).length;
  if (short > 0) return short === 1 ? 'Place 1 more number' : `Place ${short} more numbers`;
  return null;
}

export function scoreOf(s: RunState): { gold: number; ink: number; inkBonus: number; total: number } {
  const inkBonus = s.phase === 'done' ? s.ink * RUN.inkBonus : 0;
  return { gold: s.gold, ink: s.ink, inkBonus, total: s.gold + inkBonus };
}

// ---- Dealing ----------------------------------------------------------------------------------

/** Draws numbers from the bag without replacement. Returns the numbers and the bag left behind. */
function draw(bag: readonly number[], k: number, rng: Rng): { drawn: number[]; bag: number[] } {
  const left = bag.slice();
  const drawn: number[] = [];
  for (let i = 0; i < k; i++) {
    const total = bagCount(left);
    if (!total) break;
    let roll = Math.floor(rng.next() * total);
    let n = 1;
    while (roll >= left[n]!) { roll -= left[n]!; n++; }
    left[n]!--;
    drawn.push(n);
  }
  return { drawn, bag: left };
}

function giveTokens(s: RunState, numbers: readonly number[]): Token[] {
  return numbers.map((n) => ({ id: s.nextId++, n, round: s.round, cell: -1 }));
}

/** Deals a round and posts its commissions. Mutates the fresh state it's given. */
function startRound(s: RunState, lastRequired: CommissionKind | undefined): RunState {
  const page = pageOf(s.seed);
  const final = s.round === RUN.rounds;
  const left = bagCount(s.bag);
  const want = final ? left : Math.min(RUN.deal[s.round - 1] ?? 0, Math.max(0, left - RUN.finalReserve));
  const { drawn, bag } = draw(s.bag, want, stream(s.seed, `deal:${s.round}:0`));
  s.bag = bag;
  const kept = s.tokens.map((t) => t.n);
  s.tokens = [...s.tokens, ...giveTokens(s, drawn)];
  s.need = final ? drawn.length : Math.max(0, drawn.length - 1);
  s.redraws = 0;
  s.blotter = false;
  const plan = planRound({
    page, round: s.round, final,
    holding: { kept, dealt: drawn, need: s.need },
    now: viewOf(page, valuesOf(s)),
    lastRequired,
  }, stream(s.seed, `commissions:${s.round}`));
  s.posted = plan.posted;
  s.proof = plan.proof;
  return s;
}

export function newRun(seed: string, daily?: string): RunState {
  const page = pageOf(seed);
  const bag = new Array<number>(7).fill(0);
  for (let c = 0; c < CELLS; c++) if (!page.stones[c]) bag[page.solution[c]!]!++;
  const s: RunState = {
    v: 3, seed, ...(daily ? { daily } : {}), round: 1, phase: 'arrange', ink: RUN.startInk, gold: RUN.startGold,
    bag, tokens: [], nextId: 1, need: 0, redraws: 0, posted: [], blotter: false, revealed: [], records: [],
  };
  return startRound(s, undefined);
}

/** Restores a saved run. Runs saved before the commissions build (v2 and earlier) can't continue. */
export function migrateRun(raw: unknown): RunState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<RunState>;
  if (r.v !== 3 || typeof r.seed !== 'string' || !Array.isArray(r.tokens) || !Array.isArray(r.bag) || !Array.isArray(r.posted)) return null;
  return {
    ...(r as RunState),
    revealed: r.revealed ?? [],
    records: r.records ?? [],
  };
}

const clone = (s: RunState): RunState => ({
  ...s,
  bag: s.bag.slice(),
  tokens: s.tokens.map((t) => ({ ...t })),
  posted: s.posted.slice(),
  revealed: s.revealed.slice(),
  records: s.records.slice(),
});

const refuse = (s: RunState, reason: string): ActResult => ({ state: s, ok: false, reason });

/** Says which line already holds a number, for a refused placement. */
function conflictLine(page: Page, values: readonly number[], cell: number, n: number): string {
  for (const p of PEERS[cell]!) {
    if (values[p] !== n) continue;
    return rowOf(p) === rowOf(cell) ? `There's already a ${n} in row ${rowOf(cell) + 1}` : `There's already a ${n} in column ${colOf(cell) + 1}`;
  }
  return `A ${n} can't go there`;
}

function spend(s: RunState, tool: ToolId): string | null {
  if (s.gold < TOOLS[tool]) return `Not enough gold: it costs ${TOOLS[tool]}`;
  s.gold -= TOOLS[tool];
  return null;
}

export function act(prev: RunState, a: RunAction): ActResult {
  if (prev.phase !== 'arrange') return refuse(prev, 'The run is over');
  const s = clone(prev);
  const page = pageOf(s.seed);
  switch (a.type) {
    case 'place': {
      const t = s.tokens.find((x) => x.id === a.id);
      if (!t) return refuse(prev, 'No such number');
      if (a.cell === t.cell) return { state: prev, ok: true };
      if (a.cell < 0) { t.cell = -1; return { state: s, ok: true }; }
      if (a.cell >= CELLS) return refuse(prev, 'Off the page');
      if (page.stones[a.cell]) return refuse(prev, 'That number is printed on the page');
      const values = valuesOf(prev);
      const from = t.cell;
      if (from >= 0) values[from] = 0;
      values[a.cell] = 0;
      if (!isLegal(page, values, a.cell, t.n)) return refuse(prev, conflictLine(page, values, a.cell, t.n));
      values[a.cell] = t.n;
      const occupant = s.tokens.find((x) => x.cell === a.cell && x.id !== t.id);
      t.cell = a.cell;
      if (occupant) occupant.cell = from >= 0 && isLegal(page, values, from, occupant.n) ? from : -1;
      return { state: s, ok: true };
    }

    case 'redraw': {
      const loose = s.tokens.filter((t) => t.round === s.round && t.cell < 0);
      if (!loose.length) return refuse(prev, 'Every number dealt this round is on the page');
      const bag = s.bag.slice();
      for (const t of loose) bag[t.n]!++;
      if (bagCount(bag) <= loose.length) return refuse(prev, 'There are no other numbers left to deal');
      const why = spend(s, 'redraw');
      if (why) return refuse(prev, why);
      s.redraws++;
      const stay = s.tokens.filter((t) => !loose.includes(t));
      const holdingWith = (drawn: number[]): Holding => ({
        kept: stay.filter((t) => t.round < s.round).map((t) => t.n),
        dealt: [...stay.filter((t) => t.round === s.round).map((t) => t.n), ...drawn],
        need: s.need,
      });
      // A redraw keeps the round's promises: the required commission stays possible whichever
      // numbers you place, and all three commissions stay possible together.
      const required = s.posted.find((p) => p.required);
      const goals = s.posted.map((p) => p.c);
      let pick: { drawn: number[]; bag: number[] } | null = null;
      for (let attempt = 0; attempt < 16 && !pick; attempt++) {
        const tag = `${s.round}:${s.redraws}:${attempt}`;
        const d = draw(bag, loose.length, stream(s.seed, `deal:${tag}`));
        const h = holdingWith(d.drawn);
        const check = stream(s.seed, `redraw-check:${tag}`);
        if (required && !possible(page, h, required.c, check, true)) continue;
        const found = findLayout(page, h, goals, check);
        if (found) { pick = d; s.proof = found; }
      }
      if (!pick) return refuse(prev, 'No other deal would keep all three commissions possible');
      s.bag = pick.bag;
      s.tokens = [...stay, ...giveTokens(s, pick.drawn)];
      return { state: s, ok: true };
    }

    case 'lens': {
      if (a.cell < 0 || a.cell >= CELLS || page.stones[a.cell]) return refuse(prev, 'Choose an empty cell');
      if (tokenAt(s, a.cell)) return refuse(prev, 'Choose an empty cell');
      if (s.revealed.includes(a.cell)) return refuse(prev, 'The Lens has already shown that cell');
      const why = spend(s, 'lens');
      if (why) return refuse(prev, why);
      s.revealed.push(a.cell);
      return { state: s, ok: true };
    }

    case 'blotter': {
      if (s.blotter) return refuse(prev, 'The Blotter is already down this round');
      if (s.round === RUN.rounds) return refuse(prev, 'The final round has nothing to blot');
      const why = spend(s, 'blotter');
      if (why) return refuse(prev, why);
      s.blotter = true;
      return { state: s, ok: true };
    }

    case 'ink': {
      const blocked = inkBlocker(s);
      if (blocked) return refuse(prev, blocked);
      const view = viewNow(s);
      const required = s.posted.find((p) => p.required);
      const met = required ? isMet(required.c, view) : null;
      const won = s.posted.filter((p) => !p.required && isMet(p.c, view));
      const inkSpilled = met === false && !s.blotter ? 1 : 0;
      const record: RoundRecord = {
        round: s.round, required: met, blotted: met === false && s.blotter, inkSpilled,
        bounties: won.length, bountyGold: won.reduce((g, p) => g + p.gold, 0),
        seals: view.sealed.size, sealGold: view.sealed.size * RUN.sealGold,
      };
      s.records.push(record);
      s.ink -= inkSpilled;
      s.gold += record.bountyGold + record.sealGold;
      // Unplaced numbers go back to the bag.
      for (const t of s.tokens) if (t.cell < 0) s.bag[t.n]!++;
      s.tokens = s.tokens.filter((t) => t.cell >= 0);
      if (s.ink <= 0) { s.phase = 'ruined'; return { state: s, ok: true, inked: record }; }
      if (s.round >= RUN.rounds) { s.phase = 'done'; return { state: s, ok: true, inked: record }; }
      const lastRequired = required?.c.kind;
      s.round++;
      return { state: startRound(s, lastRequired), ok: true, inked: record };
    }
  }
}

/** Replays a run from its seed and actions; refused actions are skipped, as they were in play. */
export function replay(seed: string, actions: readonly RunAction[], daily?: string): RunState {
  let s = newRun(seed, daily);
  for (const a of actions) s = act(s, a).state;
  return s;
}
