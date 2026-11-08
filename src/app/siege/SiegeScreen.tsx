/**
 * Garden Siege's screens: the field (its ground, brambles, defenders, the pests' ways, and the wave as
 * it plays), planting, growing and upgrading between waves, looking closer, the seeds of the four
 * elements, the Shed, and the season's end.
 */
import type { VNode } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { DEFENDERS, type DefenderId, type Element, ELEMENTS, ELEMENT_IDS, HYBRIDS, PESTS, type PestId, SHED, SHED_EFFECT, SHED_IDS, SIEGE, type ShedId, WAVES } from '../../content/siege';
import { mapById } from '../../content/siege-maps';
import { type Field, HEX_RADIUS, type Pt, airRoute, cellNear } from '../../core/siege/field';
import {
  type Placed, type SiegeState, costOf, fieldNow, growthsOf, honeyOf, improvePrice, interestOn, maxLevel, refundOf, siegeScore, unlockPrice, walksNow,
} from '../../core/siege/run';
import { biteOf, bonusAt, isUnder, mobAt } from '../../core/siege/sim';
import { coachOff, coachSeen, dismissTip } from '../coach';
import { Icon } from '../Icon';
import { ICON_BODIES, type IconName } from '../icons';
import { goBack, screen, sheet } from '../nav';
import { reducedMotion } from '../settings';
import {
  advance, beginStroke, beginWave, canUndo, dragField, finishNow, fitScale, frame, growSelected, improveShed, lastWave, paused, playing, refusedAt, releaseField,
  selected, sellSelected, siege, siegeBests, siegeMessage, speed, startSiege, tapField, undo, unlockElement, upgradeSelected, zoom,
} from './state';

export const PEST_ICON: Record<PestId, IconName> = { slug: 'slug', snail: 'snail', beetle: 'beetle', moth: 'moth', aphids: 'aphids', aphid: 'aphid', greatSnail: 'greatSnail' };
export const DEF_ICON: Record<DefenderId, IconName> = {
  bramble: 'bramble', hive: 'beehive', frog: 'frog', hedgehog: 'hedgehogWatch', thrush: 'thrush', marigold: 'marigold',
  toad: 'toad', dragonfly: 'dragonfly', salamander: 'salamander', mantis: 'mantis', owl: 'owl', bumblebee: 'bumblebee',
};
const SHED_ICON: Record<ShedId, IconName> = { compost: 'compost', thorns: 'thorns', frame: 'frame', can: 'can' };
const PEST_SIZE: Record<PestId, number> = { slug: 0.62, snail: 0.66, beetle: 0.62, moth: 0.68, aphids: 0.6, aphid: 0.38, greatSnail: 1.05 };
const ELEMENT_CLASS: Record<Element, string> = { water: 'el-water', earth: 'el-earth', air: 'el-air', sun: 'el-sun' };
const elementClass = (k: DefenderId) => (k === 'hive' ? 'el-hive' : DEFENDERS[k].elements.length ? ELEMENT_CLASS[DEFENDERS[k].elements[0]!] : 'el-none');
const coinWord = (n: number) => `${n} ${n === 1 ? 'coin' : 'coins'}`;
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---- The drawing ---------------------------------------------------------------------------------
// Tiles are CELL drawing units across; the hedge with its gaps runs above the field, the bed below.
const CELL = 40, INSET = 4, TOP = 16, BED = 22;
const X = (x: number) => INSET + x * CELL, Y = (y: number) => INSET + TOP + y * CELL;

/** The drawing's size for a field, in drawing units. */
export interface Geo { vw: number; vh: number }
export const geoOf = (f: Field): Geo => ({ vw: INSET * 2 + f.size.x * CELL, vh: INSET + TOP + f.size.y * CELL + BED + INSET });

/** A tile's outline, `inset` drawing units inside its edge. */
function tileD(f: Field, c: number, inset = 0): string {
  const m = f.mids[c]!;
  if (f.shape === 'square') {
    const x = X(m.x - 0.5) + inset, y = Y(m.y - 0.5) + inset, w = CELL - 2 * inset;
    return `M${x} ${y}h${w}v${w}h${-w}Z`;
  }
  const r = HEX_RADIUS * CELL - inset * 1.1547, cx = X(m.x), cy = Y(m.y);
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join('') + 'Z';
}

/** Each rabbit hole's pair, numbered from 1 in reading order, so partners share a colour. */
export function holePairs(f: Field): Map<number, number> {
  const out = new Map<number, number>();
  for (let c = 0; c < f.cells; c++) if (f.holeTo[c]! > c) { const n = out.size / 2 + 1; out.set(c, n); out.set(f.holeTo[c]!, n); }
  return out;
}

