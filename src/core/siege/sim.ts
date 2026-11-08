/**
 * A wave of Garden Siege, simulated in fixed ticks. The same garden and wave always play out the
 * same way: there is no randomness in a wave at all. The app steps it to show it; bots and tests run
 * it to the end at once.
 */
import { DEFENDERS, type DefenderId, PESTS, type PestId, SIEGE, WAVES } from '../../content/siege';
import { type Field, type Pt, type Route, airRoute, cellOn, groundRoute, pointAt, underAt } from './field';

export interface Mob {
  id: number;
  kind: PestId;
  hp: number;
  max: number;
  /** The gap it came in by. */
  entry: number;
  /** How far along its route it has come. */
  d: number;
  /** Slowed until this tick, to `slow` of its speed. */
  slowUntil: number;
  slow: number;
}

export interface Tower {
  id: number;
  kind: DefenderId;
  level: number;
  cell: number;
  at: Pt;
  /** Its reach and harm here: rich soil reaches further, a pond's bank strikes harder for water. */
  range: number;
  boost: number;
  /** The tick it can strike again. */
  ready: number;
}

/** A strike this tick, for drawing: who struck, and where. */
export interface Strike { tower: number; to: Pt[] }

export interface WaveSim {
  field: Field;
  wave: number;
  tick: number;
  /** Each pest's strength is multiplied by this. */
  scale: number;
  mods: Mods;
  mobs: Mob[];
  towers: Tower[];
  /** Pests still to come in: the tick each arrives, in order. */
  queue: { tick: number; kind: PestId }[];
  next: number;
  /** Routes from each gap: walking, and flying. */
  ground: Route[];
  air: Route[];
  nextId: number;
  /** Seedlings eaten, pests stopped and pests that got through, so far. */
  eaten: number;
  stopped: number;
  leaked: number;
  /** Coins from pests stopped, so far. */
  earned: number;
  strikes: Strike[];
  done: boolean;
}

/** Seedlings a pest eats if it reaches the bed: its own bite, and what its next layers would eat. */
export function biteOf(kind: PestId): number {
  const p = PESTS[kind];
  return (p.bite ?? 1) + (p.child ? p.child.count * biteOf(p.child.kind) : 0);
}

/** Pests in a wave, counting every layer: what has to be stopped. */
export function layersOf(kind: PestId): number {
  const p = PESTS[kind];
  return 1 + (p.child ? p.child.count * layersOf(p.child.kind) : 0);
}

export const toughness = (wave: number) => SIEGE.toughness[Math.min(wave, SIEGE.toughness.length) - 1]!;

export function waveQueue(wave: number): { tick: number; kind: PestId }[] {
  const out: { tick: number; kind: PestId; order: number }[] = [];
  let order = 0;
  for (const g of WAVES[wave - 1] ?? []) {
    for (let i = 0; i < g.count; i++) out.push({ tick: Math.round((g.at + i * g.gap) / SIEGE.tick), kind: g.kind, order: order++ });
  }
  return out.sort((a, b) => a.tick - b.tick || a.order - b.order).map(({ tick, kind }) => ({ tick, kind }));
}

/** A defender's reach and harm on its tile. */
export function bonusAt(f: Field, kind: DefenderId, level: number, cell: number): { range: number; boost: number } {
  const def = DEFENDERS[kind];
  const range = def.levels[level]!.range + (f.terrain[cell] === 'rich' ? SIEGE.richReach : 0);
  const boost = def.elements.includes('water') && f.nbrs[cell]!.some((n) => f.terrain[n] === 'pond') ? SIEGE.pondBoost : 1;
  return { range, boost };
}

/** The Shed's improvements a wave feels: how hard brambles scratch, and how much harder everything strikes. */
export interface Mods { thorns: number; harm: number }
const NO_MODS: Mods = { thorns: 1, harm: 1 };

export function newWaveSim(
  f: Field, wave: number, walks: readonly (readonly number[])[], towers: readonly { id: number; kind: DefenderId; level: number; cell: number }[], mods: Mods = NO_MODS,
): WaveSim {
  return {
    field: f, wave, tick: 0, scale: toughness(wave) * f.map.strength, mobs: [], mods,
    // Beehives never strike: they're no towers in a wave.
    towers: towers.filter((t) => DEFENDERS[t.kind].levels[t.level]!.damage > 0)
      .map((t) => ({ id: t.id, kind: t.kind, level: t.level, cell: t.cell, at: f.mids[t.cell]!, ...bonusAt(f, t.kind, t.level, t.cell), ready: 0 })),
    queue: waveQueue(wave), next: 0, ground: walks.map((walk) => groundRoute(f, walk)), air: f.entries.map((_, e) => airRoute(f, e)), nextId: 1,
    eaten: 0, stopped: 0, leaked: 0, earned: 0, strikes: [], done: false,
  };
}

