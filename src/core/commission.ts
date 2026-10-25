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
import { gridOf } from './grid';
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

/**
 * The shapes commissions talk about, for one size of page. On an odd-sized page the halves and
 * the quarters leave out the middle row and column, so "the top half" of a 7×7 page is its top
 * three rows; sentences say so.
 */
interface Shapes {
  size: number;
  lines: Record<Axis, readonly (readonly number[])[]>;
  diagonal: readonly number[];
  corners: readonly number[];
  quarters: Record<Quarter, readonly number[]>;
  inZone: Record<Zone, (cell: number) => boolean>;
  /** Rows (or columns) in a half, and on a side of a quarter. */
  half: number;
}
const shapeCache = new Map<number, Shapes>();
function shapesOf(size: number): Shapes {
  let sh = shapeCache.get(size);
  if (sh) return sh;
  const g = gridOf(size);
  const half = Math.floor(size / 2), far = size - half;
  const top = (c: number) => g.rowOf(c) < half, bottom = (c: number) => g.rowOf(c) >= far;
  const left = (c: number) => g.colOf(c) < half, right = (c: number) => g.colOf(c) >= far;
  const range = Array.from({ length: size }, (_, i) => i);
  sh = {
    size, half,
    lines: {
      row: range.map((line) => range.map((i) => g.cellAt(line, i))),
      col: range.map((line) => range.map((i) => g.cellAt(i, line))),
    },
    diagonal: range.map((i) => g.cellAt(i, i)),
    corners: [0, size - 1, g.cells - size, g.cells - 1],
    quarters: {
      tl: g.all.filter((c) => top(c) && left(c)), tr: g.all.filter((c) => top(c) && right(c)),
      bl: g.all.filter((c) => bottom(c) && left(c)), br: g.all.filter((c) => bottom(c) && right(c)),
    },
    inZone: { top, bottom, left, right },
  };
  shapeCache.set(size, sh);
  return sh;
}
/** The cells of a row or column, top to bottom or left to right. Shared: don't mutate. */
export const lineCells = (size: number, axis: Axis, line: number): readonly number[] => shapesOf(size).lines[axis][line]!;

const WORDS = ['no', 'one', 'two', 'three', 'four'];
const QUARTER_WORD: Record<Quarter, string> = { tl: 'top-left', tr: 'top-right', bl: 'bottom-left', br: 'bottom-right' };
/** "the top half", or on an odd-sized page "the top three rows". */
function zoneWord(zone: Zone, size: number): string {
  if (size % 2 === 0) return `the ${zone} half`;
  const n = WORDS[Math.floor(size / 2)];
  return zone === 'top' || zone === 'bottom' ? `the ${zone} ${n} rows` : `the ${zone} ${n} columns`;
}
/** "The top-left quarter", or on an odd-sized page "The top-left 3×3 corner". */
function quarterWord(q: Quarter, size: number): string {
  const h = Math.floor(size / 2);
  return size % 2 === 0 ? `The ${QUARTER_WORD[q]} quarter` : `The ${QUARTER_WORD[q]} ${h}×${h} corner`;
}
const OP_WORD: Record<Op, string> = { '+': '+', '×': '×', '−': '−', '÷': '÷' };

const total = (v: View, cells: readonly number[]) => cells.reduce((s, c) => s + v.values[c]!, 0);
const filled = (v: View, cells: readonly number[]) => cells.reduce((s, c) => s + (v.values[c] ? 1 : 0), 0);
const lineName = (axis: Axis, line: number) => `${axis === 'row' ? 'Row' : 'Column'} ${line + 1}`;
const touches = (page: Page, cage: number, axis: Axis, line: number) => {
  const g = gridOf(page.size);
  return page.cages[cage]!.cells.some((c) => (axis === 'row' ? g.rowOf(c) : g.colOf(c)) === line);
};

/**
 * A cage's label as printed, with its row when another cage shares the label. Player-facing words
 * follow the garden: a cage is a plot, and a sealed cage is a plot in bloom.
 */
export function cageName(page: Page, id: number): string {
  const cage = page.cages[id]!;
  const label = `${cage.target}${cage.op}`;
  const twins = page.cages.filter((c) => `${c.target}${c.op}` === label).length;
  return twins > 1 ? `the ${label} plot in row ${gridOf(page.size).rowOf(cage.cells[0]!) + 1}` : `the ${label} plot`;
}

// ---- Judging ----------------------------------------------------------------------------------

