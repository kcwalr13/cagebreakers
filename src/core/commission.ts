/**
 * Commissions: plain sentences about the page, each true or false at a glance. Every round
 * posts three, one required. Before posting, the game proves each one possible by finding
 * layouts of the numbers you'll hold that meet it (any subset of the hidden solution is a
 * legal layout), and sets thresholds from how many such layouts reach them.
 */
import {
  BIG_CAGE_BONUS, BOUNTY_FROM, BOUNTY_GOLD, type CommissionKind, DIFFICULTY, FINAL_SEALS, GATED_KINDS, REQUIRED_FROM, THRESHOLD_RANGE,
  VARIANTS,
} from '../content/commissions';
import { CELLS, SIZE, colOf, rowOf } from './grid';
import type { Op, Page } from './page';
import type { Rng } from './rng';
import { sealedCages } from './rules';

export type Axis = 'row' | 'col';
export type Zone = 'top' | 'bottom' | 'left' | 'right';

/** Lines are 0-based here and 1-based in every sentence the player reads. */
export type Commission =
  | { kind: 'line-min'; axis: Axis; line: number; min: number }
  | { kind: 'line-max'; axis: Axis; line: number; max: number }
  | { kind: 'no-number'; axis: Axis; line: number; n: number }
  | { kind: 'zone'; n: number; zone: Zone }
  | { kind: 'seal-count'; count: number }
  | { kind: 'seal-op'; op: Op }
  | { kind: 'seal-cage'; cage: number }
  | { kind: 'empty-cage'; cage: number }
  | { kind: 'line-count-max'; axis: Axis; line: number; max: number }
  | { kind: 'fill-line'; axis: Axis; line: number }
  | { kind: 'equal-lines'; axis: Axis; a: number; b: number; min: number }
  | { kind: 'no-seal-line'; axis: Axis; line: number }
  | { kind: 'diagonal-min'; min: number }
  | { kind: 'rising'; line: number; count: number }
  | { kind: 'parity-line'; axis: Axis; line: number; even: boolean; count: number }
  | { kind: 'fill-page' }
  | { kind: 'seal-all' }
  | { kind: 'corners-min'; min: number }
  | { kind: 'quarter-min'; quarter: Quarter; min: number }
  | { kind: 'seal-op-count'; op: Op; count: number };

export type Quarter = 'tl' | 'tr' | 'bl' | 'br';

/** A commission as posted for a round: required ones spill ink when missed; bounties pay gold. */
export interface Posted { c: Commission; required: boolean; gold: number }

/** What commissions are judged against: every number on the page (stones included) and the cages they seal. */
export interface View { page: Page; values: readonly number[]; sealed: ReadonlySet<number> }
export const viewOf = (page: Page, values: readonly number[]): View => ({ page, values, sealed: sealedCages(page, values) });

// ---- Geometry ---------------------------------------------------------------------------------

const LINES: Record<Axis, readonly (readonly number[])[]> = {
  row: Array.from({ length: SIZE }, (_, line) => Array.from({ length: SIZE }, (_, i) => line * SIZE + i)),
  col: Array.from({ length: SIZE }, (_, line) => Array.from({ length: SIZE }, (_, i) => i * SIZE + line)),
};
/** The cells of a row or column, top to bottom or left to right. Shared: don't mutate. */
export const lineCells = (axis: Axis, line: number): readonly number[] => LINES[axis][line]!;
const DIAGONAL = Array.from({ length: SIZE }, (_, i) => i * SIZE + i);
const CORNERS = [0, SIZE - 1, CELLS - SIZE, CELLS - 1];
const QUARTERS: Record<Quarter, readonly number[]> = {
  tl: Array.from({ length: CELLS }, (_, c) => c).filter((c) => rowOf(c) < 3 && colOf(c) < 3),
  tr: Array.from({ length: CELLS }, (_, c) => c).filter((c) => rowOf(c) < 3 && colOf(c) >= 3),
  bl: Array.from({ length: CELLS }, (_, c) => c).filter((c) => rowOf(c) >= 3 && colOf(c) < 3),
  br: Array.from({ length: CELLS }, (_, c) => c).filter((c) => rowOf(c) >= 3 && colOf(c) >= 3),
};
const QUARTER_WORD: Record<Quarter, string> = { tl: 'top-left', tr: 'top-right', bl: 'bottom-left', br: 'bottom-right' };
const IN_ZONE: Record<Zone, (cell: number) => boolean> = {
  top: (c) => rowOf(c) < 3, bottom: (c) => rowOf(c) >= 3, left: (c) => colOf(c) < 3, right: (c) => colOf(c) >= 3,
};
const ZONE_WORD: Record<Zone, string> = { top: 'top half', bottom: 'bottom half', left: 'left half', right: 'right half' };
const OP_WORD: Record<Op, string> = { '+': '+', '×': '×', '−': '−', '÷': '÷' };

