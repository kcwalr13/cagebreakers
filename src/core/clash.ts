/**
 * The Clash: a pure function of two pages and the units standing on them.
 * No dice, no clock, no movement. The same input always produces the same event log.
 */
import {
  BEATS_PER_SECOND, MANA_PER_ATTACK, MANA_PER_HIT_TAKEN, OPENING_DELAY, OVERTIME, REGEN_EVERY,
  SEAL, SEAL_SIZE_FACTOR, STAR_MULT,
} from '../content/balance';
import { ITEMS, RELIC } from '../content/items';
import { speciesById } from '../content/species';
import { CALLINGS, CALLING_BASE, KINS, SERPENT_DAMAGE } from '../content/traits';
import type { Ability, CallingId, KinId, RelicId, Species } from '../content/types';
import { CELLS, SIZE, colOf, neighbors, rowOf } from './grid';
import type { Page } from './page';
import { cellsOf, heftOf, writeUnits } from './pieces';
import { boardValues, isSealed } from './rules';

export type Team = 0 | 1;
export const PLAYER: Team = 0;
export const ENEMY: Team = 1;

/** A unit as placed by the player or the opponent generator. */
export interface UnitSpec {
  uid: string;
  species: string;
  /** 0 for the Blank. */
  n: number;
  /** The Domino's second number, at `cell2`. */
  n2?: number;
  stars: 1 | 2 | 3;
  cell: number;
  cell2?: number;
  relic?: RelicId;
}

/** Rules that bend a clash for one side: Keeper twists and their kin. */
export interface TeamRules {
  /** Extra damage and HP as a share (0.15 = 15% more). */
  buff?: number;
  /** Units standing in cages that didn't seal lose this share of damage and HP. */
  unsealedPenalty?: number;
  /** This side's sealed cages never shatter. */
  unshatterable?: boolean;
}

export interface Side {
  page: Page;
  units: UnitSpec[];
  rules?: TeamRules;
}

export type DamageKind = 'hit' | 'pierce' | 'splash' | 'ability' | 'poison' | 'overtime' | 'thorn';
export type BuffKind = 'frenzy' | 'bristle' | 'rally' | 'mark';

export type ClashEvent =
  | { t: number; type: 'attack'; src: string; dst: string }
  | { t: number; type: 'cast'; src: string; ability: Ability['kind']; targets: string[] }
  | { t: number; type: 'damage'; src: string | null; dst: string; amount: number; absorbed: number; kind: DamageKind; hp: number; shield: number }
  | { t: number; type: 'evade'; src: string; dst: string }
  | { t: number; type: 'heal'; src: string | null; dst: string; amount: number; hp: number }
  | { t: number; type: 'shield'; src: string; dst: string; amount: number; shield: number }
  | { t: number; type: 'fortify'; dst: string; until: number }
  | { t: number; type: 'stun'; src: string; dst: string; until: number }
  | { t: number; type: 'buff'; src: string; dst: string; kind: BuffKind; until: number }
  | { t: number; type: 'death'; uid: string; by: string | null }
  | { t: number; type: 'shatter'; team: Team; cage: number; by: string | null; members: string[] }
  | { t: number; type: 'reseal'; team: Team; cage: number; by: string; members: string[] }
  | { t: number; type: 'stats'; uid: string; maxHp: number; hp: number }
  | { t: number; type: 'overtime' }
  | { t: number; type: 'end'; winner: Team | 'draw' };

/** How a unit stood at the first beat, for playback and for the result screen. */
export interface FighterSnapshot {
  uid: string;
  team: Team;
  species: string;
  n: number;
  n2?: number;
  stars: number;
  cell: number;
  cell2?: number;
  relic?: RelicId;
  maxHp: number;
  hp: number;
  shield: number;
  /** The cage its first cell stands in; a Domino may stand in two (`cages`). */
  cage: number;
  cages: number[];
  sealed: boolean;
  /** Bonuses in effect, in the player's terms, for the unit card. */
  notes: string[];
}

export interface TraitTally {
  id: string;
  count: number;
  /** Thresholds reached (0 = none). */
  level: number;
}

export interface ClashResult {
  winner: Team | 'draw';
  beats: number;
  events: ClashEvent[];
  fighters: FighterSnapshot[];
  /** Cage ids sealed at the start, per team. */
  sealedAtStart: [number[], number[]];
  traits: [TraitTally[], TraitTally[]];
  damageDealt: Record<string, number>;
  damageTaken: Record<string, number>;
  survivors: string[];
}

interface SealBonus { hp: number; damage: number; speed: number }