function Glyph({ name, x, y, size, cls }: { name: IconName; x: number; y: number; size: number; cls?: string }) {
  return <g class={cls} transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 512})`} dangerouslySetInnerHTML={{ __html: ICON_BODIES[name] }} />;
}

/** The ground of a garden: the hedge and its gaps, the bed and its gates, lawn, rock, pond, mud, rich soil and rabbit holes. Drawn once per garden. */
const grounds = new Map<string, VNode>();
function groundOf(f: Field): VNode {
  const known = grounds.get(f.map.id);
  if (known) return known;
  const W = f.size.x * CELL, H = f.size.y * CELL;
  const cellsOf = (t: string) => Array.from({ length: f.cells }, (_, c) => c).filter((c) => f.terrain[c] === t);
  const pairs = holePairs(f);
  const v = (
    <g class="sg-ground">
      <rect class="wb-hedge" x={X(0)} y={Y(0) - TOP} width={W} height={TOP - 3} rx="5" />
      {f.entries.map((e) => <rect key={`g${e}`} class="wb-gap" x={X(f.mids[e]!.x) - CELL / 2 + 6} y={Y(0) - TOP - 1} width={CELL - 12} height={TOP} />)}
      <rect class="wb-bed" x={X(0)} y={Y(f.size.y) + 4} width={W} height={BED - 6} rx="6" />
      {f.exits.map((x) => <rect key={`x${x}`} class="wb-gate" x={X(f.mids[x]!.x) - CELL / 2 + 8} y={Y(f.size.y) + 1} width={CELL - 16} height={7} rx="3" />)}
      {f.shape === 'square' ? (
        <>
          <rect class="sg-lawn" x={X(0)} y={Y(0)} width={W} height={H} />
          <path class="sg-grid" d={Array.from({ length: f.w - 1 }, (_, k) => `M${X(k + 1)} ${Y(0)}V${Y(f.size.y)}`).join('') + Array.from({ length: f.h - 1 }, (_, r) => `M${X(0)} ${Y(r + 1)}H${X(f.size.x)}`).join('')} />
        </>
      ) : <path class="sg-lawn hex" d={Array.from({ length: f.cells }, (_, c) => tileD(f, c)).join('')} />}
      {cellsOf('rich').map((c) => {
        const m = f.mids[c]!, x = X(m.x), y = Y(m.y);
        return (
          <g key={`r${c}`} class="sg-rich">
            <path d={tileD(f, c, 1)} />
            <path class="sg-sprouts" d={[[-13, -12], [13, -12], [-13, 13], [13, 13]].map(([dx, dy]) => `M${x + dx! - 3} ${y + dy! - 2}l3 3l3-3M${x + dx!} ${y + dy! + 1}v3`).join('')} />
          </g>
        );
      })}
      {cellsOf('mud').map((c) => {
        const m = f.mids[c]!, x = X(m.x), y = Y(m.y);
        return <g key={`m${c}`} class="sg-mud"><path d={tileD(f, c)} /><circle cx={x - 8} cy={y - 5} r="2.6" /><circle cx={x + 7} cy={y - 1} r="2" /><circle cx={x - 2} cy={y + 9} r="2.3" /></g>;
      })}
      {cellsOf('pond').length ? (
        <g class="sg-pond">
          <path d={cellsOf('pond').map((c) => tileD(f, c, -0.6)).join('')} />
          <path class="sg-ripple" d={cellsOf('pond').filter((c) => (f.rowOf(c) + f.colOf(c)) % 2 === 0).map((c) => { const m = f.mids[c]!; return `M${X(m.x) - 9} ${Y(m.y) + 2}q9-7 18 0`; }).join('')} />
        </g>
      ) : null}
      {cellsOf('rock').map((c) => {
        const m = f.mids[c]!;
        return (
          <g key={`k${c}`} class="sg-rock">
            {f.shape === 'square' ? <rect x={X(m.x) - CELL / 2 + 2} y={Y(m.y) - CELL / 2 + 2} width={CELL - 4} height={CELL - 4} rx="9" /> : <path d={tileD(f, c, 2)} />}
            <ellipse class="sg-rock-hi" cx={X(m.x) - 5} cy={Y(m.y) - 7} rx="8" ry="3.5" />
            <path class="sg-rock-crack" d={`M${X(m.x) + 4} ${Y(m.y) + 2}l5 4l-2 6`} />
          </g>
        );
      })}
      {cellsOf('hole').map((c) => {
        const m = f.mids[c]!;
        return (
          <g key={`h${c}`} class={`sg-hole p${pairs.get(c) ?? 1}`}>
            <ellipse class="sg-hole-ring" cx={X(m.x)} cy={Y(m.y)} rx="15" ry="12" />
            <ellipse class="sg-hole-pit" cx={X(m.x)} cy={Y(m.y) + 1} rx="10.5" ry="8" />
          </g>
        );
      })}
      {f.shape === 'square' ? <rect class="wb-frame" x={X(0)} y={Y(0)} width={W} height={H} rx="3" /> : null}
    </g>
  );
  grounds.set(f.map.id, v);
  return v;
}

/** A walking way as a line, with each rabbit hole's stretch underground drawn apart as an arc. */
function wayOf(f: Field, walk: readonly number[]): { line: string; tunnels: string[] } {
  const first = f.mids[walk[0]!]!, last = f.mids[walk[walk.length - 1]!]!;
  let line = `M${X(first.x)} ${Y(-0.3)}`;
  const tunnels: string[] = [];
  walk.forEach((c, i) => {
    const m = f.mids[c]!, prev = i ? walk[i - 1]! : -1;
    if (prev >= 0 && f.holeTo[prev] === c && !f.nbrs[prev]!.includes(c)) {
      const a = f.mids[prev]!, dx = m.x - a.x, dy = m.y - a.y, len = Math.hypot(dx, dy) || 1, bow = Math.min(2.5, len * 0.22);
      const cx = (a.x + m.x) / 2 - (dy / len) * bow, cy = (a.y + m.y) / 2 + (dx / len) * bow;
      tunnels.push(`M${X(a.x)} ${Y(a.y)}Q${X(cx)} ${Y(cy)} ${X(m.x)} ${Y(m.y)}`);
      line += `M${X(m.x)} ${Y(m.y)}`;
    } else line += `L${X(m.x)} ${Y(m.y)}`;
  });
  return { line: line + `L${X(last.x)} ${Y(f.size.y + 0.3)}`, tunnels };
}

/** A bramble: a rounded bush with thorns, on a tile centred at (cx, cy). */
function Bramble({ cx, cy, held }: { cx: number; cy: number; held: boolean }) {
  const x = cx - CELL / 2, y = cy - CELL / 2;
  return (
    <g class={`sg-bramble${held ? ' held' : ''}`}>
      <rect x={x + 3} y={y + 3} width={CELL - 6} height={CELL - 6} rx="10" />
      <path class="sg-thorns" d={`M${x + 9} ${y + 14}l-4-3M${x + 31} ${y + 12}l4-3M${x + 12} ${y + 30}l-4 3M${x + 29} ${y + 29}l4 3M${x + 20} ${y + 8}v-4`} />
      <circle cx={x + 15} cy={y + 17} r="3.2" /><circle cx={x + 25} cy={y + 22} r="3.2" />
    </g>
  );
}

function Piece({ f, p, held }: { f: Field; p: Placed; held: boolean }) {
  const m = f.mids[p.cell]!, cx = X(m.x), cy = Y(m.y);
  if (p.kind === 'bramble') return <Bramble cx={cx} cy={cy} held={held} />;
  const hybrid = DEFENDERS[p.kind].tier === 2;
  return (
    <g class={`sg-def ${elementClass(p.kind)}${hybrid ? ' hybrid' : ''}${held ? ' held' : ''}`}>
      <circle class="sg-def-ring" cx={cx} cy={cy} r={CELL / 2 - 3} />
      {hybrid ? <circle class={`sg-def-ring2 ${ELEMENT_CLASS[DEFENDERS[p.kind].elements[1]!]}`} cx={cx} cy={cy} r={CELL / 2 - 6.5} /> : null}
      <Glyph name={DEF_ICON[p.kind]} x={cx} y={cy - 1} size={hybrid ? 21 : 24} cls="sg-def-ico" />
      {Array.from({ length: p.level + 1 }, (_, i) => <circle key={i} class="sg-pip" cx={cx + (i - p.level / 2) * 7} cy={cy + CELL / 2 - 5} r="2.4" />)}
    </g>
  );
}

// ---- Looking closer ------------------------------------------------------------------------------
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** The closest look: tiles about 60 screen pixels across. */
export const maxZoom = (fit: number) => Math.max(1, 60 / (CELL * fit));
/** Whether looking closer is worth offering: tiles under 40 pixels across with the whole field in view. */
export const zoomUseful = (fit: number) => CELL * fit < 40;

/** Zooms to `z`, keeping drawing point `at` where it is on screen (`m`, in screen pixels). */
function zoomAbout(el: SVGSVGElement, g: Geo, map: string, z: number, at: Pt, m: Pt) {
  const r = el.getBoundingClientRect();
  const fit = Math.min(r.width / g.vw, r.height / g.vh);
  const zz = clamp(z, 1, maxZoom(fit));
  if (zz <= 1.01) { zoom.value = null; return; }
  const ox = r.left + (r.width - g.vw * fit) / 2, oy = r.top + (r.height - g.vh * fit) / 2;
  const w = g.vw / zz, h = g.vh / zz;
  zoom.value = { map, z: zz, x: clamp(at.x - (m.x - ox) / (fit * zz), 0, g.vw - w), y: clamp(at.y - (m.y - oy) / (fit * zz), 0, g.vh - h) };
}

/** The zoom button: a closer look at the middle of the garden (or what's in hand), or the whole of it. */
export function toggleZoom(s: SiegeState) {
  const f = fieldNow(s), g = geoOf(f);
  if (zoom.value?.map === f.map.id) { zoom.value = null; return; }
  const fit = fitScale.value;
  const z = clamp(46 / (CELL * fit), 1.5, maxZoom(fit));
  const sel = s.placed.find((p) => p.id === selected.value);
  const at = sel ? { x: X(f.mids[sel.cell]!.x), y: Y(f.mids[sel.cell]!.y) } : { x: g.vw / 2, y: g.vh / 2 };
  const w = g.vw / z, h = g.vh / z;
  zoom.value = { map: f.map.id, z, x: clamp(at.x - w / 2, 0, g.vw - w), y: clamp(at.y - h / 2, 0, g.vh - h) };
}

type Gesture =
  | { mode: 'idle' }
  /** A finger down, not yet moved far: a tap if it lifts here. */
  | { mode: 'press'; x: number; y: number; at: Pt | null; cell: number | null }
  | { mode: 'paint'; last: Pt }
  | { mode: 'pan'; x: number; y: number }
  | { mode: 'pinch'; d0: number; z0: number; at: Pt }
  /** Moved off something planted with the whole field in view: nothing to do till the finger lifts. */
  | { mode: 'none' };

// ---- The field -----------------------------------------------------------------------------------
function Board({ s }: { s: SiegeState }) {
  void frame.value;
  const p = playing.value;
  const f = fieldNow(s), g = geoOf(f);
  const svg = useRef<SVGSVGElement>(null);
  const fingers = useRef(new Map<number, Pt>());
  const gesture = useRef<Gesture>({ mode: 'idle' });

  // The scale with the whole field in view, for the zoom button.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width) fitScale.value = Math.min(r.width / g.vw, r.height / g.vh); };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [f.map.id]);

  const z = zoom.value?.map === f.map.id ? zoom.value : null;
  const view = z ? { x: z.x, y: z.y, w: g.vw / z.z, h: g.vh / z.z } : { x: 0, y: 0, w: g.vw, h: g.vh };

  /** The drawing point under a screen point. */
  const drawingAt = (cx: number, cy: number): Pt | null => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: pt.x, y: pt.y };
  };
  const fieldAt = (d: Pt): Pt => ({ x: (d.x - INSET) / CELL, y: (d.y - INSET - TOP) / CELL });
  const paintTo = (to: Pt) => {
    const gs = gesture.current;
    if (gs.mode !== 'paint') return;
    const from = gs.last, n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.25));
    for (let i = 1; i <= n; i++) {
      const c = cellNear(f, { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n });
      if (c !== null) dragField(c);
    }
    gs.last = to;
  };
  const startPinch = () => {
    const [a, b] = [...fingers.current.values()];
    const at = drawingAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
    if (!at) return;
    if (gesture.current.mode === 'paint') releaseField();
    gesture.current = { mode: 'pinch', d0: Math.max(10, Math.hypot(a!.x - b!.x, a!.y - b!.y)), z0: zoom.value?.map === f.map.id ? zoom.value.z : 1, at };
  };

  const onDown = (e: PointerEvent) => {
    (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.current.size === 1) {
      const d = drawingAt(e.clientX, e.clientY);
      const at = d ? fieldAt(d) : null;
      gesture.current = { mode: 'press', x: e.clientX, y: e.clientY, at, cell: at ? cellNear(f, at) : null };
    } else if (fingers.current.size === 2) startPinch();
  };
  const onMove = (e: PointerEvent) => {
    if (!fingers.current.has(e.pointerId)) return;
    const prev = fingers.current.get(e.pointerId)!;
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const gs = gesture.current;
    if (gs.mode === 'pinch') {
      if (fingers.current.size < 2 || !svg.current) return;
      const [a, b] = [...fingers.current.values()];
      zoomAbout(svg.current, g, f.map.id, gs.z0 * Math.hypot(a!.x - b!.x, a!.y - b!.y) / gs.d0, gs.at, { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 });
      return;
    }
    if (gs.mode === 'press') {
      if (Math.hypot(e.clientX - gs.x, e.clientY - gs.y) < 8) return;
      const zoomed = zoom.value?.map === f.map.id;
      if (gs.cell !== null && gs.at && beginStroke(gs.cell)) gesture.current = { mode: 'paint', last: gs.at };
      else gesture.current = zoomed ? { mode: 'pan', x: gs.x, y: gs.y } : { mode: 'none' };
    }
    const now = gesture.current;
    if (now.mode === 'paint') {
      const d = drawingAt(e.clientX, e.clientY);
      if (d) paintTo(fieldAt(d));
    } else if (now.mode === 'pan') {
      const zv = zoom.value;
      if (!zv || zv.map !== f.map.id) return;
      const fit = fitScale.value * zv.z, w = g.vw / zv.z, h = g.vh / zv.z;
      zoom.value = { ...zv, x: clamp(zv.x - (e.clientX - prev.x) / fit, 0, g.vw - w), y: clamp(zv.y - (e.clientY - prev.y) / fit, 0, g.vh - h) };
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!fingers.current.delete(e.pointerId)) return;
    const gs = gesture.current;
    if (gs.mode === 'press' && e.type === 'pointerup' && gs.cell !== null) tapField(gs.cell);
    if (gs.mode === 'paint') releaseField();
    if (!fingers.current.size) gesture.current = { mode: 'idle' };
    else if (gs.mode !== 'pinch') gesture.current = { mode: 'none' };
  };
  const onWheel = (e: WheelEvent) => {
    if (!svg.current) return;
    e.preventDefault();
    const at = drawingAt(e.clientX, e.clientY);
    if (!at) return;
    const now = zoom.value?.map === f.map.id ? zoom.value.z : 1;
    zoomAbout(svg.current, g, f.map.id, now * Math.exp(-e.deltaY * 0.0015), at, { x: e.clientX, y: e.clientY });
  };

  const walks = useMemo(() => (p ? null : walksNow(s)), [!!p, s.placed, s.map]);
  const ways = useMemo(() => walks?.map((w) => wayOf(f, w)) ?? null, [walks]);
  const flyers = waveKinds(s.wave).some((k) => PESTS[k.kind].flies);
  const sel = selected.value === null ? null : s.placed.find((x) => x.id === selected.value) ?? null;
  const pieces = useMemo(() => <g class="sg-pieces">{s.placed.map((pc) => <Piece key={pc.id} f={f} p={pc} held={sel?.id === pc.id} />)}</g>, [s.placed, sel?.id, f.map.id]);
  const reach = sel ? bonusAt(f, sel.kind, sel.level, sel.cell).range : 0;
  const refused = refusedAt.value;
  const towers = new Map((p?.sim.towers ?? []).map((t) => [t.id, t]));
  const len = walks ? Math.max(...walks.map((w) => w.length)) : 0;
  return (
    <svg ref={svg} class={`siege-board${z ? ' zoomed' : ''}`} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="img" style={{ '--ar': String(g.vw / g.vh) } as Record<string, string>}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
      aria-label={p ? `Wave ${p.sim.wave}: ${p.sim.mobs.length} pests in the garden` : `${f.map.name} before wave ${s.wave}: the pests' way is ${len} tiles long`}>
      {groundOf(f)}
      {ways ? ways.map((w, i) => (
        <g key={i}>
          <path class="sg-route" d={w.line} />
          {w.tunnels.map((t, j) => <path key={j} class="sg-tunnel" d={t} />)}
        </g>
      )) : null}
      {ways && flyers ? f.entries.map((_, e) => { const r = airRoute(f, e); return <path key={`f${e}`} class="sg-flight" d={`M${X(r.pts[0]!.x)} ${Y(-0.3)}L${X(r.pts[1]!.x)} ${Y(f.size.y + 0.3)}`} />; }) : null}

      {sel && reach > 0 ? <circle class="sg-reach" cx={X(f.mids[sel.cell]!.x)} cy={Y(f.mids[sel.cell]!.y)} r={reach * CELL} /> : null}
      {pieces}

      {p ? p.strikes.map(({ s: st }, i) => {
        const t = towers.get(st.tower);
        if (!t) return null;
        return st.to.map((to, j) => <path key={`${i}.${j}`} class={`sg-strike ${elementClass(t.kind)}`} d={`M${X(t.at.x)} ${Y(t.at.y)}L${X(to.x)} ${Y(to.y)}`} />);
      }) : null}

      {p ? p.sim.mobs.map((m) => {
        const at = mobAt(p.sim, m), size = PEST_SIZE[m.kind] * CELL, under = isUnder(p.sim, m);
        return (
          <g key={m.id} class={`sg-pest${PESTS[m.kind].flies ? ' flies' : ''}${m.kind === 'greatSnail' ? ' boss' : ''}${under ? ' under' : ''}`}>
            <Glyph name={PEST_ICON[m.kind]} x={X(at.x)} y={Y(at.y)} size={size} />
            {m.hp < m.max && !under ? <><rect class="sg-hp-bg" x={X(at.x) - size / 2} y={Y(at.y) - size / 2 - 5} width={size} height="3.5" rx="1.5" />
              <rect class="sg-hp" x={X(at.x) - size / 2} y={Y(at.y) - size / 2 - 5} width={size * Math.max(0, m.hp / m.max)} height="3.5" rx="1.5" /></> : null}
          </g>
        );
      }) : null}

      {refused && !p ? <path key={refused.id} class="wb-refused" d={tileD(f, refused.cell)} /> : null}
    </svg>
  );
}

