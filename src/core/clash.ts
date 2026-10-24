/**
 * The Clash: a pure function of two pages and the units standing on them.
 * No dice, no clock, no movement. The same input always produces the same event log.
 */
import {
  BEATS_PER_SECOND, MANA_PER_ATTACK, MANA_PER_HIT_TAKEN, OPENING_DELAY, OVERTIME, REGEN_EVERY,
  SEAL, SEAL_SIZE_FACTOR, STAR_MULT, heft,
} from '../content/balance';
import { speciesById } from '../content/species';
import { CALLINGS, CALLING_BASE, KINS, SERPENT_DAMAGE } from '../content/traits';
import type { Ability, CallingId, KinId, Species } from '../content/types';
import { CELLS, SIZE, colOf, neighbors, rowOf } from './grid';
import type { Page } from './page';
import { boardValues, isSealed } from './rules';

export type Team = 0 | 1;
export const PLAYER: Team = 0;
export const ENEMY: Team = 1;

/** A unit as placed by the player or the opponent generator. */
export interface UnitSpec {
  uid: string;
  species: string;
  n: number;
  stars: 1 | 2 | 3;
  cell: number;
}

export interface Side {
  page: Page;
  units: UnitSpec[];
}

export type DamageKind = 'hit' | 'pierce' | 'splash' | 'ability' | 'poison' | 'overtime';

export type ClashEvent =
  | { t: number; type: 'attack'; src: string; dst: string }
  | { t: number; type: 'cast'; src: string; ability: Ability['kind']; targets: string[] }
  | { t: number; type: 'damage'; src: string | null; dst: string; amount: number; absorbed: number; kind: DamageKind; hp: number; shield: number }
  | { t: number; type: 'evade'; src: string; dst: string }
  | { t: number; type: 'heal'; src: string | null; dst: string; amount: number; hp: number }
  | { t: number; type: 'shield'; src: string; dst: string; amount: number; shield: number }
  | { t: number; type: 'fortify'; dst: string; until: number }
  | { t: number; type: 'stun'; src: string; dst: string; until: number }
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
  stars: number;
  cell: number;
  maxHp: number;
  hp: number;
  shield: number;
  cage: number;
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

interface Fighter {
  uid: string;
  team: Team;
  sp: Species;
  n: number;
  stars: number;
  cell: number;
  row: number;
  col: number;
  cage: number;
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
  /** Permanent multipliers from Kins and Callings. */
  traitDamage: number;
  traitSpeed: number;
  armor: number;
  /** Seal bonuses currently applied (0 when the cage is broken). */
  sealHp: number;
  sealDamage: number;
  sealSpeed: number;
  sealMult: number;
  fortifyUntil: number;
  fortifyReduction: number;
  stunnedUntil: number;
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
    if (!kinSpecies.has(sp.kin)) kinSpecies.set(sp.kin, new Set());
    if (!callingSpecies.has(sp.calling)) callingSpecies.set(sp.calling, new Set());
    kinSpecies.get(sp.kin)!.add(sp.id);
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
  let t = 0;

