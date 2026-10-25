/**
 * Commissions: plain sentences about the page, each true or false at a glance. Every round
 * posts three, one required. Before posting, the game proves each one possible by finding
 * layouts of the numbers you'll hold that meet it (any subset of the hidden solution is a
 * legal layout), and sets thresholds from how many such layouts reach them.
 */
import {
  BIG_CAGE_BONUS, BOUNTY_FROM, BOUNTY_GOLD, type CommissionKind, DIFFICULTY, FINAL_SEALS, REQUIRED_FROM, THRESHOLD_RANGE, VARIANTS,
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
  | { kind: 'seal-all' };

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
  }
}

export function isMet(c: Commission, v: View): boolean {
  const m = measure(c, v);
  switch (c.kind) {
    case 'line-min': return m >= c.min;
    case 'line-max': case 'line-count-max': return m <= c.max;
    case 'diagonal-min': return m >= c.min;
    case 'seal-count': return m >= c.count;
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
  }
}

/** Where the page stands on a commission, in a few words. */
export function readout(c: Commission, v: View): string {
  const m = measure(c, v);
  switch (c.kind) {
    case 'line-min': case 'line-max': case 'diagonal-min': return `now ${m}`;
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

function candidates(page: Page, round: number): Candidate[] {
  const out: Candidate[] = [];
  const add = (kind: CommissionKind, dir: Direction, make: (t: number) => Commission) => {
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
  for (const op of [...new Set(page.cages.map((g) => g.op))]) add('seal-op', 'bool', () => ({ kind: 'seal-op', op }));
  for (const cage of page.cages) {
    add('seal-cage', 'bool', () => ({ kind: 'seal-cage', cage: cage.id }));
    if (cage.cells.filter((c) => !page.stones[c]).length >= VARIANTS.emptyCageOpen) add('empty-cage', 'bool', () => ({ kind: 'empty-cage', cage: cage.id }));
  }
  return out;
}

/** The value a share of samples reach, counting from the best end of a sorted list. */
const fromTop = (sorted: number[], share: number) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))]!;

interface Judged { c: Commission; kind: CommissionKind; worstRate: number; bestRate: number; meanRate: number; metNow: boolean }

/**
 * Sets a candidate's threshold and measures how often sampled layouts meet it. `stats` holds,
 * for each set of numbers you could hold, the candidate's measure on each sampled layout.
 */
function judge(cand: Candidate, stats: number[][], now: View, required: boolean): Judged | null {
  let t = 0;
  if (cand.dir !== 'bool') {
    const share = required ? DIFFICULTY.requiredShare : DIFFICULTY.bountyShare;
    const per = stats.map((s) => fromTop(s.slice().sort((a, b) => (cand.dir === 'min' ? b - a : a - b)), share));
    // A required threshold must suit the worst set of numbers you could keep; a bounty, the best.
    t = cand.dir === 'min'
      ? (required ? Math.min(...per) : Math.max(...per))
      : (required ? Math.max(...per) : Math.min(...per));
    const range = THRESHOLD_RANGE[cand.kind]!;
    const [lo, hi] = required ? range.required : range.bounty;
    if (t < lo || t > hi) return null;
  }
  const meets = cand.dir === 'min' ? (m: number) => m >= t : cand.dir === 'max' ? (m: number) => m <= t : (m: number) => m === 1;
  const rates = stats.map((s) => s.filter(meets).length / s.length);
  const c = cand.make(t);
  return {
    c, kind: cand.kind,
    worstRate: Math.min(...rates), bestRate: Math.max(...rates),
    meanRate: rates.reduce((a, b) => a + b, 0) / rates.length,
    metNow: isMet(c, now),
  };
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
}

/** Posts a round's commissions: one required and two bounties. Deterministic for the rng it's given. */
export function postCommissions(input: PostInput, rng: Rng): Posted[] {
  const { page, round, final, holding, now } = input;
  if (final) {
    const most = Math.max(1, Math.ceil(page.cages.length * FINAL_SEALS.share));
    return [
      { c: { kind: 'fill-page' }, required: true, gold: 0 },
      { c: { kind: 'seal-count', count: most }, required: false, gold: FINAL_SEALS.gold },
      { c: { kind: 'seal-all' }, required: false, gold: BOUNTY_GOLD['seal-all'] },
    ];
  }
  const views = choices(holding).map((set) =>
    Array.from({ length: DIFFICULTY.samples }, () => viewOf(page, sampleLayout(page, set, rng))));
  const pool = candidates(page, round);
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

  /**
   * Picks a kind at random among those with a usable commission, then one commission of that
   * kind. Kinds are tried in a shuffled order, which is the same as choosing uniformly among the
   * usable ones, without judging every candidate. A kind whose usable commissions the page
   * already meets is taken only now and then, so a round rarely asks for what's already done.
   */
  const choose = (required: boolean, avoid: Set<CommissionKind>, last: CommissionKind | undefined,
    usable: (j: Judged) => boolean, weight: (j: Judged) => number): Judged | null => {
    const mine = pool.filter((c) => (required ? c.req : c.bty) && !avoid.has(c.kind));
    let kinds = rng.shuffle([...new Set(mine.map((c) => c.kind))]);
    if (last) kinds = [...kinds.filter((k) => k !== last), ...kinds.filter((k) => k === last)];
    let given: Judged | null = null;
    for (const kind of kinds) {
      const ok = mine.filter((c) => c.kind === kind)
        .map((c) => judge(c, statsOf(c), now, required))
        .filter((j): j is Judged => !!j && usable(j));
      if (!ok.length) continue;
      const fresh = ok.filter((j) => !j.metNow);
      if (fresh.length) return rng.weighted(fresh.map((j) => [j, Math.max(0.001, weight(j))] as const));
      given ??= rng.pick(ok);
      if (rng.next() < DIFFICULTY.alreadyMetWeight) return given;
    }
    return given;
  };

  // The required commission: possible whichever dealt numbers you keep, and not a given.
  const required = choose(true, new Set(), input.lastRequired,
    (j) => j.worstRate >= DIFFICULTY.requiredMinRate && j.worstRate <= DIFFICULTY.requiredMaxRate, () => 1);

  // Two bounties of other kinds: possible for the right choice of numbers, and ambitious.
  const used = new Set<CommissionKind>(required ? [required.kind] : []);
  const bounties: Judged[] = [];
  for (let i = 0; i < 2; i++) {
    const b = choose(false, used, undefined, (j) => j.bestRate > 0 && j.meanRate <= DIFFICULTY.bountyMaxRate && !j.metNow, (j) => 0.2 + j.bestRate);
    if (!b) break;
    bounties.push(b);
    used.add(b.kind);
  }

  const out: Posted[] = [];
  if (required) out.push({ c: required.c, required: true, gold: 0 });
  for (const b of bounties) out.push({ c: b.c, required: false, gold: goldFor(b.c, page) });
  return out;
}

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