// ---- Around the field ----------------------------------------------------------------------------
function Hud({ s }: { s: SiegeState }) {
  const p = playing.value;
  const eatenNow = p ? Math.min(p.before.seedlings, p.sim.eaten) : 0;
  const coinsNow = p ? p.before.coins + p.sim.earned : s.coins;
  const seedlings = (p ? p.before.seedlings : s.seedlings) - eatenNow;
  const interest = interestOn(p ? p.before : s);
  return (
    <header class="header hud-row">
      <button class="icon-btn" aria-label="Back to title" onClick={goBack}><Icon name="back" /></button>
      <span class="hud-round" aria-label={`Wave ${p ? p.sim.wave : s.wave} of ${WAVES.length}`}>Wave <b>{p ? p.sim.wave : s.wave}</b><span class="hud-of"> of {WAVES.length}</span></span>
      <span class="hud-stat" aria-label={`${seedlings} seedlings`}><Icon name="seedling" class="ico seedling" /><b>{seedlings}</b></span>
      <span class="hud-stat sg-coins" aria-label={`${coinsNow} coins, ${interest} interest after the wave`}>
        <Icon name="gold" class="ico gold" /><b>{coinsNow}</b>{interest ? <span class="sg-interest">+{interest}</span> : null}
      </span>
      <button class="icon-btn" aria-label="How to play Garden Siege" onClick={() => (sheet.value = { kind: 'siege-help' })}><Icon name="help" /></button>
    </header>
  );
}