/** The quantity a commission is about: a total or count for threshold kinds, 1 or 0 for yes-or-no kinds. */
export function measure(c: Commission, v: View): number {
  const { page, values, sealed } = v;
  const sh = shapesOf(page.size);
  const lineCells = (axis: Axis, line: number) => sh.lines[axis][line]!;
  switch (c.kind) {
    case 'line-min': case 'line-max': return total(v, lineCells(c.axis, c.line));
    case 'line-count-max': return filled(v, lineCells(c.axis, c.line));
    case 'diagonal-min': return total(v, sh.diagonal);
    case 'seal-count': return sealed.size;
    case 'no-number': return lineCells(c.axis, c.line).some((x) => values[x] === c.n) ? 0 : 1;
    case 'zone': {
      let all = 0, inside = 0;
      for (let x = 0; x < values.length; x++) if (values[x] === c.n) { all++; if (sh.inZone[c.zone](x)) inside++; }
      return all > 0 && inside === all ? 1 : 0;
    }
    case 'seal-op': return [...sealed].some((id) => page.cages[id]!.op === c.op) ? 1 : 0;
    case 'seal-cage': return sealed.has(c.cage) ? 1 : 0;
    case 'empty-cage': return page.cages[c.cage]!.cells.every((x) => page.stones[x] || !values[x]) ? 1 : 0;
    case 'fill-line': return filled(v, lineCells(c.axis, c.line)) === sh.size ? 1 : 0;
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
    case 'corners-min': return total(v, sh.corners);
    case 'quarter-min': return total(v, sh.quarters[c.quarter]);
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
    case 'zone': return `Every ${c.n} sits in ${zoneWord(c.zone, page.size)}`;
    case 'seal-count': return `Make ${c.count} ${c.count === 1 ? 'plot' : 'plots'} bloom`;
    case 'seal-op': return `Make a ${OP_WORD[c.op]} plot bloom`;
    case 'seal-cage': return `Make ${cageName(page, c.cage)} bloom`;
    case 'empty-cage': return `Leave ${cageName(page, c.cage)} empty`;
    case 'line-count-max': return `${lineName(c.axis, c.line)} holds ${c.max} ${c.max === 1 ? 'number' : 'numbers'} or fewer`;
    case 'fill-line': return `Fill ${lineName(c.axis, c.line).toLowerCase()}`;
    case 'equal-lines': return `${c.axis === 'row' ? 'Rows' : 'Columns'} ${c.a + 1} and ${c.b + 1} add to the same total, ${c.min} or more`;
    case 'no-seal-line': return `No blooming plot touches ${lineName(c.axis, c.line).toLowerCase()}`;
    case 'diagonal-min': return `The long diagonal adds to ${c.min} or more`;
    case 'rising': return `Column ${c.line + 1} rises from top to bottom, ${c.count} numbers or more`;
    case 'parity-line': return `Only ${c.even ? 'even' : 'odd'} numbers in ${lineName(c.axis, c.line).toLowerCase()}, ${c.count} or more`;
    case 'fill-page': return 'Fill every square';
    case 'seal-all': return 'Make every plot bloom';
    case 'corners-min': return `The four corners add to ${c.min} or more`;
    case 'quarter-min': return `${quarterWord(c.quarter, page.size)} adds to ${c.min} or more`;
    case 'seal-op-count': return `Make ${c.count} ${OP_WORD[c.op]} plots bloom`;
  }
}

/** Where the page stands on a commission, in a few words. */
export function readout(c: Commission, v: View): string {
  const m = measure(c, v);
  const sh = shapesOf(v.page.size);
  const lineCells = (axis: Axis, line: number) => sh.lines[axis][line]!;
  switch (c.kind) {
    case 'line-min': case 'line-max': case 'diagonal-min': case 'corners-min': case 'quarter-min': return `now ${m}`;
    case 'seal-op-count': return `${m} in bloom`;
    case 'line-count-max': return `${m} now`;
    case 'seal-count': return `${m} in bloom`;
    case 'no-number': return m ? 'clear' : `a ${c.n} is there`;
    case 'zone': {
      let all = 0, inside = 0;
      for (let x = 0; x < v.values.length; x++) if (v.values[x] === c.n) { all++; if (sh.inZone[c.zone](x)) inside++; }
      return all ? `${inside} of ${all}` : `no ${c.n} yet`;
    }
    case 'seal-op': case 'seal-cage': return m ? 'in bloom' : 'not yet';
    case 'empty-cage': return m ? 'empty' : 'not empty';
    case 'fill-line': return `${filled(v, lineCells(c.axis, c.line))} of ${sh.size}`;
    case 'equal-lines': return `${total(v, lineCells(c.axis, c.a))} and ${total(v, lineCells(c.axis, c.b))}`;
    case 'no-seal-line': return m ? 'clear' : 'a bloom touches it';
    case 'rising': case 'parity-line': return m ? 'yes' : 'not yet';
    case 'fill-page': return `${v.values.filter((n) => n).length} of ${v.values.length}`;
    case 'seal-all': return `${v.sealed.size} of ${v.page.cages.length}`;
  }
}