const total = (v: View, cells: readonly number[]) => cells.reduce((s, c) => s + v.values[c]!, 0);
const filled = (v: View, cells: readonly number[]) => cells.reduce((s, c) => s + (v.values[c] ? 1 : 0), 0);
const lineName = (axis: Axis, line: number) => `${axis === 'row' ? 'Row' : 'Column'} ${line + 1}`;
const touches = (page: Page, cage: number, axis: Axis, line: number) =>
  page.cages[cage]!.cells.some((c) => (axis === 'row' ? rowOf(c) : colOf(c)) === line);

/** A cage's label as printed, with its row when another cage shares the label. */
export function cageName(page: Page, id: number): string {
  const cage = page.cages[id]!;
  const label = `${cage.target}${cage.op}`;
  const twins = page.cages.filter((c) => `${c.target}${c.op}` === label).length;
  return twins > 1 ? `the ${label} cage in row ${rowOf(cage.cells[0]!) + 1}` : `the ${label} cage`;
}

// ---- Judging ----------------------------------------------------------------------------------

/** The quantity a commission is about: a total or count for threshold kinds, 1 or 0 for yes-or-no kinds. */
export function measure(c: Commission, v: View): number {
  const { page, values, sealed } = v;
  switch (c.kind) {
    case 'line-min': case 'line-max': return total(v, lineCells(c.axis, c.line));
    case 'line-count-max': return filled(v, lineCells(c.axis, c.line));
    case 'diagonal-min': return total(v, DIAGONAL);
    case 'seal-count': return sealed.size;
    case 'no-number': return lineCells(c.axis, c.line).some((x) => values[x] === c.n) ? 0 : 1;
    case 'zone': {
      let all = 0, inside = 0;
      for (let x = 0; x < CELLS; x++) if (values[x] === c.n) { all++; if (IN_ZONE[c.zone](x)) inside++; }
      return all > 0 && inside === all ? 1 : 0;
    }
    case 'seal-op': return [...sealed].some((id) => page.cages[id]!.op === c.op) ? 1 : 0;
    case 'seal-cage': return sealed.has(c.cage) ? 1 : 0;
    case 'empty-cage': return page.cages[c.cage]!.cells.every((x) => page.stones[x] || !values[x]) ? 1 : 0;
    case 'fill-line': return filled(v, lineCells(c.axis, c.line)) === SIZE ? 1 : 0;
    case 'equal-lines': {
      const a = total(v, lineCells(c.axis, c.a)), b = total(v, lineCells(c.axis, c.b));
      return a === b && a >= c.min ? 1 : 0;
    }
    case 'no-seal-line': return [...sealed].some((id) => touches(page, id, c.axis, c.line)) ? 0 : 1;
    case 'rising': {
      const nums = lineCells('col', c.line).map((x) => values[x]!).filter((n) => n);
      return nums.length >= c.count && nums.every((n, i) => i === 0 || n > nums[i - 1]!) ? 1 : 0;
    }
    case 'parity-line': {
      const nums = lineCells(c.axis, c.line).map((x) => values[x]!).filter((n) => n);
      return nums.length >= c.count && nums.every((n) => (n % 2 === 0) === c.even) ? 1 : 0;
    }
    case 'fill-page': return values.every((n) => n) ? 1 : 0;
    case 'seal-all': return sealed.size === page.cages.length ? 1 : 0;
    case 'corners-min': return total(v, CORNERS);
    case 'quarter-min': return total(v, QUARTERS[c.quarter]);
    case 'seal-op-count': return [...sealed].filter((id) => page.cages[id]!.op === c.op).length;
  }
}