function ZoomButton({ s }: { s: SiegeState }) {
  if (!zoomUseful(fitScale.value)) return null;
  const on = zoom.value?.map === s.map;
  return (
    <button class="icon-btn sg-zoom" aria-label={on ? 'See the whole garden' : 'Look closer'} aria-pressed={on} onClick={() => toggleZoom(s)}>
      <Icon name={on ? 'zoomOut' : 'zoomIn'} />
    </button>
  );
}

/** The next wave's pests, or how the wave is going. */
function WaveBar({ s }: { s: SiegeState }) {
  void frame.value;
  const p = playing.value;
  if (p) {
    const coming = p.sim.queue.length - p.sim.next;
    return (
      <div class="sg-wavebar" role="status">
        <span><b>{p.sim.stopped}</b> stopped · <b>{p.sim.mobs.length}</b> in the garden{coming ? <> · <b>{coming}</b> to come</> : null}</span>
        {p.sim.eaten ? <span class="warn">{Math.min(p.before.seedlings, p.sim.eaten)} eaten</span> : null}
        <ZoomButton s={s} />
      </div>
    );
  }
  const kinds = waveKinds(s.wave);
  return (
    <div class="sg-wavebar" aria-label={`Wave ${s.wave}: ${pestLine(kinds)}`}>
      <span class="sg-next">Next:</span>
      {kinds.map(({ kind, count }) => (
        <span key={kind} class={`sg-chip${PESTS[kind].flies ? ' flies' : ''}${PESTS[kind].armour ? ' armour' : ''}`} title={PESTS[kind].text}>
          <Icon name={PEST_ICON[kind]} class="ico" />{count}
        </span>
      ))}
      {kinds.some((k) => PESTS[k.kind].flies) ? <span class="sg-note">flies</span> : null}
      {kinds.some((k) => PESTS[k.kind].armour >= 2) ? <span class="sg-note">armour</span> : null}
      {kinds.some((k) => k.kind === 'greatSnail') ? <span class="sg-note warn">boss</span> : null}
      <ZoomButton s={s} />
    </div>
  );
}