/** The cells a commission is about, for lighting them up on the page. */
export function cellsOf(c: Commission, page: Page): number[] {
  const sh = shapesOf(page.size);
  const lineCells = (axis: Axis, line: number) => sh.lines[axis][line]!;
  switch (c.kind) {
    case 'line-min': case 'line-max': case 'no-number': case 'line-count-max': case 'fill-line': case 'no-seal-line': case 'parity-line':
      return [...lineCells(c.axis, c.line)];
    case 'equal-lines': return [...lineCells(c.axis, c.a), ...lineCells(c.axis, c.b)];
    case 'rising': return [...lineCells('col', c.line)];
    case 'diagonal-min': return sh.diagonal.slice();
    case 'corners-min': return sh.corners.slice();
    case 'quarter-min': return [...sh.quarters[c.quarter]];
    case 'seal-op-count': return page.cages.filter((g) => g.op === c.op).flatMap((g) => g.cells);
    case 'zone': return gridOf(page.size).all.filter(sh.inZone[c.zone]);
    case 'seal-cage': case 'empty-cage': return page.cages[c.cage]!.cells.slice();
    case 'seal-op': return page.cages.filter((g) => g.op === c.op).flatMap((g) => g.cells);
    default: return [];
  }
}

// ---- Proving commissions possible ---------------------------------------------------------------

/**
 * What the player will hold this round: numbers from earlier rounds (all must stay), and the new
 * deal. `rooted` lists cells that already hold their right number (the hidden solution's): every
 * layout the planner considers leaves those numbers where they stand, so no commission ever asks
 * you to move a number that's right.
 */
export interface Holding { kept: readonly number[]; dealt: readonly number[]; need: number; rooted?: readonly number[] }

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
    out = Array.from({ length: page.size + 1 }, () => [] as number[]);
    for (let c = 0; c < page.stones.length; c++) if (!page.stones[c]) out[page.solution[c]!]!.push(c);
    openByValueCache.set(page, out);
  }
  return out;
}

/** Open cells by the number the hidden solution holds there, leaving out rooted cells. */
function freeByValue(page: Page, rooted: readonly number[]): number[][] {
  const all = openByValue(page);
  if (!rooted.length) return all;
  const skip = new Set(rooted);
  return all.map((cells) => cells.filter((c) => !skip.has(c)));
}

/**
 * A legal layout of these numbers: each number goes to a cell where the hidden solution holds
 * it. Every subset of a Latin square is legal, so this always works. Numbers in `rooted` cells
 * (which must be among `numbers`) stay where they are.
 */