export function isMet(c: Commission, v: View): boolean {
  const m = measure(c, v);
  switch (c.kind) {
    case 'line-min': case 'diagonal-min': case 'corners-min': case 'quarter-min': return m >= c.min;
    case 'line-max': case 'line-count-max': return m <= c.max;
    case 'seal-count': case 'seal-op-count': return m >= c.count;
    default: return m === 1;
  }
}

/** The commission as one sentence. */
export function describe(c: Commission, page: Page): string {
  switch (c.kind) {
    case 'line-min': return `${lineName(c.axis, c.line)} adds to ${c.min} or more`;
    case 'line-max': return `${lineName(c.axis, c.line)} adds to ${c.max} or less`;
    case 'no-number': return `No ${c.n} in ${lineName(c.axis, c.line).toLowerCase()}`;
    case 'zone': return `Every ${c.n} sits in the ${ZONE_WORD[c.zone]}`;
    case 'seal-count': return `Seal ${c.count} ${c.count === 1 ? 'cage' : 'cages'}`;
    case 'seal-op': return `Seal a ${OP_WORD[c.op]} cage`;
    case 'seal-cage': return `Seal ${cageName(page, c.cage)}`;
    case 'empty-cage': return `Leave ${cageName(page, c.cage)} empty`;
    case 'line-count-max': return `${lineName(c.axis, c.line)} holds ${c.max} ${c.max === 1 ? 'number' : 'numbers'} or fewer`;
    case 'fill-line': return `Fill ${lineName(c.axis, c.line).toLowerCase()}`;
    case 'equal-lines': return `${c.axis === 'row' ? 'Rows' : 'Columns'} ${c.a + 1} and ${c.b + 1} add to the same total, ${c.min} or more`;
    case 'no-seal-line': return `No sealed cage touches ${lineName(c.axis, c.line).toLowerCase()}`;
    case 'diagonal-min': return `The long diagonal adds to ${c.min} or more`;
    case 'rising': return `Column ${c.line + 1} rises from top to bottom, ${c.count} numbers or more`;
    case 'parity-line': return `Only ${c.even ? 'even' : 'odd'} numbers in ${lineName(c.axis, c.line).toLowerCase()}, ${c.count} or more`;
    case 'fill-page': return 'Fill every cell';
    case 'seal-all': return 'Seal every cage';
    case 'corners-min': return `The four corners add to ${c.min} or more`;
    case 'quarter-min': return `The ${QUARTER_WORD[c.quarter]} quarter adds to ${c.min} or more`;
    case 'seal-op-count': return `Seal ${c.count} ${OP_WORD[c.op]} cages`;
  }
}

/** Where the page stands on a commission, in a few words. */
export function readout(c: Commission, v: View): string {
  const m = measure(c, v);
  switch (c.kind) {
    case 'line-min': case 'line-max': case 'diagonal-min': case 'corners-min': case 'quarter-min': return `now ${m}`;
    case 'seal-op-count': return `${m} sealed`;
    case 'line-count-max': return `${m} now`;
    case 'seal-count': return `${m} sealed`;
    case 'no-number': return m ? 'clear' : `a ${c.n} is there`;
    case 'zone': {
      let all = 0, inside = 0;
      for (let x = 0; x < CELLS; x++) if (v.values[x] === c.n) { all++; if (IN_ZONE[c.zone](x)) inside++; }
      return all ? `${inside} of ${all}` : `no ${c.n} yet`;
    }
    case 'seal-op': case 'seal-cage': return m ? 'sealed' : 'not yet';
    case 'empty-cage': return m ? 'empty' : 'not empty';
    case 'fill-line': return `${filled(v, lineCells(c.axis, c.line))} of ${SIZE}`;
    case 'equal-lines': return `${total(v, lineCells(c.axis, c.a))} and ${total(v, lineCells(c.axis, c.b))}`;
    case 'no-seal-line': return m ? 'clear' : 'a seal touches it';
    case 'rising': case 'parity-line': return m ? 'yes' : 'not yet';
    case 'fill-page': return `${v.values.filter((n) => n).length} of ${CELLS}`;
    case 'seal-all': return `${v.sealed.size} of ${v.page.cages.length}`;
  }
}