const BOSS_WAVES = WAVES.map((g, i) => (g.some((x) => x.kind === 'greatSnail') ? i + 1 : 0)).filter(Boolean);

export const pestLine = (kinds: { kind: PestId; count: number }[]) =>
  kinds.map(({ kind, count }) => `${count} ${count === 1 ? PESTS[kind].name.toLowerCase() : PESTS[kind].plural}`).join(', ');

/** A wave's pests, kind by kind. */
export function waveKinds(wave: number): { kind: PestId; count: number }[] {
  const out = new Map<PestId, number>();
  for (const g of WAVES[wave - 1] ?? []) out.set(g.kind, (out.get(g.kind) ?? 0) + g.count);
  return [...out].map(([kind, count]) => ({ kind, count }));
}

/** One line on what a defender does at its level, where it stands, with the Shed's improvements. */
function statLine(s: SiegeState, p: Placed): string {
  const d = DEFENDERS[p.kind], lv = d.levels[p.level]!;
  if (p.kind === 'hive') {
    const next = d.levels[p.level + 1]?.honey;
    return `Makes ${lv.honey} honey after every wave${next ? ` (${next} upgraded)` : ''}. It blocks the way, but never strikes.`;
  }
  const f = fieldNow(s), { boost } = bonusAt(f, p.kind, p.level, p.cell);
  const harm = round1(lv.damage * boost * SHED_EFFECT.harm[s.shed.can]!);
  const who = lv.targets === 99 ? 'all in reach' : lv.targets ? `${lv.targets} at once` : 'one';
  return `${harm} harm to ${who} every ${lv.every} s${lv.splash ? ', splashing' : ''}${lv.slow ? ', slowing' : ''}${d.pierce ? ', through armour' : ''}${d.air === 'no' ? '' : d.air === 'double' ? ', double on flyers' : ', reaches flyers'}.`;
}

/** What the ground under a piece gives it: rich soil's reach, the pond's bank. */
function groundNote(s: SiegeState, p: Placed): string {
  const f = fieldNow(s), notes: string[] = [];
  if (p.kind === 'hive') return '';
  if (f.terrain[p.cell] === 'rich') notes.push(p.kind === 'bramble' ? 'Rich soil: what grows here reaches further.' : `Rich soil: reaches ${SIEGE.richReach} further.`);
  if (bonusAt(f, p.kind, p.level, p.cell).boost > 1) notes.push(`By the pond: ${SIEGE.pondBoost}× harm.`);
  return notes.length ? ` ${notes.join(' ')}` : '';
}