  // ---- Build fighters ---------------------------------------------------------------------
  for (const team of [PLAYER, ENEMY] as const) {
    const side = sides[team];
    const { kins, callings } = tallyTraits(side.units);
    traitTallies[team] = [...kins, ...callings];
    const kinLevel = new Map(kins.map((k) => [k.id as KinId, k.level]));
    for (const c of callings) callingLevel[team].set(c.id as CallingId, c.level);

    const placed = new Array<number>(CELLS).fill(0);
    for (const u of side.units) placed[u.cell] = u.n;
    const values = boardValues(side.page, placed);
    const unitAt = new Map(side.units.map((u) => [u.cell, u]));
    for (const cage of side.page.cages) {
      const allUnits = cage.cells.every((c) => side.page.stones[c] || unitAt.has(c));
      if (allUnits && isSealed(cage, values)) { sealedNow[team].add(cage.id); sealedAtStart[team].push(cage.id); }
    }

    const rowFull = (r: number) => Array.from({ length: SIZE }, (_, c) => values[r * SIZE + c]).every((v) => v);
    const colFull = (c: number) => Array.from({ length: SIZE }, (_, r) => values[r * SIZE + c]).every((v) => v);

    for (const u of side.units) {
      const sp = speciesById(u.species);
      const h = heft(u.n), star = STAR_MULT[u.stars - 1]!;
      const row = rowOf(u.cell), col = colOf(u.cell);
      const f: Fighter = {
        uid: u.uid, team, sp, n: u.n, stars: u.stars, cell: u.cell, row, col,
        cage: side.page.cageOf[u.cell]!,
        baseMaxHp: sp.hp * h * star, maxHp: 0, hp: 0, shield: 0,
        attack: sp.attack * h * star,
        baseInterval: sp.interval * h,
        cooldown: 0, mana: 0, manaMax: sp.mana, alive: true,
        traitDamage: 1, traitSpeed: 1, armor: 0,
        sealHp: 0, sealDamage: 0, sealSpeed: 0, sealMult: 1,
        fortifyUntil: -1, fortifyReduction: 0, stunnedUntil: -1, poisons: [],
        evadeEvery: 0, hitsTaken: 0, brokeFirst: new Set(), notes: [],
      };
      f.maxHp = f.baseMaxHp;

      // Kins: each keys off a feature of the page, judged as the clash begins.
      const kl = kinLevel.get(sp.kin) ?? 0;
      if (kl > 0) {
        const v = KINS[sp.kin].values[kl - 1]!;
        if (sp.kin === 'snail' && neighbors(u.cell).some((c) => side.page.stones[c])) {
          f.armor = v; f.notes.push(`Snails: ${pct(v)} less damage beside a stone`);
        }
        if (sp.kin === 'hare') {
          const others = side.units.filter((o) => o !== u && rowOf(o.cell) === row && speciesById(o.species).kin === 'hare').length;
          if (others) { f.traitSpeed *= 1 + v * others; f.notes.push(`Hares: ${pct(v * others)} faster`); }
        }
        if (sp.kin === 'boar') {
          const behind = side.units.filter((o) => colOf(o.cell) === col && rowOf(o.cell) > row && speciesById(o.species).kin === 'boar').length;
          if (behind) { f.traitDamage *= 1 + v * behind; f.notes.push(`Boars: ${pct(v * behind)} harder`); }
        }
        if (sp.kin === 'owl') { f.sealMult = v; }
        if (sp.kin === 'serpent' && !neighbors(u.cell).some((c) => unitAt.has(c))) {
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
  const members = (team: Team, cage: number) => fighters.filter((f) => f.team === team && f.cage === cage);

  const interval = (f: Fighter) => f.baseInterval / (f.traitSpeed * (1 + f.sealSpeed));
  const damageOf = (f: Fighter) => f.attack * f.traitDamage * (1 + f.sealDamage);

  function applySeal(f: Fighter) {
    const cage = sides[f.team].page.cages[f.cage]!;
    const factor = (SEAL_SIZE_FACTOR[cage.cells.length] ?? 1) * f.sealMult;
    const bonus = SEAL[cage.op] as { hp?: number; damage?: number; speed?: number; startMana?: number };
    if (bonus.hp) {
      f.sealHp = f.baseMaxHp * bonus.hp * factor;
      f.maxHp += f.sealHp; f.hp += f.sealHp;
    }
    if (bonus.damage) f.sealDamage = bonus.damage * factor;
    if (bonus.speed) f.sealSpeed = bonus.speed * factor;
    if (bonus.startMana && t === 0) f.mana = Math.min(f.manaMax, f.manaMax * bonus.startMana * factor);
  }

  function removeSeal(f: Fighter) {
    if (f.sealHp) {
      f.maxHp -= f.sealHp;
      f.hp = Math.max(1, Math.min(f.hp, f.maxHp));
      f.sealHp = 0;
    }
    f.sealDamage = 0; f.sealSpeed = 0;
  }

  // ---- Opening state ----------------------------------------------------------------------
  for (const f of fighters) {
    f.hp = f.maxHp;
    if (sealedNow[f.team].has(f.cage)) applySeal(f);
    const wardenLevel = callingLevel[f.team].get('warden') ?? 0;
    if (f.sp.calling === 'warden' && wardenLevel > 0) {
      f.shield = f.maxHp * CALLINGS.warden.values[wardenLevel - 1]!;
      f.notes.push(`Wardens: starts with a ${pct(CALLINGS.warden.values[wardenLevel - 1]!)} shield`);
    }
    f.cooldown = interval(f) * OPENING_DELAY;
  }

  const snapshot: FighterSnapshot[] = fighters.map((f) => ({
    uid: f.uid, team: f.team, species: f.sp.id, n: f.n, stars: f.stars, cell: f.cell,
    maxHp: Math.round(f.maxHp), hp: Math.round(f.hp), shield: Math.round(f.shield), cage: f.cage,
    sealed: sealedNow[f.team].has(f.cage), notes: f.notes.slice(),
  }));

  // ---- Effects ----------------------------------------------------------------------------
  function shatter(team: Team, cage: number, by: string | null) {
    if (!sealedNow[team].has(cage)) return;
    sealedNow[team].delete(cage);
    shatteredOrder[team].push(cage);
    const ms = members(team, cage);
    for (const m of ms) if (m.alive) {
      removeSeal(m);
      events.push({ t, type: 'stats', uid: m.uid, maxHp: Math.round(m.maxHp), hp: Math.round(m.hp) });
    }
    events.push({ t, type: 'shatter', team, cage, by, members: ms.map((m) => m.uid) });
  }

  function kill(f: Fighter, by: string | null) {
    f.alive = false; f.hp = 0; f.shield = 0;
    events.push({ t, type: 'death', uid: f.uid, by });
    if (sealedNow[f.team].has(f.cage)) shatter(f.team, f.cage, by);
  }

  function hurt(src: Fighter | null, dst: Fighter, raw: number, kind: DamageKind) {
    if (!dst.alive || raw <= 0) return;
    if (kind === 'hit' && dst.evadeEvery) {
      dst.hitsTaken++;
      if (dst.hitsTaken % dst.evadeEvery === 0) { events.push({ t, type: 'evade', src: src!.uid, dst: dst.uid }); return; }
    }
    let amount = raw;
    if (kind !== 'overtime') {
      amount *= 1 - dst.armor;
      if (dst.fortifyUntil >= t) amount *= 1 - dst.fortifyReduction;
    }
    const absorbed = Math.min(dst.shield, amount);
    dst.shield -= absorbed;
    const dealt = amount - absorbed;
    dst.hp -= dealt;
    if (src) damageDealt[src.uid] = (damageDealt[src.uid] ?? 0) + amount;
    damageTaken[dst.uid] = (damageTaken[dst.uid] ?? 0) + amount;
    if (kind !== 'poison' && kind !== 'overtime') dst.mana = Math.min(dst.manaMax, dst.mana + MANA_PER_HIT_TAKEN);
    events.push({
      t, type: 'damage', src: src?.uid ?? null, dst: dst.uid, amount: Math.round(amount), absorbed: Math.round(absorbed),
      kind, hp: Math.max(0, Math.round(dst.hp)), shield: Math.round(dst.shield),
    });
    if (dst.hp <= 0) kill(dst, src?.uid ?? null);
  }

  function heal(src: Fighter | null, dst: Fighter, amount: number) {
    if (!dst.alive) return;
    const before = dst.hp;
    dst.hp = Math.min(dst.maxHp, dst.hp + amount);
    if (dst.hp > before) events.push({ t, type: 'heal', src: src?.uid ?? null, dst: dst.uid, amount: Math.round(dst.hp - before), hp: Math.round(dst.hp) });
  }

  // ---- Targeting --------------------------------------------------------------------------
  const foes = (f: Fighter) => fighters.filter((o) => o.alive && o.team !== f.team);
  function inColumn(list: Fighter[], col: number, end: 'front' | 'back'): Fighter | undefined {
    let best: Fighter | undefined;
    for (const o of list) {
      if (o.col !== col) continue;
      if (!best || (end === 'front' ? o.row < best.row : o.row > best.row)) best = o;
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
  const behind = (target: Fighter) => {
    let best: Fighter | undefined;
    for (const o of fighters) {
      if (!o.alive || o.team !== target.team || o.col !== target.col || o.row <= target.row) continue;
      if (!best || o.row < best.row) best = o;
    }
    return best;
  };
  const besideRow = (target: Fighter) => fighters.filter((o) => o.alive && o.team === target.team && o.row === target.row && Math.abs(o.col - target.col) === 1);

  // ---- Actions ----------------------------------------------------------------------------
  function breakerHit(f: Fighter, target: Fighter, base: number): number {
    if (f.sp.calling !== 'breaker' || !sealedNow[target.team].has(target.cage)) return base;
    const level = callingLevel[f.team].get('breaker') ?? 0;
    const key = cageKey(target.team, target.cage);
    if (level >= 2 && !f.brokeFirst.has(key)) { f.brokeFirst.add(key); shatter(target.team, target.cage, f.uid); }
    else if (level === 1 && !firstBreakUsed[f.team]) { firstBreakUsed[f.team] = true; shatter(target.team, target.cage, f.uid); }
    return base * (1 + CALLING_BASE.breakerBonus);
  }

  function attack(f: Fighter) {
    const target = pickTarget(f);
    if (!target) return;
    events.push({ t, type: 'attack', src: f.uid, dst: target.uid });
    const base = damageOf(f);
    const sealedTarget = sealedNow[target.team].has(target.cage);
    const dmg = f.sp.calling === 'breaker' && sealedTarget ? breakerHit(f, target, base) : base;
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

  function cast(f: Fighter) {
    const a = f.sp.ability;
    const base = damageOf(f);
    const targets: Fighter[] = [];
    const say = () => events.push({ t, type: 'cast', src: f.uid, ability: a.kind, targets: targets.map((x) => x.uid) });
    switch (a.kind) {
      case 'fortify': {
        f.fortifyUntil = t + a.beats; f.fortifyReduction = a.reduction;
        targets.push(f); say();
        events.push({ t, type: 'fortify', dst: f.uid, until: f.fortifyUntil });
        break;
      }
      case 'volley': {
        const cols = a.columns === 'adjacent' ? [f.col - 1, f.col + 1] : [f.col - 1, f.col, f.col + 1];
        const list = foes(f);
        for (const c of cols) { const hit = c >= 0 && c < SIZE ? inColumn(list, c, a.target) : undefined; if (hit) targets.push(hit); }
        if (!targets.length) { const fallback = pickTarget(f, a.target); if (fallback) targets.push(fallback); }
        say();
        for (const x of targets) hurt(f, x, base * a.mult, 'ability');
        break;
      }
      case 'column-strike': {
        const first = pickTarget(f, 'front');
        if (first) targets.push(...foes(f).filter((o) => o.col === first.col).sort((p, q) => p.row - q.row));
        say();
        for (const x of targets) hurt(f, x, base * a.mult, 'ability');
        break;
      }
      case 'row-strike': {
        const first = pickTarget(f, 'front');
        if (first) targets.push(...foes(f).filter((o) => o.row === first.row).sort((p, q) => p.col - q.col));
        say();
        for (const x of targets) hurt(f, x, base * a.mult, 'ability');
        break;
      }
      case 'splash-strike': {
        const first = pickTarget(f);
        if (first) targets.push(first, ...besideRow(first));
        say();
        for (const x of targets) hurt(f, x, base * a.mult, 'ability');
        break;
      }
      case 'snipe': {
        const x = pickTarget(f, 'back');
        if (x) targets.push(x);
        say();
        for (const y of targets) hurt(f, y, base * a.mult, 'ability');
        break;
      }
      case 'venom': {
        const x = pickTarget(f, 'front');
        if (x) { targets.push(x); const b = behind(x); if (b) targets.push(b); }
        say();
        for (const y of targets) y.poisons.push({ perBeat: (base * a.mult) / a.beats, until: t + a.beats, src: f.uid });
        break;
      }
      case 'heal-row': {
        targets.push(...fighters.filter((o) => o.alive && o.team === f.team && o.row === f.row));
        say();
        for (const x of targets) heal(f, x, x.maxHp * a.fraction);
        break;
      }
      case 'shield-column': {
        targets.push(...fighters.filter((o) => o.alive && o.team === f.team && o.col === f.col));
        say();
        for (const x of targets) {
          const amount = x.maxHp * a.fraction;
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
            targets.push(...ms); say();
            for (const m of ms) {
              applySeal(m);
              events.push({ t, type: 'stats', uid: m.uid, maxHp: Math.round(m.maxHp), hp: Math.round(m.hp) });
            }
            events.push({ t, type: 'reseal', team: f.team, cage: last, by: f.uid, members: ms.map((m) => m.uid) });
            break;
          }
        }
        const allies = fighters.filter((o) => o.alive && o.team === f.team);
        const worst = allies.reduce<Fighter | undefined>((w, o) => (!w || o.hp / o.maxHp < w.hp / w.maxHp ? o : w), undefined);
        if (worst) targets.push(worst);
        say();
        if (worst) heal(f, worst, worst.maxHp * a.fallbackHeal);
        break;
      }
      case 'crash': {
        const x = pickTarget(f, 'front');
        if (x) targets.push(x);
        say();
        if (x) {
          if (sealedNow[x.team].has(x.cage)) shatter(x.team, x.cage, f.uid);
          hurt(f, x, base * a.mult, 'ability');
        }
        break;
      }
      case 'unmake': {
        const enemyTeam: Team = f.team === PLAYER ? ENEMY : PLAYER;
        const cages = [...sealedNow[enemyTeam]].filter((c) => members(enemyTeam, c).some((m) => m.alive && m.col === f.col));
        for (const c of cages) targets.push(...members(enemyTeam, c).filter((m) => m.alive));
        if (!targets.length) { const x = pickTarget(f, 'front'); if (x) targets.push(x); }
        say();
        for (const c of cages) shatter(enemyTeam, c, f.uid);
        for (const x of targets) hurt(f, x, base * a.mult, 'ability');
        break;
      }
      case 'stun': {
        const x = pickTarget(f, 'front');
        if (x) targets.push(x);
        say();
        if (x) {
          hurt(f, x, base * a.mult, 'ability');
          if (x.alive) { x.stunnedUntil = t + a.beats; events.push({ t, type: 'stun', src: f.uid, dst: x.uid, until: x.stunnedUntil }); }
        }
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