/** The cells a commission is about, for lighting them up on the page. */
export function cellsOf(c: Commission, page: Page): number[] {
  switch (c.kind) {
    case 'line-min': case 'line-max': case 'no-number': case 'line-count-max': case 'fill-line': case 'no-seal-line': case 'parity-line':
      return [...lineCells(c.axis, c.line)];
    case 'equal-lines': return [...lineCells(c.axis, c.a), ...lineCells(c.axis, c.b)];
    case 'rising': return [...lineCells('col', c.line)];
    case 'diagonal-min': return DIAGONAL.slice();
    case 'corners-min': return CORNERS.slice();
    case 'quarter-min': return [...QUARTERS[c.quarter]];
    case 'seal-op-count': return page.cages.filter((g) => g.op === c.op).flatMap((g) => g.cells);
    case 'zone': return Array.from({ length: CELLS }, (_, x) => x).filter(IN_ZONE[c.zone]);
    case 'seal-cage': case 'empty-cage': return page.cages[c.cage]!.cells.slice();
    case 'seal-op': return page.cages.filter((g) => g.op === c.op).flatMap((g) => g.cells);
    default: return [];
  }
}

// ---- Proving commissions possible ---------------------------------------------------------------

/** What the player will hold this round: numbers from earlier rounds (all must stay), and the new deal. */
export interface Holding { kept: readonly number[]; dealt: readonly number[]; need: number }

/** Every distinct set of numbers the player could end the round with. */
export function choices(h: Holding): number[][] {
  const seen = new Map<string, number[]>();
  const d = h.dealt;
  for (let mask = 0; mask < 1 << d.length; mask++) {
    const pick = d.filter((_, i) => mask & (1 << i));
    if (pick.length < h.need) continue;
    const all = [...h.kept, ...pick].sort((a, b) => a - b);
    seen.set(all.join(','), all);
  }
  return [...seen.values()];
}

const openByValueCache = new WeakMap<Page, number[][]>();
function openByValue(page: Page): number[][] {
  let out = openByValueCache.get(page);
  if (!out) {
    out = Array.from({ length: 7 }, () => [] as number[]);
    for (let c = 0; c < CELLS; c++) if (!page.stones[c]) out[page.solution[c]!]!.push(c);
    openByValueCache.set(page, out);
  }
  return out;
}

/**
 * A legal layout of these numbers: each number goes to a cell where the hidden solution holds
 * it. Every subset of a Latin square is legal, so this always works.
 */
export function sampleLayout(page: Page, numbers: readonly number[], rng: Rng): number[] {
  const values = page.stones.slice();
  const counts = new Array<number>(7).fill(0);
  for (const n of numbers) counts[n]!++;
  const byValue = openByValue(page);
  for (let n = 1; n <= 6; n++) {
    const cells = byValue[n]!.slice();
    const k = Math.min(counts[n]!, cells.length);
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rng.next() * (cells.length - i));
      [cells[i], cells[j]] = [cells[j]!, cells[i]!];
      values[cells[i]!] = n;
    }
  }
  return values;
}

type Direction = 'min' | 'max' | 'bool';
interface Candidate {
  kind: CommissionKind;
  dir: Direction;
  make: (t: number) => Commission;
  /** May be posted as the required commission this round, or as a bounty. */
  req: boolean;
  bty: boolean;
}