interface Fighter {
  uid: string;
  team: Team;
  sp: Species;
  n: number;
  stars: number;
  cells: number[];
  /** The front-most cell (then the left-most): where it acts from. */
  row: number;
  col: number;
  cages: number[];
  baseMaxHp: number;
  maxHp: number;
  hp: number;
  shield: number;
  attack: number;
  /** Beats between actions before speed bonuses. */
  baseInterval: number;
  cooldown: number;
  mana: number;
  manaMax: number;
  alive: boolean;
  /** Permanent multipliers from Kins, Callings and relics. */
  traitDamage: number;
  traitSpeed: number;
  armor: number;
  thorn: number;
  /** Seal bonuses by cage; removed when that cage shatters. */
  seals: Map<number, SealBonus>;
  sealHp: number;
  sealDamage: number;
  sealSpeed: number;
  sealMult: number;
  fortifyUntil: number;
  fortifyReduction: number;
  stunnedUntil: number;
  frenzyUntil: number;
  frenzySpeed: number;
  bristleUntil: number;
  bristleReflect: number;
  rallyUntil: number;
  rallyDamage: number;
  markedUntil: number;
  vulnerable: number;
  poisons: { perBeat: number; until: number; src: string }[];
  evadeEvery: number;
  hitsTaken: number;
  /** Cages (by team-cage key) this Breaker has already broken on first hit. */
  brokeFirst: Set<string>;
  notes: string[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function tallyTraits(units: readonly UnitSpec[]): { kins: TraitTally[]; callings: TraitTally[] } {
  const kinSpecies = new Map<KinId, Set<string>>();
  const callingSpecies = new Map<CallingId, Set<string>>();
  for (const u of units) {
    const sp = speciesById(u.species);
    if (sp.kin) {
      if (!kinSpecies.has(sp.kin)) kinSpecies.set(sp.kin, new Set());
      kinSpecies.get(sp.kin)!.add(sp.id);
    }
    if (!callingSpecies.has(sp.calling)) callingSpecies.set(sp.calling, new Set());
    callingSpecies.get(sp.calling)!.add(sp.id);
  }
  const kins = [...kinSpecies].map(([id, set]) => ({
    id, count: set.size, level: KINS[id].thresholds.filter((t) => set.size >= t).length,
  }));
  const callings = [...callingSpecies].map(([id, set]) => ({
    id, count: set.size, level: CALLINGS[id].thresholds.filter((t) => set.size >= t).length,
  }));
  const order = (a: TraitTally, b: TraitTally) => b.level - a.level || b.count - a.count || a.id.localeCompare(b.id);
  return { kins: kins.sort(order), callings: callings.sort(order) };
}

/** Column order for targeting: own column first, then nearer columns, preferring the centre, then the left. */
const COLUMN_ORDER: readonly (readonly number[])[] = Array.from({ length: SIZE }, (_, col) =>
  Array.from({ length: SIZE }, (_, c) => c).sort((a, b) =>
    Math.abs(a - col) - Math.abs(b - col) || Math.abs(a - 2.5) - Math.abs(b - 2.5) || a - b));

const frontCell = (cells: number[]) => cells.slice().sort((a, b) => rowOf(a) - rowOf(b) || colOf(a) - colOf(b))[0]!;

export function simulateClash(player: Side, enemy: Side): ClashResult {
  const sides: [Side, Side] = [player, enemy];
  const events: ClashEvent[] = [];
  const damageDealt: Record<string, number> = {};
  const damageTaken: Record<string, number> = {};
  const fighters: Fighter[] = [];
  const traitTallies: [TraitTally[], TraitTally[]] = [[], []];
  const sealedAtStart: [number[], number[]] = [[], []];
  /** Sealed state of every cage, per team. */
  const sealedNow: [Set<number>, Set<number>] = [new Set(), new Set()];
  const shatteredOrder: [number[], number[]] = [[], []];
  const resealUsed = new Set<string>();
  const firstBreakUsed: [boolean, boolean] = [false, false];
  const callingLevel: [Map<CallingId, number>, Map<CallingId, number>] = [new Map(), new Map()];
  /** Which fighter stands on each cell, per team. */
  const occupant: [(Fighter | undefined)[], (Fighter | undefined)[]] = [new Array(CELLS), new Array(CELLS)];
  let t = 0;

  // ---- Build fighters ---------------------------------------------------------------------
  for (const team of [PLAYER, ENEMY] as const) {
    const side = sides[team];
    const { kins, callings } = tallyTraits(side.units);
    traitTallies[team] = [...kins, ...callings];
    const kinLevel = new Map(kins.map((k) => [k.id as KinId, k.level]));
    for (const c of callings) callingLevel[team].set(c.id as CallingId, c.level);

    const values = boardValues(side.page, writeUnits(side.units));
    const taken = new Set(side.units.flatMap((u) => cellsOf(u)));
    for (const cage of side.page.cages) {
      if (isSealed(cage, values)) { sealedNow[team].add(cage.id); sealedAtStart[team].push(cage.id); }
    }

    const rowFull = (r: number) => Array.from({ length: SIZE }, (_, c) => values[r * SIZE + c]).every((v) => v);
    const colFull = (c: number) => Array.from({ length: SIZE }, (_, r) => values[r * SIZE + c]).every((v) => v);
    const kinOf = (o: UnitSpec) => speciesById(o.species).kin;

    for (const u of side.units) {
      const sp = speciesById(u.species);
      const h = heftOf(u), star = STAR_MULT[u.stars - 1]!;
      const cells = cellsOf(u);
      const anchor = frontCell(cells);
      const row = rowOf(anchor), col = colOf(anchor);
      const cages = [...new Set(cells.map((c) => side.page.cageOf[c]!))];
      const f: Fighter = {
        uid: u.uid, team, sp, n: u.n, stars: u.stars, cells, row, col, cages,
        baseMaxHp: sp.hp * h * star, maxHp: 0, hp: 0, shield: 0,
        attack: sp.attack * h * star,
        baseInterval: sp.interval * h,
        cooldown: 0, mana: 0, manaMax: sp.mana, alive: true,
        traitDamage: 1, traitSpeed: 1, armor: 0, thorn: 0,
        seals: new Map(), sealHp: 0, sealDamage: 0, sealSpeed: 0, sealMult: 1,
        fortifyUntil: -1, fortifyReduction: 0, stunnedUntil: -1,
        frenzyUntil: -1, frenzySpeed: 0, bristleUntil: -1, bristleReflect: 0, rallyUntil: -1, rallyDamage: 0,
        markedUntil: -1, vulnerable: 0, poisons: [],
        evadeEvery: 0, hitsTaken: 0, brokeFirst: new Set(), notes: [],
      };
      for (const c of cells) occupant[team][c] = f;
      const rules = side.rules ?? {};
      if (rules.buff) { f.baseMaxHp *= 1 + rules.buff; f.attack *= 1 + rules.buff; }
      if (rules.unsealedPenalty && !cages.some((c) => sealedNow[team].has(c))) {
        f.baseMaxHp *= 1 - rules.unsealedPenalty; f.attack *= 1 - rules.unsealedPenalty;
        f.notes.push(`Outside a seal: ${pct(rules.unsealedPenalty)} weaker`);
      }
      // Relics.
      if (u.relic) {
        const v = RELIC[u.relic];
        if (u.relic === 'blade') f.traitDamage *= 1 + v;
        if (u.relic === 'bulwark') f.baseMaxHp *= 1 + v;
        if (u.relic === 'quill') f.manaMax = Math.round(f.manaMax * (1 - v));
        if (u.relic === 'hourglass') f.traitSpeed *= 1 + v;
        if (u.relic === 'thorn') f.thorn = v;
        f.notes.push(`${ITEMS[u.relic].name}: ${ITEMS[u.relic].text.replace('Its bearer ', '').replace(/\.$/, '')}`);
      }
      f.maxHp = f.baseMaxHp;

      // Kins: each keys off a feature of the page, judged as the clash begins.
      const kl = sp.kin ? kinLevel.get(sp.kin) ?? 0 : 0;
      if (sp.kin && kl > 0) {
        const v = KINS[sp.kin].values[kl - 1]!;
        if (sp.kin === 'snail' && cells.some((cell) => neighbors(cell).some((c) => side.page.stones[c]))) {
          f.armor = v; f.notes.push(`Snails: ${pct(v)} less damage beside a stone`);
        }
        if (sp.kin === 'hare') {
          const others = side.units.filter((o) => o !== u && cellsOf(o).some((c) => rowOf(c) === row) && kinOf(o) === 'hare').length;
          if (others) { f.traitSpeed *= 1 + v * others; f.notes.push(`Hares: ${pct(v * others)} faster`); }
        }
        if (sp.kin === 'boar') {
          const behind = side.units.filter((o) => cellsOf(o).some((c) => colOf(c) === col && rowOf(c) > row) && kinOf(o) === 'boar').length;
          if (behind) { f.traitDamage *= 1 + v * behind; f.notes.push(`Boars: ${pct(v * behind)} harder`); }
        }
        if (sp.kin === 'owl') { f.sealMult = v; }
        if (sp.kin === 'serpent' && !cells.some((cell) => neighbors(cell).some((c) => taken.has(c) && !cells.includes(c)))) {
          f.evadeEvery = v;
          const bonus = SERPENT_DAMAGE[kl - 1]!;
          if (bonus) f.traitDamage *= 1 + bonus;
          f.notes.push(`Serpents: evades every ${v}${v === 2 ? 'nd' : 'rd'} hit${bonus ? `, ${pct(bonus)} harder` : ''}`);
        }
        if (sp.kin === 'stag' && (rowFull(row) || colFull(col))) {
          f.traitDamage *= 1 + v; f.notes.push(`Stags: ${pct(v)} harder in a full line`);
        }
      }
      // Callings with a standing bonus.
      const cl = callingLevel[team].get(sp.calling) ?? 0;
      if (sp.calling === 'marksman' && cl > 0) {
        const v = CALLINGS.marksman.values[cl - 1]!;
        f.traitDamage *= 1 + v; f.notes.push(`Marksmen: ${pct(v)} harder`);
      }
      fighters.push(f);
    }
  }

  const byUid = new Map(fighters.map((f) => [f.uid, f]));
  const cageKey = (team: Team, cage: number) => `${team}:${cage}`;
  const living = (team: Team) => fighters.filter((f) => f.alive && f.team === team);
  const members = (team: Team, cage: number) => fighters.filter((f) => f.team === team && f.cages.includes(cage));
  const inSeal = (f: Fighter) => f.cages.some((c) => sealedNow[f.team].has(c));

  const interval = (f: Fighter) => f.baseInterval / (f.traitSpeed * (1 + f.sealSpeed) * (f.frenzyUntil >= t ? 1 + f.frenzySpeed : 1));
  const damageOf = (f: Fighter) => f.attack * f.traitDamage * (1 + f.sealDamage) * (f.rallyUntil >= t ? 1 + f.rallyDamage : 1);

  function totals(f: Fighter) {
    let damage = 0, speed = 0;
    for (const b of f.seals.values()) { damage += b.damage; speed += b.speed; }
    f.sealDamage = damage; f.sealSpeed = speed;
  }

  function applySeal(f: Fighter, cageId: number) {
    if (f.seals.has(cageId)) return;
    const cage = sides[f.team].page.cages[cageId]!;
    const factor = (SEAL_SIZE_FACTOR[cage.cells.length] ?? 1) * f.sealMult;
    const bonus = SEAL[cage.op] as { hp?: number; damage?: number; speed?: number; startMana?: number };
    const b: SealBonus = { hp: 0, damage: (bonus.damage ?? 0) * factor, speed: (bonus.speed ?? 0) * factor };
    if (bonus.hp) {
      b.hp = f.baseMaxHp * bonus.hp * factor;
      f.maxHp += b.hp; f.hp += b.hp; f.sealHp += b.hp;
    }
    if (bonus.startMana && t === 0) f.mana = Math.min(f.manaMax, f.mana + f.manaMax * bonus.startMana * factor);
    f.seals.set(cageId, b);
    totals(f);
  }

  function removeSeal(f: Fighter, cageId: number) {
    const b = f.seals.get(cageId);
    if (!b) return;
    if (b.hp) {
      f.maxHp -= b.hp; f.sealHp -= b.hp;
      f.hp = Math.max(1, Math.min(f.hp, f.maxHp));
    }
    f.seals.delete(cageId);
    totals(f);
  }

  // ---- Opening state ----------------------------------------------------------------------
  for (const f of fighters) {
    f.hp = f.maxHp;
    for (const c of f.cages) if (sealedNow[f.team].has(c)) applySeal(f, c);
    const wardenLevel = callingLevel[f.team].get('warden') ?? 0;
    if (f.sp.calling === 'warden' && wardenLevel > 0) {
      f.shield = f.maxHp * CALLINGS.warden.values[wardenLevel - 1]!;
      f.notes.push(`Wardens: starts with a ${pct(CALLINGS.warden.values[wardenLevel - 1]!)} shield`);
    }
    f.cooldown = interval(f) * OPENING_DELAY;
  }

  const snapshot: FighterSnapshot[] = fighters.map((f) => {
    const spec = sides[f.team].units.find((u) => u.uid === f.uid)!;
    const snap: FighterSnapshot = {
      uid: f.uid, team: f.team, species: f.sp.id, n: f.n, stars: f.stars, cell: spec.cell,
      maxHp: Math.round(f.maxHp), hp: Math.round(f.hp), shield: Math.round(f.shield), cage: sides[f.team].page.cageOf[spec.cell]!,
      cages: f.cages.slice(), sealed: inSeal(f), notes: f.notes.slice(),
    };
    if (spec.n2 !== undefined) snap.n2 = spec.n2;
    if (spec.cell2 !== undefined) snap.cell2 = spec.cell2;
    if (spec.relic) snap.relic = spec.relic;
    return snap;
  });

  // ---- Effects ----------------------------------------------------------------------------
  function shatter(team: Team, cage: number, by: string | null) {
    if (!sealedNow[team].has(cage) || sides[team].rules?.unshatterable) return;
    sealedNow[team].delete(cage);
    shatteredOrder[team].push(cage);
    const ms = members(team, cage);
    for (const m of ms) if (m.alive) {
      removeSeal(m, cage);
      events.push({ t, type: 'stats', uid: m.uid, maxHp: Math.round(m.maxHp), hp: Math.round(m.hp) });
    }
    events.push({ t, type: 'shatter', team, cage, by, members: ms.map((m) => m.uid) });
  }
  const shatterAll = (f: Fighter, by: string | null) => { for (const c of f.cages) shatter(f.team, c, by); };

  function kill(f: Fighter, by: string | null) {
    f.alive = false; f.hp = 0; f.shield = 0;
    events.push({ t, type: 'death', uid: f.uid, by });
    shatterAll(f, by);
  }

  function hurt(src: Fighter | null, dst: Fighter, raw: number, kind: DamageKind) {
    if (!dst.alive || raw <= 0) return;
    if (kind === 'hit' && dst.evadeEvery) {
      dst.hitsTaken++;
      if (dst.hitsTaken % dst.evadeEvery === 0) { events.push({ t, type: 'evade', src: src!.uid, dst: dst.uid }); return; }
    }
    let amount = raw;
    if (kind !== 'overtime') {
      if (dst.markedUntil >= t) amount *= 1 + dst.vulnerable;
      amount *= 1 - dst.armor;
      if (dst.fortifyUntil >= t) amount *= 1 - dst.fortifyReduction;
    }
    const absorbed = Math.min(dst.shield, amount);
    dst.shield -= absorbed;
    const dealt = amount - absorbed;
    dst.hp -= dealt;
    if (src) damageDealt[src.uid] = (damageDealt[src.uid] ?? 0) + amount;
    damageTaken[dst.uid] = (damageTaken[dst.uid] ?? 0) + amount;
    if (kind !== 'poison' && kind !== 'overtime' && kind !== 'thorn') dst.mana = Math.min(dst.manaMax, dst.mana + MANA_PER_HIT_TAKEN);
    events.push({
      t, type: 'damage', src: src?.uid ?? null, dst: dst.uid, amount: Math.round(amount), absorbed: Math.round(absorbed),
      kind, hp: Math.max(0, Math.round(dst.hp)), shield: Math.round(dst.shield),
    });
    if (dst.hp <= 0) kill(dst, src?.uid ?? null);
    // Thorns and bristles hand back part of a blow.
    if (src && src.alive && src.team !== dst.team && (kind === 'hit' || kind === 'pierce' || kind === 'splash')) {
      const reflect = dst.thorn + (dst.bristleUntil >= t ? dst.bristleReflect : 0);
      if (reflect > 0) hurt(dst, src, amount * reflect, 'thorn');
    }
  }

  function heal(src: Fighter | null, dst: Fighter, amount: number) {
    if (!dst.alive) return;
    const before = dst.hp;
    dst.hp = Math.min(dst.maxHp, dst.hp + amount);
    if (dst.hp > before) events.push({ t, type: 'heal', src: src?.uid ?? null, dst: dst.uid, amount: Math.round(dst.hp - before), hp: Math.round(dst.hp) });
  }

  // ---- Targeting --------------------------------------------------------------------------
  const foes = (f: Fighter) => fighters.filter((o) => o.alive && o.team !== f.team);
  const allies = (f: Fighter) => fighters.filter((o) => o.alive && o.team === f.team);
  const inCol = (o: Fighter, col: number) => o.cells.some((c) => colOf(c) === col);
  const inRow = (o: Fighter, row: number) => o.cells.some((c) => rowOf(c) === row);
  /** The row a fighter presents in a column, from the front or the back. */
  const rowIn = (o: Fighter, col: number, end: 'front' | 'back') => {
    let best = -1;
    for (const c of o.cells) if (colOf(c) === col) { const r = rowOf(c); if (best < 0 || (end === 'front' ? r < best : r > best)) best = r; }
    return best;
  };
  function inColumn(list: Fighter[], col: number, end: 'front' | 'back'): Fighter | undefined {
    let best: Fighter | undefined, bestRow = -1;
    for (const o of list) {
      if (!inCol(o, col)) continue;
      const r = rowIn(o, col, end);
      if (!best || (end === 'front' ? r < bestRow : r > bestRow)) { best = o; bestRow = r; }
    }
    return best;
  }
  function pickTarget(f: Fighter, end: 'front' | 'back' = f.sp.calling === 'marksman' ? 'back' : 'front'): Fighter | undefined {
    const list = foes(f);
    for (const c of COLUMN_ORDER[f.col]!) {
      const hit = inColumn(list, c, end);
      if (hit) return hit;
    }
    return undefined;
  }
  /** The first living unit behind the target in its own column. */
  const behind = (target: Fighter) => {
    const back = rowIn(target, target.col, 'back');
    for (let r = back + 1; r < SIZE; r++) {
      const o = occupant[target.team][r * SIZE + target.col];
      if (o && o.alive && o !== target) return o;
    }
    return undefined;
  };
  /** Living units directly left and right of the target in its row. */
  const besideRow = (target: Fighter) => {
    const cols = target.cells.filter((c) => rowOf(c) === target.row).map(colOf);
    const out: Fighter[] = [];
    for (const c of [Math.min(...cols) - 1, Math.max(...cols) + 1]) {
      if (c < 0 || c >= SIZE) continue;
      const o = occupant[target.team][target.row * SIZE + c];
      if (o && o.alive && o !== target && !out.includes(o)) out.push(o);
    }
    return out;
  };
  /** Living allies orthogonally next to any of a unit's cells. */
  const adjacent = (f: Fighter) => {
    const out: Fighter[] = [];
    for (const cell of f.cells) for (const n of neighbors(cell)) {
      const o = occupant[f.team][n];
      if (o && o.alive && o !== f && !out.includes(o)) out.push(o);
    }
    return out;
  };

  // ---- Actions ----------------------------------------------------------------------------
  function breakerHit(f: Fighter, target: Fighter, base: number): number {
    const cage = target.cages.find((c) => sealedNow[target.team].has(c));
    if (f.sp.calling !== 'breaker' || cage === undefined) return base;
    const level = callingLevel[f.team].get('breaker') ?? 0;
    const key = cageKey(target.team, cage);
    if (level >= 2 && !f.brokeFirst.has(key)) { f.brokeFirst.add(key); shatter(target.team, cage, f.uid); }
    else if (level === 1 && !firstBreakUsed[f.team]) { firstBreakUsed[f.team] = true; shatter(target.team, cage, f.uid); }
    return base * (1 + CALLING_BASE.breakerBonus);
  }

  function attack(f: Fighter) {
    const target = pickTarget(f);
    if (!target) return;
    events.push({ t, type: 'attack', src: f.uid, dst: target.uid });
    const base = damageOf(f);
    const dmg = f.sp.calling === 'breaker' && inSeal(target) ? breakerHit(f, target, base) : base;
    const level = callingLevel[f.team].get(f.sp.calling) ?? 0;
    const pierceTo = f.sp.calling === 'lancer' ? behind(target) : undefined;
    const splashTo = f.sp.calling === 'sweeper' ? besideRow(target) : [];
    hurt(f, target, dmg, 'hit');
    if (pierceTo) {
      const share = level ? CALLINGS.lancer.values[level - 1]! : CALLING_BASE.pierce;
      hurt(f, pierceTo, base * share, 'pierce');
    }
    for (const s of splashTo) {
      const share = level ? CALLINGS.sweeper.values[level - 1]! : CALLING_BASE.splash;
      hurt(f, s, base * share, 'splash');
    }
    f.mana = Math.min(f.manaMax, f.mana + MANA_PER_ATTACK);
  }

  function buff(src: Fighter, dst: Fighter, kind: BuffKind, until: number) {
    events.push({ t, type: 'buff', src: src.uid, dst: dst.uid, kind, until });
  }

  function cast(f: Fighter) {
    const a = f.sp.ability;
    const base = damageOf(f);
    const targets: Fighter[] = [];
    const say = () => events.push({ t, type: 'cast', src: f.uid, ability: a.kind, targets: targets.map((x) => x.uid) });
    const strikeAll = (mult: number) => { for (const x of targets) hurt(f, x, base * mult, 'ability'); };
    const add = (...xs: (Fighter | undefined)[]) => { for (const x of xs) if (x && !targets.includes(x)) targets.push(x); };
    switch (a.kind) {
      case 'fortify': {
        f.fortifyUntil = t + a.beats; f.fortifyReduction = a.reduction;
        add(f); say();
        events.push({ t, type: 'fortify', dst: f.uid, until: f.fortifyUntil });
        break;
      }
      case 'volley': {
        const cols = a.columns === 'adjacent' ? [f.col - 1, f.col + 1] : [f.col - 1, f.col, f.col + 1];
        const list = foes(f);
        for (const c of cols) add(c >= 0 && c < SIZE ? inColumn(list, c, a.target) : undefined);
        if (!targets.length) add(pickTarget(f, a.target));
        say(); strikeAll(a.mult);
        break;
      }
      case 'column-strike': {
        const first = pickTarget(f, 'front');
        if (first) add(...foes(f).filter((o) => inCol(o, first.col)).sort((p, q) => rowIn(p, first.col, 'front') - rowIn(q, first.col, 'front')));
        say(); strikeAll(a.mult);
        break;
      }
      case 'row-strike': {
        const first = pickTarget(f, 'front');
        if (first) add(...foes(f).filter((o) => inRow(o, first.row)).sort((p, q) => p.col - q.col));
        say(); strikeAll(a.mult);
        break;
      }
      case 'rows-strike': {
        const first = pickTarget(f, 'front');
        if (first) add(...foes(f).filter((o) => o.cells.some((c) => rowOf(c) >= first.row && rowOf(c) < first.row + a.depth)));
        say(); strikeAll(a.mult);
        break;
      }
      case 'front-line': {
        const list = foes(f);
        for (let c = 0; c < SIZE; c++) add(inColumn(list, c, 'front'));
        say();
        for (const x of targets) {
          if (a.shatter) shatterAll(x, f.uid);
          hurt(f, x, base * a.mult, 'ability');
        }
        break;
      }
      case 'splash-strike': {
        const first = pickTarget(f);
        if (first) add(first, ...besideRow(first));
        say(); strikeAll(a.mult);
        break;
      }
      case 'snipe': {
        add(pickTarget(f, 'back'));
        say(); strikeAll(a.mult);
        break;
      }
      case 'mortar': {
        const x = pickTarget(f, 'back');
        if (x) add(x, ...besideRow(x));
        say(); strikeAll(a.mult);
        break;
      }
      case 'mark': {
        const x = pickTarget(f, 'back');
        add(x); say();
        if (x) {
          hurt(f, x, base * a.mult, 'ability');
          if (x.alive) { x.markedUntil = t + a.beats; x.vulnerable = a.vulnerable; buff(f, x, 'mark', x.markedUntil); }
        }
        break;
      }
      case 'gore': {
        const x = pickTarget(f, 'front');
        if (x) add(x, behind(x));
        say(); strikeAll(a.mult);
        break;
      }
      case 'venom': {
        const x = pickTarget(f, 'front');
        if (x) { add(x); if (a.spread === 'behind') add(behind(x)); else add(...besideRow(x)); }
        say();
        for (const y of targets) y.poisons.push({ perBeat: (base * a.mult) / a.beats, until: t + a.beats, src: f.uid });
        break;
      }
      case 'heal-row': {
        add(...allies(f).filter((o) => inRow(o, f.row)));
        say();
        for (const x of targets) heal(f, x, x.maxHp * a.fraction);
        break;
      }
      case 'heal-column': {
        add(...allies(f).filter((o) => inCol(o, f.col)));
        say();
        for (const x of targets) heal(f, x, x.maxHp * a.fraction);
        break;
      }
      case 'heal-all': {
        add(...allies(f));
        say();
        for (const x of targets) heal(f, x, x.maxHp * a.fraction);
        break;
      }
      case 'shield-column':
      case 'guard': {
        if (a.kind === 'shield-column') add(...allies(f).filter((o) => inCol(o, f.col)));
        else add(f, ...adjacent(f));
        say();
        for (const x of targets) {
          const amount = (a.kind === 'guard' ? f.maxHp : x.maxHp) * a.fraction;
          x.shield += amount;
          events.push({ t, type: 'shield', src: f.uid, dst: x.uid, amount: Math.round(amount), shield: Math.round(x.shield) });
        }
        break;
      }
      case 'reseal': {
        const last = shatteredOrder[f.team].at(-1);
        if (last !== undefined && !resealUsed.has(f.uid)) {
          const ms = members(f.team, last).filter((m) => m.alive);
          if (ms.length) {
            resealUsed.add(f.uid);
            shatteredOrder[f.team].pop();
            sealedNow[f.team].add(last);
            add(...ms); say();
            for (const m of ms) {
              applySeal(m, last);
              events.push({ t, type: 'stats', uid: m.uid, maxHp: Math.round(m.maxHp), hp: Math.round(m.hp) });
            }
            events.push({ t, type: 'reseal', team: f.team, cage: last, by: f.uid, members: ms.map((m) => m.uid) });
            break;
          }
        }
        const worst = allies(f).reduce<Fighter | undefined>((w, o) => (!w || o.hp / o.maxHp < w.hp / w.maxHp ? o : w), undefined);
        add(worst); say();
        if (worst) heal(f, worst, worst.maxHp * a.fallbackHeal);
        break;
      }
      case 'crash': {
        const x = pickTarget(f, 'front');
        add(x); say();
        if (x) { shatterAll(x, f.uid); hurt(f, x, base * a.mult, 'ability'); }
        break;
      }
      case 'cage-strike': {
        const x = pickTarget(f, 'front');
        if (x) add(x, ...foes(f).filter((o) => o.cages.some((c) => x.cages.includes(c))));
        say();
        if (x) shatterAll(x, f.uid);
        strikeAll(a.mult);
        break;
      }
      case 'censor': {
        const enemyTeam: Team = f.team === PLAYER ? ENEMY : PLAYER;
        let best = -1, most = 0;
        for (const c of [...sealedNow[enemyTeam]].sort((p, q) => p - q)) {
          const n = members(enemyTeam, c).filter((m) => m.alive).length;
          if (n > most) { most = n; best = c; }
        }
        if (best >= 0) {
          add(...members(enemyTeam, best).filter((m) => m.alive));
          say();
          shatter(enemyTeam, best, f.uid);
          for (const x of targets) {
            hurt(f, x, base * a.mult, 'ability');
            if (x.alive) { x.stunnedUntil = t + a.beats; events.push({ t, type: 'stun', src: f.uid, dst: x.uid, until: x.stunnedUntil }); }
          }
        } else {
          add(pickTarget(f, 'front')); say(); strikeAll(a.mult);
        }
        break;
      }
      case 'unmake': {
        const enemyTeam: Team = f.team === PLAYER ? ENEMY : PLAYER;
        const cages = [...sealedNow[enemyTeam]].filter((c) => members(enemyTeam, c).some((m) => m.alive && inCol(m, f.col)));
        for (const c of cages) add(...members(enemyTeam, c).filter((m) => m.alive));
        if (!targets.length) add(pickTarget(f, 'front'));
        say();
        for (const c of cages) shatter(enemyTeam, c, f.uid);
        strikeAll(a.mult);
        break;
      }
      case 'stun':
      case 'stun-row': {
        const x = pickTarget(f, 'front');
        if (x) { if (a.kind === 'stun') add(x); else add(...foes(f).filter((o) => inRow(o, x.row))); }
        say();
        for (const y of targets) {
          hurt(f, y, base * a.mult, 'ability');
          if (y.alive) { y.stunnedUntil = t + a.beats; events.push({ t, type: 'stun', src: f.uid, dst: y.uid, until: y.stunnedUntil }); }
        }
        break;
      }
      case 'frenzy': {
        f.frenzyUntil = t + a.beats; f.frenzySpeed = a.speed;
        add(f); say(); buff(f, f, 'frenzy', f.frenzyUntil);
        break;
      }
      case 'bristle': {
        f.bristleUntil = t + a.beats; f.bristleReflect = a.reflect;
        add(f); say(); buff(f, f, 'bristle', f.bristleUntil);
        break;
      }
      case 'rally-cross': {
        add(...allies(f).filter((o) => inRow(o, f.row) || inCol(o, f.col)));
        say();
        for (const x of targets) {
          x.rallyDamage = Math.max(x.rallyUntil >= t ? x.rallyDamage : 0, a.damage);
          x.rallyUntil = t + a.beats;
          buff(f, x, 'rally', x.rallyUntil);
        }
        break;
      }
      case 'topple': {
        const cols = [...new Set(f.cells.map(colOf))];
        add(...foes(f).filter((o) => cols.some((c) => inCol(o, c))));
        say(); strikeAll(a.mult);
        break;
      }
    }
  }

  // ---- The fight --------------------------------------------------------------------------
  const order = (team: Team) => fighters.filter((f) => f.team === team).sort((a, b) => a.row - b.row || a.col - b.col);
  const orders: [Fighter[], Fighter[]] = [order(PLAYER), order(ENEMY)];
  const startHp: [number, number] = [0, 1].map((team) => fighters.filter((f) => f.team === team).reduce((s, f) => s + f.maxHp, 0)) as [number, number];
  let winner: Team | 'draw' | null = null;
  const decide = (): Team | 'draw' | null => {
    const a = living(PLAYER).length, b = living(ENEMY).length;
    if (!a && !b) return 'draw';
    if (!b) return PLAYER;
    if (!a) return ENEMY;
    return null;
  };
  winner = decide();
  let lastBeat = 0;

  for (t = 1; t <= OVERTIME.end && winner === null; t++) {
    lastBeat = t;
    // Poison, regeneration and overtime come first each beat.
    for (const f of fighters) {
      if (!f.alive || !f.poisons.length) continue;
      for (const p of f.poisons) if (p.until >= t) hurt(byUid.get(p.src) ?? null, f, p.perBeat, 'poison');
      f.poisons = f.poisons.filter((p) => p.until > t);
    }
    if (t % REGEN_EVERY === 0) {
      for (const team of [PLAYER, ENEMY] as const) {
        const level = callingLevel[team].get('mender') ?? 0;
        if (!level) continue;
        for (const f of living(team)) heal(null, f, f.maxHp * CALLINGS.mender.values[level - 1]!);
      }
    }
    if (t === OVERTIME.start + 1) events.push({ t, type: 'overtime' });
    if (t > OVERTIME.start) {
      for (const f of fighters) if (f.alive) hurt(null, f, f.maxHp * OVERTIME.rate * (t - OVERTIME.start), 'overtime');
    }
    // Actions: front row to back, left to right; the side that moves first alternates.
    const first: Team = t % 2 === 1 ? PLAYER : ENEMY;
    for (const team of [first, (1 - first) as Team]) {
      for (const f of orders[team]) {
        if (!f.alive || f.stunnedUntil >= t) continue;
        f.cooldown -= 1;
        if (f.cooldown > 0) continue;
        f.cooldown += interval(f);
        if (f.mana >= f.manaMax) { f.mana = 0; cast(f); } else attack(f);
      }
    }
    winner = decide();
  }
  const beats = lastBeat;
  t = beats;
  if (winner === null) {
    const share = (team: Team) => living(team).reduce((s, f) => s + Math.max(0, f.hp), 0) / (startHp[team] || 1);
    const a = share(PLAYER), b = share(ENEMY);
    winner = a > b ? PLAYER : b > a ? ENEMY : 'draw';
  }
  events.push({ t: beats, type: 'end', winner });

  return {
    winner, beats, events, fighters: snapshot, sealedAtStart, traits: traitTallies,
    damageDealt, damageTaken, survivors: fighters.filter((f) => f.alive).map((f) => f.uid),
  };
}

export const beatsToSeconds = (beats: number) => beats / BEATS_PER_SECOND;