/** Buttons to grow the piece in hand: open ones by price, locked ones naming the element they need. */
function GrowButtons({ s, p }: { s: SiegeState; p: Placed }) {
  return (
    <>
      {growthsOf(s, p).map((g) => g.open ? (
        <button key={g.into} class={`btn tool grow ${elementClass(g.into)}`} disabled={s.coins < costOf(g.into, 0, s)} aria-label={`Grow into ${DEFENDERS[g.into].name}, ${coinWord(costOf(g.into, 0, s))}`}
          onClick={() => growSelected(g.into)}>
          <Icon name={DEF_ICON[g.into]} /><span class="tool-name">{DEFENDERS[g.into].name}</span>
          <span class="tool-cost"><Icon name="gold" class="ico xs gold" />{costOf(g.into, 0, s)}</span>
        </button>
      ) : (
        <button key={g.into} class="btn tool grow locked" aria-label={`${DEFENDERS[g.into].name}: unlock ${ELEMENTS[g.needs[0]!].name.toLowerCase()} first`}
          onClick={() => (sheet.value = { kind: 'siege-seeds' })}>
          <Icon name={DEF_ICON[g.into]} /><span class="tool-name">{DEFENDERS[g.into].name}</span>
          <span class="tool-cost"><Icon name="lock" class="ico xs" />{ELEMENTS[g.needs[0]!].name}</span>
        </button>
      ))}
    </>
  );
}

