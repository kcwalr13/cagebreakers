/**
 * A run is a pure state machine: (state, action) → state. Several rounds on one page: each round
 * deals numbers from the bag and posts three commissions; you arrange the page and ink it. Bots
 * play thousands of runs through this module, and a run is reproducible from its seed, its setup
 * and its actions.
 */
import { BASE_TOOLS, RUN, TOOLS, type ToolId } from '../content/balance';
import type { CommissionKind } from '../content/commissions';
import { PAGE_VARIANTS, type PageVariant } from '../content/stations';
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
  /** Every number dealt this round was on the page, so the full-hand bonus was paid. */
  fullHand: boolean;
  fullHandGold: number;
}

export type RunPhase = 'arrange' | 'done' | 'ruined';

/**
 * Everything that shapes a run before it starts: the station's twist, the satchel and the
 * scriptorium's upgrades. Kept in the state, so a run replays from its seed, setup and actions.
 */
export interface RunSetup {
  /** The map station this run is for; null for the Daily Page and plain runs. */
  station: string | null;
  page: PageVariant;
  rounds: number;
  /** Numbers dealt each round before the last; the last round deals whatever is left. */
  deal: readonly number[];
  startInk: number;
  startGold: number;
  /** Score per drop of ink left at the end. */
  inkBonus: number;
  /** The tools carried this run. */
  tools: readonly ToolId[];
  /** Extra gold each bounty pays. */
  bountyBonus: number;
  /** Commission kinds a station has brought, enabled for this run. */
  kinds: readonly CommissionKind[];
}

/** A standard page with the standard tools and no upgrades: the Daily Page, and the default. */
export const STANDARD_SETUP: RunSetup = {
  station: null, page: 'standard', rounds: RUN.rounds, deal: RUN.deal, startInk: RUN.startInk, startGold: RUN.startGold,
  inkBonus: RUN.inkBonus, tools: BASE_TOOLS, bountyBonus: 0, kinds: [],
};