export const routeFor = (w: WaveSim, m: Mob): Route => (PESTS[m.kind].flies ? w.air : w.ground)[m.entry]!;
export const mobAt = (w: WaveSim, m: Mob): Pt => pointAt(routeFor(w, m), m.d);
/** Whether a pest is underground in a rabbit hole: out of every defender's reach. */
export const isUnder = (w: WaveSim, m: Mob): boolean => !PESTS[m.kind].flies && underAt(routeFor(w, m), m.d);
const progress = (w: WaveSim, m: Mob) => m.d / routeFor(w, m).len;

function spawn(w: WaveSim, kind: PestId, entry: number, d: number) {
  const hp = Math.round(PESTS[kind].hp * w.scale * 10) / 10;
  w.mobs.push({ id: w.nextId++, kind, hp, max: hp, entry, d, slowUntil: 0, slow: 1 });
}

function harm(w: WaveSim, t: Tower, m: Mob, dmg: number, hit: Set<Mob>) {
  const def = DEFENDERS[t.kind], lv = def.levels[t.level]!;
  const flies = PESTS[m.kind].flies;
  if (flies && def.air === 'no') return;
  hit.add(m);
  const base = t.kind === 'bramble' ? w.mods.thorns : dmg;
  const raw = base * t.boost * w.mods.harm * (flies && def.air === 'double' ? 2 : 1);
  m.hp -= Math.max(0, raw - (def.pierce ? 0 : PESTS[m.kind].armour));
  if (lv.slow !== undefined && lv.slowFor) { m.slow = Math.min(m.slow < 1 && m.slowUntil > w.tick ? m.slow : 1, lv.slow); m.slowUntil = w.tick + Math.round(lv.slowFor / SIEGE.tick); }
}

/** One tick: pests arrive (taking turns at the gaps), defenders strike, the stopped leave their next layers, and the rest move on. */
export function stepWave(w: WaveSim) {
  if (w.done) return;
  w.strikes = [];
  while (w.next < w.queue.length && w.queue[w.next]!.tick <= w.tick) {
    const entry = w.next % w.field.entries.length;
    spawn(w, w.queue[w.next++]!.kind, entry, 0);
  }

  // Where each pest is, leaving out those underground.
  const pos = new Map<Mob, Pt>();
  for (const m of w.mobs) if (!isUnder(w, m)) pos.set(m, mobAt(w, m));
  for (const t of w.towers) {
    if (t.ready > w.tick) continue;
    const def = DEFENDERS[t.kind], lv = def.levels[t.level]!;
    const inReach = w.mobs.filter((m) => {
      const p = pos.get(m);
      return p && m.hp > 0 && (def.air !== 'no' || !PESTS[m.kind].flies) && Math.hypot(p.x - t.at.x, p.y - t.at.y) <= t.range;
    });
    if (!inReach.length) continue;
    // Strike the pests nearest the bed first.
    inReach.sort((a, b) => progress(w, b) - progress(w, a) || a.id - b.id);
    const targets = inReach.slice(0, lv.targets ?? 1);
    const hit = new Set<Mob>();
    for (const m of targets) {
      harm(w, t, m, lv.damage, hit);
      if (lv.splash) {
        const at = pos.get(m)!;
        for (const o of w.mobs) {
          const p = pos.get(o);
          if (p && !hit.has(o) && o.hp > 0 && Math.hypot(p.x - at.x, p.y - at.y) <= lv.splash) harm(w, t, o, lv.damage, hit);
        }
      }
    }
    if (!hit.size) continue;
    t.ready = w.tick + Math.max(1, Math.round(lv.every / SIEGE.tick));
    w.strikes.push({ tower: t.id, to: targets.map((m) => pos.get(m)!) });
  }

  const alive: Mob[] = [];
  const born: { kind: PestId; entry: number; d: number }[] = [];
  for (const m of w.mobs) {
    if (m.hp <= 0) {
      w.stopped++;
      w.earned += PESTS[m.kind].bounty;
      const child = PESTS[m.kind].child;
      if (child) for (let i = 0; i < child.count; i++) born.push({ kind: child.kind, entry: m.entry, d: Math.max(0, m.d - 0.18 * i) });
      continue;
    }
    const route = routeFor(w, m);
    const flies = PESTS[m.kind].flies;
    const here = cellOn(route, m.d);
    const mud = !flies && here >= 0 && w.field.terrain[here] === 'mud' ? SIEGE.mudSlow : 1;
    const speed = PESTS[m.kind].speed * (m.slowUntil > w.tick ? m.slow : 1) * mud;
    m.d += speed * SIEGE.tick;
    if (m.d >= route.len) { w.leaked++; w.eaten += biteOf(m.kind); continue; }
    alive.push(m);
  }
  w.mobs = alive;
  for (const b of born) spawn(w, b.kind, b.entry, b.d);
  w.tick++;
  if (w.next >= w.queue.length && !w.mobs.length) w.done = true;
}

/** Plays a wave to its end. */
export function runWave(w: WaveSim): WaveSim {
  for (let i = 0; i < 60000 && !w.done; i++) stepWave(w);
  return w;
}