function candidates(page: Page, round: number, enabled: readonly CommissionKind[]): Candidate[] {
  const out: Candidate[] = [];
  const add = (kind: CommissionKind, dir: Direction, make: (t: number) => Commission) => {
    if (GATED_KINDS.includes(kind) && !enabled.includes(kind)) return;
    const req = (REQUIRED_FROM[kind] ?? 99) <= round, bty = (BOUNTY_FROM[kind] ?? 99) <= round;
    if (req || bty) out.push({ kind, dir, make, req, bty });
  };
  const lines = [0, 1, 2, 3, 4, 5];
  for (const axis of ['row', 'col'] as Axis[]) for (const line of lines) {
    add('line-min', 'min', (t) => ({ kind: 'line-min', axis, line, min: t }));
    add('line-max', 'max', (t) => ({ kind: 'line-max', axis, line, max: t }));
    add('line-count-max', 'max', (t) => ({ kind: 'line-count-max', axis, line, max: t }));
    add('fill-line', 'bool', () => ({ kind: 'fill-line', axis, line }));
    add('no-seal-line', 'bool', () => ({ kind: 'no-seal-line', axis, line }));
    for (let n = 1; n <= 6; n++) add('no-number', 'bool', () => ({ kind: 'no-number', axis, line, n }));
    for (const even of [true, false]) for (const count of VARIANTS.parityCount) {
      add('parity-line', 'bool', () => ({ kind: 'parity-line', axis, line, even, count }));
    }
    for (const b of lines) if (b > line) for (const min of VARIANTS.equalLinesMin) {
      add('equal-lines', 'bool', () => ({ kind: 'equal-lines', axis, a: line, b, min }));
    }
  }
  for (const line of lines) for (const count of VARIANTS.risingCount) add('rising', 'bool', () => ({ kind: 'rising', line, count }));
  for (let n = 1; n <= 6; n++) for (const zone of ['top', 'bottom', 'left', 'right'] as Zone[]) {
    add('zone', 'bool', () => ({ kind: 'zone', n, zone }));
  }
  add('seal-count', 'min', (t) => ({ kind: 'seal-count', count: t }));
  add('diagonal-min', 'min', (t) => ({ kind: 'diagonal-min', min: t }));
  add('corners-min', 'min', (t) => ({ kind: 'corners-min', min: t }));
  for (const quarter of ['tl', 'tr', 'bl', 'br'] as Quarter[]) add('quarter-min', 'min', (t) => ({ kind: 'quarter-min', quarter, min: t }));
  for (const op of [...new Set(page.cages.map((g) => g.op))]) {
    add('seal-op', 'bool', () => ({ kind: 'seal-op', op }));
    add('seal-op-count', 'min', (t) => ({ kind: 'seal-op-count', op, count: t }));
  }
  for (const cage of page.cages) {
    add('seal-cage', 'bool', () => ({ kind: 'seal-cage', cage: cage.id }));
    if (cage.cells.filter((c) => !page.stones[c]).length >= VARIANTS.emptyCageOpen) add('empty-cage', 'bool', () => ({ kind: 'empty-cage', cage: cage.id }));
  }
  return out;
}

/** The value a share of samples reach, counting from the best end of a sorted list. */
const fromTop = (sorted: number[], share: number) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))]!;

interface Judged {
  c: Commission; kind: CommissionKind; worstRate: number; bestRate: number; meanRate: number; metNow: boolean;
  /** Indexes of the sampled layouts that meet it (bounties only). */
  meetsIn?: number[];
}

const meetsFn = (dir: Direction, t: number) =>
  dir === 'min' ? (m: number) => m >= t : dir === 'max' ? (m: number) => m <= t : (m: number) => m === 1;

/** How often each set of numbers' sampled layouts meet a threshold. */
function rateStats(stats: number[][], meets: (m: number) => boolean) {
  const rates = stats.map((s) => s.filter(meets).length / s.length);
  return {
    worstRate: Math.min(...rates), bestRate: Math.max(...rates),
    meanRate: rates.reduce((a, b) => a + b, 0) / rates.length,
  };
}