export function sampleLayout(page: Page, numbers: readonly number[], rng: Rng, rooted: readonly number[] = []): number[] {
  const values = page.stones.slice();
  const counts = new Array<number>(page.size + 1).fill(0);
  for (const n of numbers) counts[n]!++;
  for (const c of rooted) { const n = page.solution[c]!; values[c] = n; counts[n]!--; }
  const byValue = freeByValue(page, rooted);
  for (let n = 1; n <= page.size; n++) {
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
  const lines = Array.from({ length: page.size }, (_, i) => i);
  for (const axis of ['row', 'col'] as Axis[]) for (const line of lines) {
    add('line-min', 'min', (t) => ({ kind: 'line-min', axis, line, min: t }));
    add('line-max', 'max', (t) => ({ kind: 'line-max', axis, line, max: t }));
    add('line-count-max', 'max', (t) => ({ kind: 'line-count-max', axis, line, max: t }));
    add('fill-line', 'bool', () => ({ kind: 'fill-line', axis, line }));
    add('no-seal-line', 'bool', () => ({ kind: 'no-seal-line', axis, line }));
    for (let n = 1; n <= page.size; n++) add('no-number', 'bool', () => ({ kind: 'no-number', axis, line, n }));
    for (const even of [true, false]) for (const count of VARIANTS.parityCount) {
      add('parity-line', 'bool', () => ({ kind: 'parity-line', axis, line, even, count }));
    }
    for (const b of lines) if (b > line) for (const min of VARIANTS.equalLinesMin) {
      add('equal-lines', 'bool', () => ({ kind: 'equal-lines', axis, a: line, b, min }));
    }
  }
  for (const line of lines) for (const count of VARIANTS.risingCount) add('rising', 'bool', () => ({ kind: 'rising', line, count }));
  for (let n = 1; n <= page.size; n++) for (const zone of ['top', 'bottom', 'left', 'right'] as Zone[]) {
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
 * Plans a round's commissions: one required and two bounties. The run asks for a perfect round
 * (a holding whose `need` is every dealt number): all three can be met at once with every number
 * placed, and `proof` is such a layout. With a smaller `need`, the required one is planned to be
 * possible whichever dealt numbers you place. Deterministic for the rng it's given.
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
  const rooted = holding.rooted ?? [];
  const views = choices(holding).map((set) =>
    Array.from({ length: samples }, () => viewOf(page, sampleLayout(page, set, rng, rooted))));
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

  // The required commission: possible whichever dealt numbers you keep, and not a given. Late in
  // a season most of your numbers may be right and rooted, leaving the new ones little room; then
  // one that every layout of the right numbers meets will do, so the week still asks for something.
  const requiredUpTo = (maxRate: number) => choose(pool.filter((c) => c.req), input.lastRequired, (cand) => {
    const j = judgeRequired(cand, statsOf(cand), now);
    return j && j.worstRate >= DIFFICULTY.requiredMinRate && j.worstRate <= maxRate ? j : null;
  }, () => 1);
  const required = requiredUpTo(DIFFICULTY.requiredMaxRate) ?? requiredUpTo(1);
  const meetsRequired = required ? all.flatMap((v, i) => (isMet(required.c, v) ? [i] : [])) : all.map((_, i) => i);

  // Two bounties of other kinds, each ambitious, all three met together by some sampled layout.
  // Two commissions about the same thing (the same row, plot or pair of columns) differ at most in
  // their threshold, and the stricter one makes the other redundant: never post both.
  const subject = (c: Commission) => JSON.stringify({ ...c, min: undefined, max: undefined, count: undefined });
  const same = (a: Commission, b: Commission) => subject(a) === subject(b);
  const bountyFor = (anchor: readonly number[], taken: readonly Commission[], distinct: boolean, maxRate: number) => choose(
    pool.filter((c) => c.bty && !(distinct && taken.some((t) => t.kind === c.kind))), undefined,
    (cand) => {
      const j = judgeBounty(cand, statsOf(cand), flatOf(cand), anchor, now);
      return j && j.meanRate <= maxRate && !j.metNow && !taken.some((t) => same(t, j.c)) ? j : null;
    },
    (j) => 0.2 + j.bestRate,
  );
  // Ambitious bounties of new kinds first. A thin early page sometimes can't fit two beside the
  // required commission; then a gentler bounty, and then a second of the same kind, will do. When
  // rooted numbers leave the new ones almost no room, a bounty every layout meets still pays for
  // getting the new numbers right.
  const levels = [
    { distinct: true, maxRate: DIFFICULTY.bountyMaxRate },
    { distinct: true, maxRate: DIFFICULTY.bountyFallbackRate },
    { distinct: false, maxRate: DIFFICULTY.bountyFallbackRate },
    { distinct: true, maxRate: 1 },
    { distinct: false, maxRate: 1 },
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
    for (let i = 0; i < samples; i++) if (isMet(c, viewOf(page, sampleLayout(page, set, rng, holding.rooted)))) return true;
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
 * another cell where the solution has it. Rooted numbers never move. Returns the layout, or null
 * if none turned up.
 */
export function findLayout(page: Page, holding: Holding, cs: readonly Commission[], rng: Rng, restarts = 6, steps = 120): number[] | null {
  const rooted = holding.rooted ?? [];
  const byValue = freeByValue(page, rooted);
  const score = (values: number[]) => { const v = viewOf(page, values); return cs.reduce((s, c) => s + closeness(c, v), 0); };
  for (const set of rng.shuffle(choices(holding))) {
    for (let r = 0; r < restarts; r++) {
      const values = sampleLayout(page, set, rng, rooted);
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