/** What's in hand and what it can become, or the first element to pick, or a hint. */
function Panel({ s }: { s: SiegeState }) {
  const m = siegeMessage.value;
  if (playing.value) return <div class="sg-panel"><div class="status">{m ? m.text : 'Pause to look closer, or finish the wave at once.'}</div></div>;
  if (!s.elements.length && s.wave === 1) {
    return (
      <section class="sg-panel" aria-label="Pick your first element">
        <div class="sg-panel-line"><b>Pick your first element.</b> It's free; the next ones cost coins.</div>
        <div class="sg-panel-btns">
          {ELEMENT_IDS.map((e) => (
            <button key={e} class={`btn tool grow ${ELEMENT_CLASS[e]}`} onClick={() => unlockElement(e)}>
              <Icon name={DEF_ICON[ELEMENTS[e].defender]} /><span class="tool-name">{ELEMENTS[e].name}</span><span class="tool-cost">{DEFENDERS[ELEMENTS[e].defender].name}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }
  const sel = selected.value === null ? null : s.placed.find((x) => x.id === selected.value) ?? null;
  if (sel) {
    const d = DEFENDERS[sel.kind];
    const top = sel.level >= maxLevel(sel.kind);
    const thorns = SHED_EFFECT.thorns[s.shed.thorns]!;
    const line = d.tier === 0 ? <><b>Bramble</b>: {d.text}{thorns > 1 ? ` Sharp thorns: ${thorns} harm.` : ''}{groundNote(s, sel)} Grow it into:</>
      : <><b>{d.name}</b>{maxLevel(sel.kind) ? ` ${sel.level + 1}` : ''}: {statLine(s, sel)}{groundNote(s, sel)}{d.tier === 1 && top && growthsOf(s, sel).length ? ' Grow it into a hybrid:' : ''}</>;
    return (
      <section class="sg-panel" aria-label={d.name}>
        <div class={`sg-panel-line${m?.warn ? ' warn' : ''}`}>{m ? m.text : line}</div>
        <div class="sg-panel-btns">
          {d.tier === 0 || (d.tier === 1 && top) ? <GrowButtons s={s} p={sel} /> : null}
          {!top ? (
            <button class="btn tool" disabled={s.coins < costOf(sel.kind, sel.level + 1, s)} aria-label={`Upgrade, ${coinWord(costOf(sel.kind, sel.level + 1, s))}`} onClick={upgradeSelected}>
              <Icon name="upgrade" /><span class="tool-name">Upgrade</span><span class="tool-cost"><Icon name="gold" class="ico xs gold" />{costOf(sel.kind, sel.level + 1, s)}</span>
            </button>
          ) : null}
          <button class="btn tool" aria-label={`${d.tier === 0 ? 'Dig up' : 'Sell'}${refundOf(sel) ? ` for ${coinWord(refundOf(sel))}` : ''}`} onClick={sellSelected}>
            <Icon name="remove" /><span class="tool-name">{d.tier === 0 ? 'Dig up' : 'Sell'}</span>{refundOf(sel) ? <span class="tool-cost">+{refundOf(sel)}</span> : null}
          </button>
        </div>
      </section>
    );
  }
  const last = lastWave.value;
  const extra = last ? [last.interest ? `${last.interest} interest` : '', last.honey ? `${last.honey} honey` : ''].filter(Boolean).join(', ') : '';
  const interest = interestOn(s);
  const text = m ? m.text
    : last ? `Wave ${last.wave}: ${last.eaten ? `${last.eaten} ${last.eaten === 1 ? 'seedling' : 'seedlings'} eaten` : 'every seedling safe'}. +${last.earned + last.bonus + last.interest + last.honey} coins${extra ? ` (${extra})` : ''}.`
      : s.wave === 1 && !s.placed.length ? `${mapById(s.map).blurb} Tap or drag to plant brambles, ${coinWord(costOf('bramble'))} each.`
        : `Tap or drag to plant brambles; tap one to grow it. ${interest ? `Coins you keep earn +${interest} interest after this wave.` : `Coins you keep through a wave earn ${Math.round(SHED_EFFECT.interest[s.shed.compost]! * 100)}% interest.`}`;
  return <div class="sg-panel"><div class={`status${m?.warn || (!m && last?.eaten) ? ' warn' : ''}`} role="status">{text}</div></div>;
}

function Controls({ s }: { s: SiegeState }) {
  const p = playing.value;
  if (!p) {
    const price = unlockPrice(s);
    return (
      <div class="run-controls">
        <button class="btn tool" aria-label={`Seeds: elements${price !== null ? `, the next costs ${price}` : ''}`} onClick={() => (sheet.value = { kind: 'siege-seeds' })}>
          <Icon name="packet" /><span class="tool-name">Seeds</span>
        </button>
        <button class="btn tool" aria-label="Shed: improvements and interest" onClick={() => (sheet.value = { kind: 'siege-shed' })}>
          <Icon name="shed" /><span class="tool-name">Shed</span>
        </button>
        <button class="btn tool" disabled={!canUndo.value} onClick={undo}><Icon name="undo" /><span class="tool-name">Undo</span></button>
        <button class="btn primary grow" onClick={beginWave}><Icon name="play" /> Let them come</button>
      </div>
    );
  }
  return (
    <div class="run-controls sg-speed" role="group" aria-label="Speed">
      <button class={`btn${paused.value ? ' toggled' : ''}`} aria-label={paused.value ? 'Play' : 'Pause'} onClick={() => (paused.value = !paused.value)}>
        <Icon name={paused.value ? 'play' : 'pause'} />
      </button>
      {([1, 2, 4] as const).map((x) => (
        <button key={x} class={`btn${speed.value === x && !paused.value ? ' toggled' : ''}`} aria-pressed={speed.value === x} onClick={() => { speed.value = x; paused.value = false; }}>{x}×</button>
      ))}
      <button class="btn grow" onClick={finishNow}><Icon name="fast" /> Finish</button>
    </div>
  );
}

function SeasonEnd({ s }: { s: SiegeState }) {
  const score = siegeScore(s);
  const won = s.phase === 'won';
  const map = mapById(s.map);
  const best = siegeBests.value[s.map] ?? 0;
  return (
    <div class="column siege-end">
      <header class="header">
        <button class="icon-btn" aria-label="Back to title" onClick={goBack}><Icon name="back" /></button>
        <div class="title"><div class="title-page">{map.name}</div></div>
      </header>
      <div class={`summary-verdict${won ? '' : ' lost'}`}>
        <h1>{won ? 'The garden held' : 'The seedlings are gone'}</h1>
        <p>{won ? `${s.seedlings} of ${SIEGE.seedlings} seedlings made it through ${WAVES.length} waves.` : `The pests ate the last seedling in wave ${s.records.length}.`}</p>
      </div>
      <div class="watch-score">
        <span><Icon name="seedling" class="ico seedling" /> {Math.max(0, s.seedlings)} × {SIEGE.seedlingPoints} = <b>{score.seedlings}</b></span>
        <span><Icon name="gold" class="ico gold" /> {score.coins} coins kept</span>
        <span class="watch-total">Score <b>{score.total}</b>{best ? ` · best here ${best}` : ''}</span>
      </div>
      <table class="records" aria-label="Wave by wave">
        <thead><tr><th>Wave</th><th>Stopped</th><th>Eaten</th><th>Coins</th></tr></thead>
        <tbody>
          {s.records.map((r) => (
            <tr key={r.wave}><td>{r.wave}</td><td>{r.stopped}</td><td class={r.eaten ? 'miss' : 'soft'}>{r.eaten || '–'}</td><td>+{r.earned + r.bonus + r.interest + (r.honey ?? 0)}</td></tr>
          ))}
        </tbody>
      </table>
      <div class="spacer" />
      <div class="row-btns">
        <button class="btn primary wide" onClick={() => startSiege(undefined, s.map)}>Again in {map.name.replace(/^The /, 'the ')}</button>
        <button class="btn wide" onClick={() => (screen.value = 'siegemaps')}>Another garden</button>
        <button class="btn wide" onClick={() => (screen.value = 'title')}>Back to the title</button>
      </div>
      <div class="bottom-pad" />
    </div>
  );
}

/** Steps the wave with the screen's frames while one is playing. */
function useWaveClock() {
  const p = playing.value;
  const reduced = reducedMotion.value;
  useEffect(() => {
    if (!p) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const more = advance(now - last, now);
      last = now;
      if (more) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [p?.id, reduced]);
}

export function SiegeScreen() {
  useEffect(() => {
    if (coachOff.value || coachSeen.value.includes('siege-intro')) return;
    dismissTip('siege-intro');
    sheet.value = { kind: 'siege-help' };
  }, []);
  useWaveClock();
  const s = siege.value;
  if (!s) { startSiege(); return null; }
  if (s.phase !== 'build' && !playing.value) return <SeasonEnd s={s} />;
  return (
    <div class="column run siege">
      <Hud s={s} />
      <WaveBar s={s} />
      <div class="board-wrap siege-wrap"><Board s={s} /></div>
      <Panel s={s} />
      <Controls s={s} />
      <div class="bottom-pad" />
    </div>
  );
}

// ---- Sheets --------------------------------------------------------------------------------------
/** The four elements: unlock them, and see what grows from them. */
export function SiegeSeeds() {
  const s = siege.value;
  if (!s) return null;
  const price = unlockPrice(s);
  return (
    <>
      <div class="sheet-head"><h2><Icon name="packet" class="ico inline-ico big" /> Seeds</h2>
        <button class="icon-btn" onClick={() => (sheet.value = null)} aria-label="Close"><Icon name="close" /></button></div>
      <p>Unlock an element to grow brambles into its defender. {price === null ? 'You have all four.' : s.elements.length ? `Your next element costs ${price} coins.` : 'Your first element is free.'}</p>
      <ul class="sg-seeds">
        {ELEMENT_IDS.map((e) => {
          const d = DEFENDERS[ELEMENTS[e].defender];
          const owned = s.elements.includes(e);
          return (
            <li key={e} class={`sg-seed ${ELEMENT_CLASS[e]}${owned ? ' owned' : ''}`}>
              <Icon name={DEF_ICON[d.id]} class="ico sg-seed-ico" />
              <span class="sg-seed-text"><b>{ELEMENTS[e].name}: {d.name}</b> {d.text}</span>
              {owned ? <span class="sg-owned"><Icon name="check" class="ico" /></span>
                : <button class="pill-btn buy" disabled={price === null || s.coins < price || !!playing.value} onClick={() => unlockElement(e)}>{price ? <><Icon name="gold" class="ico xs gold" />{price}</> : 'Free'}</button>}
            </li>
          );
        })}
      </ul>
      <h3 class="sg-seeds-head">Hybrids</h3>
      <p>Grow a defender at its best into the hybrid of its element and another you've unlocked.</p>
      <ul class="sg-hybrids">
        {HYBRIDS.map((h) => {
          const d = DEFENDERS[h];
          const open = d.elements.every((e) => s.elements.includes(e));
          return (
            <li key={h} class={open ? 'open' : ''}>
              <Icon name={DEF_ICON[h]} class="ico" />
              <span><b>{d.name}</b> ({d.elements.map((e) => ELEMENTS[e].name.toLowerCase()).join(' and ')}): {d.text}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The Shed: improvements for the season, bought in ranks, and what coins kept and beehives bring in. */
export function SiegeShed() {
  const s = siege.value;
  if (!s) return null;
  const rate = SHED_EFFECT.interest[s.shed.compost]!, cap = SHED_EFFECT.interestCap[s.shed.compost]!;
  const hives = s.placed.filter((p) => p.kind === 'hive').length;
  const honey = honeyOf(s);
  return (
    <>
      <div class="sheet-head"><h2><Icon name="shed" class="ico inline-ico big" /> Shed</h2>
        <button class="icon-btn" onClick={() => (sheet.value = null)} aria-label="Close"><Icon name="close" /></button></div>
      <div class="sg-bank">
        <p><Icon name="interest" class="ico inline-ico" /> <b>Interest:</b> coins you keep through a wave earn {Math.round(rate * 100)}% of themselves, up to {cap}.
          You have {s.coins}: <b>+{interestOn(s)}</b> after the next wave{interestOn(s) < cap ? `, or +${cap} with ${Math.ceil(cap / rate)}` : ''}.</p>
        <p><Icon name="honey" class="ico inline-ico" /> <b>Honey:</b> {hives ? `${hives} ${hives === 1 ? 'beehive makes' : 'beehives make'} +${honey} after every wave.` : `grow a bramble into a beehive (${coinWord(costOf('hive', 0, s))}) for coins after every wave.`}</p>
      </div>
      <ul class="sg-shed">
        {SHED_IDS.map((id) => {
          const item = SHED[id], rank = s.shed[id], price = improvePrice(s, id);
          return (
            <li key={id} class={`sg-shed-item${price === null ? ' done' : ''}`}>
              <Icon name={SHED_ICON[id]} class="ico sg-seed-ico" />
              <span class="sg-seed-text">
                <b>{item.name}</b> {item.text}
                <span class="sg-rank">{rank ? `Now ${item.ranks[rank]}` : `Now ${item.ranks[0]}`}{price !== null ? `; next, ${item.ranks[rank + 1]}` : ''}.</span>
                <span class="sg-pips" aria-label={`Rank ${rank} of ${item.costs.length}`}>{item.costs.map((_, i) => <span key={i} class={i < rank ? 'on' : ''} />)}</span>
              </span>
              {price === null ? <span class="sg-owned"><Icon name="check" class="ico" /></span>
                : <button class="pill-btn buy" aria-label={`${item.name}: buy rank ${rank + 1} for ${coinWord(price)}`} disabled={s.coins < price || !!playing.value} onClick={() => improveShed(id)}>
                  <Icon name="gold" class="ico xs gold" />{price}
                </button>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** How Garden Siege is played, for the help sheet. */
export function SiegeHelp() {
  return (
    <>
      <div class="sheet-head"><h2><Icon name="siege" class="ico inline-ico big" /> Garden Siege</h2>
        <button class="icon-btn" onClick={() => (sheet.value = null)} aria-label="Close"><Icon name="close" /></button></div>
      <p>Pests come through the gaps in the hedge, wave after wave, and make for the seedling bed. Each one that gets there eats seedlings, one for every layer it still has. Keep {SIEGE.seedlings} seedlings safe through {WAVES.length} waves.</p>
      <p><b>Plant brambles</b> by tapping or dragging on the garden. Pests always take the shortest way left, shown as a dotted line, so brambles make them walk the long way round; a bramble can't close the way. Brambles scratch pests that pass beside them. Pests that fly go straight over everything.</p>
      <p><b>Grow your brambles.</b> Unlock elements in Seeds (the first is free). Tap a bramble to grow it into an element's defender: a frog (water) snaps at walking pests, a hedgehog (earth) bites through armour, a thrush (air) reaches far and harms flyers twice over, a marigold (sun) warms everything in reach. Upgrade a defender twice, then grow it into a hybrid with another element you've unlocked: toad, dragonfly, salamander, mantis, owl or bumblebee.</p>
      <p><b>Pests come in layers.</b> A snail's shell cracks to leave a slug, an aphid swarm breaks into three, and beetles' armour takes {PESTS.beetle.armour} off every hit. Waves {BOSS_WAVES.join(' and ')} bring a Great Snail, which eats {biteOf('greatSnail')} seedlings if it gets through.</p>
      <p><b>Every garden is different.</b> Rock and ponds stand in the way. Mud slows walking pests, rich soil lets what grows on it reach further, and a frog or its kin beside a pond strikes {SIEGE.pondBoost}× as hard. A pest that steps on a rabbit hole comes up out of its partner, so a way over a hole near the bed sends it back up the garden. Where there are two gaps, pests take turns. Pinch, or tap the zoom button, to look closer.</p>
      <p><b>Coins</b> come from pests stopped and from each wave. Coins you keep through a wave earn interest (the small number beside your coins), so spending everything has a cost. A bramble can grow into a beehive, which makes honey: coins after every wave. In the Shed, compost raises the interest, sharp thorns make brambles scratch harder, a cold frame makes growing cheaper and a watering can makes every defender strike harder. Undo takes back anything since the last wave.</p>
    </>
  );
}

// Automated tests find tiles on screen through this hook.
if (typeof location === 'object' && new URLSearchParams(location.search).has('test')) {
  const hooks = (window as unknown as { __siege?: Record<string, unknown> }).__siege;
  if (hooks) {
    /** Where a tile's middle is on screen, in page pixels. */
    hooks.at = (cell: number) => {
      const s = siege.value, el = document.querySelector<SVGSVGElement>('.siege-board'), m = el?.getScreenCTM();
      if (!s || !m) return null;
      const mid = fieldNow(s).mids[cell]!, pt = new DOMPoint(X(mid.x), Y(mid.y)).matrixTransform(m);
      return { x: pt.x, y: pt.y };
    };
  }
}