/**
 * Sets a required commission's threshold and measures how often sampled layouts meet it.
 * `stats` holds, for each set of numbers you could hold, the candidate's measure on each layout.
 */
function judgeRequired(cand: Candidate, stats: number[][], now: View): Judged | null {
  let t = 0;
  if (cand.dir !== 'bool') {
    const per = stats.map((s) => fromTop(s.slice().sort((a, b) => (cand.dir === 'min' ? b - a : a - b)), DIFFICULTY.requiredShare));
    // It must suit the worst set of numbers you could keep.
    t = cand.dir === 'min' ? Math.min(...per) : Math.max(...per);
    const [lo, hi] = THRESHOLD_RANGE[cand.kind]!.required;
    if (t < lo || t > hi) return null;
  }
  const c = cand.make(t);
  return { c, kind: cand.kind, ...rateStats(stats, meetsFn(cand.dir, t)), metNow: isMet(c, now) };
}

/**
 * Sets a bounty's threshold so it's ambitious, yet met by at least one layout in `anchor`: the
 * sampled layouts that already meet every commission chosen so far. That layout proves all of
 * them can be met at once.
 */
function judgeBounty(cand: Candidate, stats: number[][], flat: (i: number) => number, anchor: readonly number[], now: View): Judged | null {
  let t = 0;
  if (cand.dir !== 'bool') {
    const per = stats.map((s) => fromTop(s.slice().sort((a, b) => (cand.dir === 'min' ? b - a : a - b)), DIFFICULTY.bountyShare));
    let best = cand.dir === 'min' ? -Infinity : Infinity;
    for (const i of anchor) best = cand.dir === 'min' ? Math.max(best, flat(i)) : Math.min(best, flat(i));
    // As ambitious as the best set of numbers allows, but no further than the anchor layouts reach.
    t = cand.dir === 'min' ? Math.min(Math.max(...per), best) : Math.max(Math.min(...per), best);
    const [lo, hi] = THRESHOLD_RANGE[cand.kind]!.bounty;
    if (!Number.isFinite(t) || t < lo || t > hi) return null;
  }
  const meets = meetsFn(cand.dir, t);
  const meetsIn = anchor.filter((i) => meets(flat(i)));
  if (!meetsIn.length) return null;
  const c = cand.make(t);
  return { c, kind: cand.kind, ...rateStats(stats, meets), metNow: isMet(c, now), meetsIn };
}

export interface PostInput {
  page: Page;
  round: number;
  final: boolean;
  holding: Holding;
  /** The page as it stands before this round's numbers go in. */
  now: View;
  /** Last round's required kind, so the same kind rarely comes twice running. */
  lastRequired?: CommissionKind;
  /** Kinds that only appear once a station has brought them, enabled for this run. */
  kinds?: readonly CommissionKind[];
}

/** A round's commissions, and a legal layout of numbers you'll hold that meets all of them at once. */
export interface RoundPlan { posted: Posted[]; proof: number[] }

/**
 * Plans a round's commissions: one required and two bounties. The required one can be met
 * whichever dealt numbers you place; all three together can be met by placing the right ones,
 * and `proof` is such a layout. Deterministic for the rng it's given.
 */
export function planRound(input: PostInput, rng: Rng): RoundPlan {
  const { page, final } = input;
  if (final) {
    const most = Math.max(1, Math.ceil(page.cages.length * FINAL_SEALS.share));
    return {
      posted: [
        { c: { kind: 'fill-page' }, required: true, gold: 0 },
        { c: { kind: 'seal-count', count: most }, required: false, gold: FINAL_SEALS.gold },
        { c: { kind: 'seal-all' }, required: false, gold: BOUNTY_GOLD['seal-all'] },
      ],
      proof: page.solution.slice(),
    };
  }
  // A thin early page can leave too few sampled layouts to fit two bounties beside the required
  // one; then the round is planned again from a wider sample.
  const first = planFrom(input, rng, DIFFICULTY.samples);
  if (first.posted.length >= 3) return first;
  const wider = planFrom(input, rng, DIFFICULTY.samples * 5);
  return wider.posted.length > first.posted.length ? wider : first;
}