export interface RunState {
  v: 3;
  seed: string;
  /** An id the app gives each run, so its rewards are counted once. */
  id?: string;
  setup: RunSetup;
  /** Printed numbers the Eraser has lifted off the page. */
  erased: number[];
  /** Set this round by the Gilder: sealed cages pay double when the round is inked. */
  gilded: boolean;
  /** Set on a Daily Page run: the calendar day it belongs to. */
  daily?: string;
  /** 1 to setup.rounds. */
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
  | { type: 'quill' }
  | { type: 'gilder' }
  | { type: 'eraser'; cell: number }
  | { type: 'inkwell' }
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
function remember(key: string, make: () => Page): Page {
  let p = pages.get(key);
  if (!p) { p = make(); pages.set(key, p); if (pages.size > 16) pages.delete(pages.keys().next().value!); }
  return p;
}

/** The page a seed makes, for a kind of page. */
export function pageOf(seed: string, variant: PageVariant = 'standard'): Page {
  return remember(`${seed}|${variant}`, () => generatePage(seed, PAGE_VARIANTS[variant]));
}

/** The run's page as it stands: its kind of page, with any printed numbers the Eraser lifted. */
export function runPage(s: Pick<RunState, 'seed' | 'setup' | 'erased'>): Page {
  const base = pageOf(s.seed, s.setup.page);
  if (!s.erased.length) return base;
  return remember(`${s.seed}|${s.setup.page}|${s.erased.join(',')}`, () => {
    const stones = base.stones.slice();
    for (const c of s.erased) stones[c] = 0;
    return { ...base, stones };
  });
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
  return boardValues(runPage(s), placed);
}

export const viewNow = (s: RunState): View => viewOf(runPage(s), valuesOf(s));

/** For each posted commission, whether the page meets it right now. */
export const metNow = (s: RunState): boolean[] => { const v = viewNow(s); return s.posted.map((p) => isMet(p.c, v)); };

/** Cells a number could move to: legal for it once it leaves where it stands (swaps included). */
export function legalCells(s: RunState, id: number): number[] {
  const t = s.tokens.find((x) => x.id === id);
  if (!t) return [];
  const page = runPage(s);
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

/**
 * Where this round's numbers stand. New numbers are the ones dealt this round: at least `need` of
 * them go on the page, and placing all of them earns the full-hand bonus. Inked numbers (from
 * earlier rounds) must all be back on the page to ink.
 */
export interface Placement {
  dealt: number;
  placed: number;
  need: number;
  /** Inked numbers in your hand, which must go back on the page. */
  strays: number[];
  /** Gold for placing every new number; 0 when there's no choice (the final round). */
  bonus: number;
  /** Every new number is on the page and the bonus will be paid. */
  full: boolean;
}

export function placementOf(s: RunState): Placement {
  const fresh = dealtThisRound(s);
  const placed = fresh.filter((t) => t.cell >= 0).length;
  const final = s.round >= s.setup.rounds;
  const bonus = !final && fresh.length > s.need ? RUN.fullHandGold : 0;
  const strays = s.tokens.filter((t) => t.round < s.round && t.cell < 0).map((t) => t.n).sort((a, b) => a - b);
  return { dealt: fresh.length, placed, need: s.need, strays, bonus, full: bonus > 0 && placed === fresh.length };
}

/** Why the round can't be inked yet, or null when it can. */
export function inkBlocker(s: RunState): string | null {
  if (s.phase !== 'arrange') return 'The run is over';
  const p = placementOf(s);
  if (p.strays.length) {
    return p.strays.length === 1 ? `Put your inked ${p.strays[0]} back on the page` : `Put your ${p.strays.length} inked numbers back on the page`;
  }
  const short = p.need - p.placed;
  const final = s.round >= s.setup.rounds;
  if (short > 0) return short === 1 ? `Place 1 more${final ? '' : ' new'} number` : `Place ${short} more${final ? '' : ' new'} numbers`;
  return null;
}

export function scoreOf(s: RunState): { gold: number; ink: number; inkBonus: number; total: number } {
  const inkBonus = s.phase === 'done' ? s.ink * s.setup.inkBonus : 0;
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
  const page = runPage(s);
  const final = s.round === s.setup.rounds;
  const left = bagCount(s.bag);
  const want = final ? left : Math.min(s.setup.deal[s.round - 1] ?? 0, Math.max(0, left - RUN.finalReserve));
  const { drawn, bag } = draw(s.bag, want, stream(s.seed, `deal:${s.round}:0`));
  s.bag = bag;
  const kept = s.tokens.map((t) => t.n);
  s.tokens = [...s.tokens, ...giveTokens(s, drawn)];
  s.need = final ? drawn.length : Math.max(0, drawn.length - 1);
  s.redraws = 0;
  s.blotter = false;
  s.gilded = false;
  const plan = planRound({
    page, round: s.round, final,
    holding: { kept, dealt: drawn, need: s.need },
    now: viewOf(page, valuesOf(s)),
    lastRequired,
    kinds: s.setup.kinds,
  }, stream(s.seed, `commissions:${s.round}`));
  s.posted = plan.posted.map((p) => (p.required || final ? p : { ...p, gold: p.gold + s.setup.bountyBonus }));
  s.proof = plan.proof;
  return s;
}

export interface NewRunOptions { daily?: string; setup?: RunSetup; id?: string }

export function newRun(seed: string, opts: NewRunOptions = {}): RunState {
  const setup = opts.setup ?? STANDARD_SETUP;
  const page = pageOf(seed, setup.page);
  const bag = new Array<number>(7).fill(0);
  for (let c = 0; c < CELLS; c++) if (!page.stones[c]) bag[page.solution[c]!]!++;
  const s: RunState = {
    v: 3, seed, ...(opts.daily ? { daily: opts.daily } : {}), ...(opts.id ? { id: opts.id } : {}), setup, erased: [], gilded: false,
    round: 1, phase: 'arrange', ink: setup.startInk, gold: setup.startGold,
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
    setup: r.setup ?? STANDARD_SETUP,
    erased: r.erased ?? [],
    gilded: r.gilded ?? false,
    revealed: r.revealed ?? [],
    records: (r.records ?? []).map((x) => ({ ...x, fullHand: x.fullHand ?? false, fullHandGold: x.fullHandGold ?? 0 })),
  };
}

const clone = (s: RunState): RunState => ({
  ...s,
  bag: s.bag.slice(),
  tokens: s.tokens.map((t) => ({ ...t })),
  posted: s.posted.slice(),
  erased: s.erased.slice(),
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

export const TOOL_NAMES: Record<ToolId, string> = {
  redraw: 'Redraw', lens: 'Lens', blotter: 'Blotter', quill: 'Quill', gilder: 'Gilder', eraser: 'Eraser', inkwell: 'Inkwell',
};

function spend(s: RunState, tool: ToolId): string | null {
  if (!s.setup.tools.includes(tool)) return `You aren't carrying the ${TOOL_NAMES[tool]}`;
  if (s.gold < TOOLS[tool]) return `Not enough gold: it costs ${TOOLS[tool]}`;
  s.gold -= TOOLS[tool];
  return null;
}

export function act(prev: RunState, a: RunAction): ActResult {
  if (prev.phase !== 'arrange') return refuse(prev, 'The run is over');
  const s = clone(prev);
  const page = runPage(s);
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
      if (s.round === s.setup.rounds) return refuse(prev, 'The final round has nothing to blot');
      const why = spend(s, 'blotter');
      if (why) return refuse(prev, why);
      s.blotter = true;
      return { state: s, ok: true };
    }

    case 'quill': {
      if (s.round === s.setup.rounds) return refuse(prev, 'The final round has every number already');
      if (bagCount(s.bag) <= RUN.finalReserve) return refuse(prev, 'No spare numbers are left to draw');
      const why = spend(s, 'quill');
      if (why) return refuse(prev, why);
      // An extra number is optional, so every commission stays possible as it was.
      const { drawn, bag } = draw(s.bag, 1, stream(s.seed, `quill:${s.round}:${s.nextId}`));
      s.bag = bag;
      s.tokens = [...s.tokens, ...giveTokens(s, drawn)];
      return { state: s, ok: true };
    }

    case 'gilder': {
      if (s.gilded) return refuse(prev, 'The Gilder is already at work this round');
      const why = spend(s, 'gilder');
      if (why) return refuse(prev, why);
      s.gilded = true;
      return { state: s, ok: true };
    }

    case 'inkwell': {
      if (s.ink >= s.setup.startInk) return refuse(prev, 'Your ink is already full');
      const why = spend(s, 'inkwell');
      if (why) return refuse(prev, why);
      s.ink++;
      return { state: s, ok: true };
    }

    case 'eraser': {
      if (a.cell < 0 || a.cell >= CELLS || !page.stones[a.cell]) return refuse(prev, 'Choose a printed number');
      const why = spend(s, 'eraser');
      if (why) return refuse(prev, why);
      // The lifted number becomes yours: it stays where it was, can move, and must stay on the page.
      const n = page.stones[a.cell]!;
      s.erased.push(a.cell);
      s.tokens = [...s.tokens, { id: s.nextId++, n, round: 0, cell: a.cell }];
      // Keep the round's promises on the changed page, or refuse.
      const next = runPage(s);
      const holding: Holding = {
        kept: s.tokens.filter((t) => t.round < s.round).map((t) => t.n),
        dealt: dealtThisRound(s).map((t) => t.n),
        need: s.need,
      };
      const check = stream(s.seed, `eraser-check:${s.round}:${a.cell}`);
      const required = s.posted.find((p) => p.required);
      if (required && !possible(next, holding, required.c, check, true)) return refuse(prev, 'Lifting that number would make the required commission impossible');
      const v = viewOf(next, s.proof ?? []);
      if (!s.proof || !s.posted.every((p) => isMet(p.c, v))) {
        const found = findLayout(next, holding, s.posted.map((p) => p.c), check);
        if (!found) return refuse(prev, 'Lifting that number would make a commission impossible');
        s.proof = found;
      }
      return { state: s, ok: true };
    }

    case 'ink': {
      const blocked = inkBlocker(s);
      if (blocked) return refuse(prev, blocked);
      const view = viewNow(s);
      const placement = placementOf(s);
      const required = s.posted.find((p) => p.required);
      const met = required ? isMet(required.c, view) : null;
      const won = s.posted.filter((p) => !p.required && isMet(p.c, view));
      const inkSpilled = met === false && !s.blotter ? 1 : 0;
      const record: RoundRecord = {
        round: s.round, required: met, blotted: met === false && s.blotter, inkSpilled,
        bounties: won.length, bountyGold: won.reduce((g, p) => g + p.gold, 0),
        seals: view.sealed.size, sealGold: view.sealed.size * RUN.sealGold * (s.gilded ? 2 : 1),
        fullHand: placement.full, fullHandGold: placement.full ? placement.bonus : 0,
      };
      s.records.push(record);
      s.ink -= inkSpilled;
      s.gold += record.bountyGold + record.sealGold + record.fullHandGold;
      // Unplaced numbers go back to the bag.
      for (const t of s.tokens) if (t.cell < 0) s.bag[t.n]!++;
      s.tokens = s.tokens.filter((t) => t.cell >= 0);
      if (s.ink <= 0) { s.phase = 'ruined'; return { state: s, ok: true, inked: record }; }
      if (s.round >= s.setup.rounds) { s.phase = 'done'; return { state: s, ok: true, inked: record }; }
      const lastRequired = required?.c.kind;
      s.round++;
      return { state: startRound(s, lastRequired), ok: true, inked: record };
    }
  }
}

/** Replays a run from its seed, setup and actions; refused actions are skipped, as they were in play. */
export function replay(seed: string, actions: readonly RunAction[], opts: NewRunOptions = {}): RunState {
  let s = newRun(seed, opts);
  for (const a of actions) s = act(s, a).state;
  return s;
}