function planFrom(input: PostInput, rng: Rng, samples: number): RoundPlan {
  const { page, round, holding, now } = input;
  const views = choices(holding).map((set) =>
    Array.from({ length: samples }, () => viewOf(page, sampleLayout(page, set, rng))));
  const all = views.flat();
  const pool = candidates(page, round, input.kinds ?? []);
  const statsCache = new Map<Candidate, number[][]>();
  const statsOf = (cand: Candidate) => {
    let s = statsCache.get(cand);
    if (!s) {
      const probe = cand.make(cand.dir === 'max' ? 99 : 0);
      s = views.map((vs) => vs.map((v) => measure(probe, v)));
      statsCache.set(cand, s);
    }
    return s;
  };
  const flatOf = (cand: Candidate) => { const s = statsOf(cand); return (i: number) => s[Math.floor(i / samples)]![i % samples]!; };

  /**
   * Picks a kind at random among those with a usable commission, then one commission of that
   * kind. Kinds are tried in a shuffled order, which is the same as choosing uniformly among the
   * usable ones, without judging every candidate. A kind whose usable commissions the page
   * already meets is taken only now and then, so a round rarely asks for what's already done.
   */
  const choose = (mine: Candidate[], last: CommissionKind | undefined, judgeOne: (c: Candidate) => Judged | null,
    weight: (j: Judged) => number): Judged | null => {
    let kinds = rng.shuffle([...new Set(mine.map((c) => c.kind))]);
    if (last) kinds = [...kinds.filter((k) => k !== last), ...kinds.filter((k) => k === last)];
    let given: Judged | null = null;
    for (const kind of kinds) {
      const ok = mine.filter((c) => c.kind === kind).map(judgeOne).filter((j): j is Judged => !!j);
      if (!ok.length) continue;
      const fresh = ok.filter((j) => !j.metNow);
      if (fresh.length) return rng.weighted(fresh.map((j) => [j, Math.max(0.001, weight(j))] as const));
      given ??= rng.pick(ok);
      if (rng.next() < DIFFICULTY.alreadyMetWeight) return given;
    }
    return given;
  };

  // The required commission: possible whichever dealt numbers you keep, and not a given.
  const required = choose(pool.filter((c) => c.req), input.lastRequired, (cand) => {
    const j = judgeRequired(cand, statsOf(cand), now);
    return j && j.worstRate >= DIFFICULTY.requiredMinRate && j.worstRate <= DIFFICULTY.requiredMaxRate ? j : null;
  }, () => 1);
  const meetsRequired = required ? all.flatMap((v, i) => (isMet(required.c, v) ? [i] : [])) : all.map((_, i) => i);

  // Two bounties of other kinds, each ambitious, all three met together by some sampled layout.
  const same = (a: Commission, b: Commission) => JSON.stringify(a) === JSON.stringify(b);
  const bountyFor = (anchor: readonly number[], taken: readonly Commission[], distinct: boolean, maxRate: number) => choose(
    pool.filter((c) => c.bty && !(distinct && taken.some((t) => t.kind === c.kind))), undefined,
    (cand) => {
      const j = judgeBounty(cand, statsOf(cand), flatOf(cand), anchor, now);
      return j && j.meanRate <= maxRate && !j.metNow && !taken.some((t) => same(t, j.c)) ? j : null;
    },
    (j) => 0.2 + j.bestRate,
  );
  // Ambitious bounties of new kinds first. A thin early page sometimes can't fit two beside the
  // required commission; then a gentler bounty, and then a second of the same kind, will do.
  const levels = [
    { distinct: true, maxRate: DIFFICULTY.bountyMaxRate },
    { distinct: true, maxRate: DIFFICULTY.bountyFallbackRate },
    { distinct: false, maxRate: DIFFICULTY.bountyFallbackRate },
  ];
  const base: Commission[] = required ? [required.c] : [];
  let bounties: Judged[] = [];
  levels: for (const { distinct, maxRate } of levels) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const first = bountyFor(meetsRequired, base, distinct, maxRate);
      if (!first) break;
      const second = bountyFor(first.meetsIn!, [...base, first.c], distinct, maxRate);
      if (second) { bounties = [first, second]; break levels; }
      if (!bounties.length) bounties = [first];
    }
  }

  const anchor = bounties.length ? bounties[bounties.length - 1]!.meetsIn! : meetsRequired;
  const proof = (anchor.length ? all[anchor[0]!]! : all[0]!).values.slice();
  const posted: Posted[] = [];
  if (required) posted.push({ c: required.c, required: true, gold: 0 });
  for (const b of bounties) posted.push({ c: b.c, required: false, gold: goldFor(b.c, page) });
  return { posted, proof };
}

/** Posts a round's commissions; see planRound. */
export const postCommissions = (input: PostInput, rng: Rng): Posted[] => planRound(input, rng).posted;

export function goldFor(c: Commission, page: Page): number {
  const base = BOUNTY_GOLD[c.kind];
  return c.kind === 'seal-cage' && page.cages[c.cage]!.cells.length >= 4 ? base + BIG_CAGE_BONUS : base;
}

/**
 * Whether a commission can be met with these numbers, proven by finding a legal layout that
 * meets it: for every choice of dealt numbers when `everyChoice`, else for at least one. A
 * sampled search, so a rare layout can be missed; it never claims a commission possible when it isn't.
 */
export function possible(page: Page, holding: Holding, c: Commission, rng: Rng, everyChoice: boolean, samples = 120): boolean {
  const found = (set: number[]) => {
    for (let i = 0; i < samples; i++) if (isMet(c, viewOf(page, sampleLayout(page, set, rng)))) return true;
    return false;
  };
  const sets = choices(holding);
  return everyChoice ? sets.every(found) : sets.some(found);
}

/** How close a layout comes to a commission: 1 when met, less the further off it is. */
function closeness(c: Commission, v: View): number {
  if (isMet(c, v)) return 1;
  const m = measure(c, v);
  switch (c.kind) {
    case 'line-min': return m / c.min;
    case 'diagonal-min': return m / c.min;
    case 'seal-count': case 'seal-op-count': return m / c.count;
    case 'corners-min': case 'quarter-min': return m / c.min;
    case 'line-max': return c.max / Math.max(1, m);
    case 'line-count-max': return c.max / Math.max(1, m);
    default: return 0;
  }
}

/**
 * Searches for one legal layout of numbers you could hold that meets every commission at once:
 * random layouts on the hidden solution's cells, improved by moving one number at a time to
 * another cell where the solution has it. Returns the layout, or null if none turned up.
 */
export function findLayout(page: Page, holding: Holding, cs: readonly Commission[], rng: Rng, restarts = 6, steps = 120): number[] | null {
  const byValue = Array.from({ length: 7 }, () => [] as number[]);
  for (let c = 0; c < CELLS; c++) if (!page.stones[c]) byValue[page.solution[c]!]!.push(c);
  const score = (values: number[]) => { const v = viewOf(page, values); return cs.reduce((s, c) => s + closeness(c, v), 0); };
  for (const set of rng.shuffle(choices(holding))) {
    for (let r = 0; r < restarts; r++) {
      const values = sampleLayout(page, set, rng);
      let best = score(values);
      if (best >= cs.length) return values;
      for (let k = 0; k < steps; k++) {
        const n = rng.pick(set);
        const from = byValue[n]!.filter((c) => values[c] === n);
        const to = byValue[n]!.filter((c) => values[c] !== n);
        if (!from.length || !to.length) continue;
        const a = rng.pick(from), b = rng.pick(to);
        values[a] = 0; values[b] = n;
        const s = score(values);
        if (s >= best) { best = s; if (best >= cs.length) return values; }
        else { values[b] = 0; values[a] = n; }
      }
    }
  }
  return null;
}
