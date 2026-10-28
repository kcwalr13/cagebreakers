import type { Ref } from 'preact';
import { useMemo } from 'preact/hooks';
import { cageLabel } from '../core/commission';
import { gridOf } from '../core/grid';
import type { Page } from '../core/page';
import { CELL_PX, INSET_PX, boardPx } from './input';
import { TokenShape } from './Token';

/** Where a square's top-left corner sits in the drawing. */
export const cellX = (cell: number, size: number) => INSET_PX + gridOf(size).colOf(cell) * CELL_PX;
export const cellY = (cell: number, size: number) => INSET_PX + gridOf(size).rowOf(cell) * CELL_PX;

/** A pebble for a stone (a printed number), about 36 by 32 around its centre. */
const PEBBLE = 'M-17 2C-18-10-6-16 5-15C15-14 19-5 18 4C17 13 6 17-4 16C-13 15-16 9-17 2Z';

/** A five-petal flower, about 18 across around its centre: the mark of a plot in bloom. */
function Flower({ x, y }: { x: number; y: number }) {
  return (
    <g class="bloom-flower" transform={`translate(${x} ${y})`}>
      <circle class="petal" cx="0" cy="-4.6" r="3.9" /><circle class="petal" cx="4.4" cy="-1.4" r="3.9" />
      <circle class="petal" cx="2.7" cy="3.8" r="3.9" /><circle class="petal" cx="-2.7" cy="3.8" r="3.9" />
      <circle class="petal" cx="-4.4" cy="-1.4" r="3.9" /><circle class="heart" cx="0" cy="0" r="2.6" />
    </g>
  );
}

/**
 * Where the number in hand can go, cell by cell: open (bright), open and making its plot bloom
 * (green), a swap with the number standing there, or blocked by the Latin rule (shaded).
 */
export type CellHint = 'open' | 'seals' | 'swap' | 'blocked';

/**
 * A greater-than fence on the edge between two squares: a chevron whose open side faces the
 * bigger number, as in 5 > 3.
 */
function FenceMark({ page, a, b }: { page: Page; a: number; b: number }) {
  const g = gridOf(page.size), n = page.size;
  const across = g.rowOf(a) === g.rowOf(b);
  const first = Math.min(a, b), second = Math.max(a, b);
  // The shared edge's middle.
  const x = across ? cellX(second, n) : cellX(first, n) + CELL_PX / 2 + 2;
  const y = across ? cellY(first, n) + CELL_PX / 2 + 4 : cellY(second, n);
  const bigFirst = a === first;
  const d = across
    ? (bigFirst ? `M${x - 4} ${y - 6.5}L${x + 4} ${y}L${x - 4} ${y + 6.5}` : `M${x + 4} ${y - 6.5}L${x - 4} ${y}L${x + 4} ${y + 6.5}`)
    : (bigFirst ? `M${x - 6.5} ${y - 4}L${x} ${y + 4}L${x + 6.5} ${y - 4}` : `M${x - 6.5} ${y + 4}L${x} ${y - 4}L${x + 6.5} ${y + 4}`);
  return <g class="fence"><path class="fence-halo" d={d} /><path class="fence-mark" d={d} /></g>;
}

/** The middle of the edge two neighbouring squares share. */
function edgeMid(size: number, a: number, b: number) {
  const g = gridOf(size);
  const across = g.rowOf(a) === g.rowOf(b);
  const first = Math.min(a, b), second = Math.max(a, b);
  return across
    ? { x: cellX(second, size), y: cellY(first, size) + CELL_PX / 2 + 4 }
    : { x: cellX(first, size) + CELL_PX / 2 + 2, y: cellY(second, size) };
}

/** A runner between two squares: a little strawberry on their shared edge (numbers one apart). */
function RunnerMark({ page, a, b }: { page: Page; a: number; b: number }) {
  const { x, y } = edgeMid(page.size, a, b);
  return (
    <g class="runner" transform={`translate(${x} ${y})`}>
      <path class="runner-berry" d="M0 7.2C-3.4 6.2-6.2 2.6-6 -.6C-5.8-3.6-3-4.8 0-4.2C3-4.8 5.8-3.6 6-.6C6.2 2.6 3.4 6.2 0 7.2Z" />
      <path class="runner-cap" d="M-4.4-3.6L-1.6-3.2L0-6.4L1.6-3.2L4.4-3.6L2.2-1.4L0-2.4L-2.2-1.4Z" />
      <circle class="runner-seed" cx="-2.2" cy="1" r=".75" /><circle class="runner-seed" cx="2.2" cy="1" r=".75" /><circle class="runner-seed" cx="0" cy="3.6" r=".75" />
    </g>
  );
}

/** A bean pole: a vine through its squares from a root bulb (the smallest number) to a leaf at its tip. */
function PoleMark({ page, cells }: { page: Page; cells: readonly number[] }) {
  const n = page.size;
  const pts = cells.map((c) => ({ x: cellX(c, n) + CELL_PX / 2 + 2, y: cellY(c, n) + CELL_PX / 2 + 4 }));
  const d = pts.map((pt, i) => `${i ? 'L' : 'M'}${pt.x} ${pt.y}`).join('');
  const root = pts[0]!, tip = pts[pts.length - 1]!, before = pts[pts.length - 2]!;
  const angle = (Math.atan2(tip.y - before.y, tip.x - before.x) * 180) / Math.PI;
  return (
    <g class="pole">
      <path class="pole-vine" d={d} />
      <circle class="pole-root" cx={root.x} cy={root.y} r="15" />
      <path class="pole-leaf" transform={`translate(${tip.x} ${tip.y}) rotate(${angle})`} d="M8 0C12-7 21-8 25-4C21 3 13 5 8 0Z" />
    </g>
  );
}

/** Elbow room: a small knot where four squares meet, as a reminder that corners count. */
function ElbowKnots({ size }: { size: number }) {
  const out = [];
  for (let r = 1; r < size; r++) for (let c = 1; c < size; c++) {
    out.push(<circle key={`${r}-${c}`} cx={INSET_PX + c * CELL_PX} cy={INSET_PX + r * CELL_PX} r="2.6" />);
  }
  return <g class="elbow-knots" aria-hidden="true">{out}</g>;
}

export interface PieceView {
  key: string;
  n: number;
  cls?: string;
}

/** Ruled lines: dashed within a cage, heavy between cages. */
function useRules(p: Page) {
  return useMemo(() => {
    const thin: string[] = [], heavy: string[] = [];
    const g = gridOf(p.size), n = p.size;
    const x = (c: number) => cellX(c, n), y = (c: number) => cellY(c, n);
    for (let cell = 0; cell < g.cells; cell++) {
      const r = g.rowOf(cell), c = g.colOf(cell);
      if (c < n - 1) {
        const d = `M${x(cell) + CELL_PX} ${y(cell)}V${y(cell) + CELL_PX}`;
        (p.cageOf[cell] === p.cageOf[cell + 1] ? thin : heavy).push(d);
      }
      if (r < n - 1) {
        const d = `M${x(cell)} ${y(cell) + CELL_PX}H${x(cell) + CELL_PX}`;
        (p.cageOf[cell] === p.cageOf[cell + n] ? thin : heavy).push(d);
      }
    }
    return { thin: thin.join(''), heavy: heavy.join('') };
  }, [p]);
}

export interface PageViewProps {
  page: Page;
  id: string;
  pieces: (PieceView | null)[];
  sealed: ReadonlySet<number>;
  flashing?: ReadonlySet<number>;
  hints?: readonly (CellHint | null)[];
  /** Cells holding the same number as the one in hand: the reason the shaded cells are blocked. */
  blockers?: ReadonlySet<number>;
  hover?: { cell: number; ok: boolean } | null;
  refused?: { cell: number; id: number } | null;
  label: string;
  svgRef?: Ref<SVGSVGElement>;
  class?: string;
  pieceRadius?: number;
  /** Hidden numbers the Lens has shown, by cell. */
  revealed?: ReadonlyMap<number, number>;
  /** Cells to ring while the Lens waits for one. */
  targets?: ReadonlySet<number>;
  /** Cells a commission is about, lit while it's in focus. */
  marked?: ReadonlySet<number>;
}

export function PageView(props: PageViewProps) {
  const { page: p, id, sealed, flashing, hints, hover, refused, pieceRadius = 21 } = props;
  const rules = useRules(p);
  const span = CELL_PX * p.size;
  const BOARD_PX = boardPx(p.size);
  const cellX = (c: number) => INSET_PX + gridOf(p.size).colOf(c) * CELL_PX;
  const y = (c: number) => INSET_PX + gridOf(p.size).rowOf(c) * CELL_PX;

  return (
    <svg ref={props.svgRef} class={`board size-${p.size}${p.hidden ? ' hidden-signs' : ''}${p.tidy ? ' tidy' : ''} ${props.class ?? ''}`} data-size={p.size} viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`} role="img" aria-label={props.label}>
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" class="g0" /><stop offset=".45" class="g1" /><stop offset=".55" class="g2" /><stop offset="1" class="g3" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2=".35">
          <stop offset=".38" stop-color="var(--sheen)" stop-opacity="0" />
          <stop offset=".5" stop-color="var(--sheen)" stop-opacity="1" />
          <stop offset=".62" stop-color="var(--sheen)" stop-opacity="0" />
        </linearGradient>
        <pattern id={`${id}-tool`} width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r=".9" class="tooling" /></pattern>
        {p.shade?.length ? (
          <pattern id={`${id}-shade`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="shade-line" width="3.2" height="9" /></pattern>
        ) : null}
        {p.cages.map((cage) => (
          <clipPath id={`${id}-cage-${cage.id}`} key={cage.id}>
            {cage.cells.map((c) => <rect key={c} x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} />)}
          </clipPath>
        ))}
      </defs>

      <rect class="vellum" x={INSET_PX} y={INSET_PX} width={span} height={span} />

      {props.marked?.size ? [...props.marked].map((c) => (
        <rect key={`m${c}`} class="marked" x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} />
      )) : null}

      {p.cages.map((cage) => (
        <g key={cage.id} class={`gilt${sealed.has(cage.id) ? ' on' : ''}${flashing?.has(cage.id) ? ' flash' : ''}`} data-cage={cage.id}>
          {cage.cells.map((c) => <rect key={c} x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} fill={`url(#${id}-gold)`} />)}
          {cage.cells.map((c) => <rect key={`t${c}`} x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} fill={`url(#${id}-tool)`} />)}
          <g clip-path={`url(#${id}-cage-${cage.id})`}>
            <rect class="sheen" x="0" y="0" width={BOARD_PX} height={BOARD_PX} fill={`url(#${id}-sheen)`} />
          </g>
          {sealed.has(cage.id) ? <Flower x={cellX(cage.cells[0]!) + CELL_PX - 11} y={y(cage.cells[0]!) + 11} /> : null}
        </g>
      ))}


      {p.shade?.map((c) => (
        <g key={`sh${c}`} class="shady">
          <rect class="shade-tint" x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} />
          <rect x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} fill={`url(#${id}-shade)`} />
        </g>
      ))}

      {p.poles?.map((cells) => <PoleMark key={`p${cells[0]}`} page={p} cells={cells} />)}

      {hints?.map((h, c) => (h === 'open' || h === 'seals' ? (
        <rect key={`h${c}`} class={h === 'seals' ? 'hint-seals' : 'hint-open'} x={cellX(c) + 3} y={y(c) + 3} width={CELL_PX - 6} height={CELL_PX - 6} rx="6" />
      ) : null))}

      {props.marked?.size ? [...props.marked].map((c) => (
        <rect key={`mo${c}`} class="marked-edge" x={cellX(c) + 2} y={y(c) + 2} width={CELL_PX - 4} height={CELL_PX - 4} rx="4" />
      )) : null}

      {p.diagonal ? (
        <g class="diagonals" aria-hidden="true">
          <path d={`M${INSET_PX + 6} ${INSET_PX + 6}L${INSET_PX + span - 6} ${INSET_PX + span - 6}M${INSET_PX + span - 6} ${INSET_PX + 6}L${INSET_PX + 6} ${INSET_PX + span - 6}`} />
        </g>
      ) : null}

      <path d={rules.thin} class="rule-thin" />
      <path d={rules.heavy} class="rule-heavy" />
      <rect class="frame" x={INSET_PX} y={INSET_PX} width={span} height={span} />

      {p.fences?.map((f) => <FenceMark key={`f${f.a}-${f.b}`} page={p} a={f.a} b={f.b} />)}
      {p.runners?.map((r) => <RunnerMark key={`r${r.a}-${r.b}`} page={p} a={r.a} b={r.b} />)}
      {p.elbow ? <ElbowKnots size={p.size} /> : null}

      {p.cages.map((cage) => (
        <text key={cage.id} class={`target${sealed.has(cage.id) ? ' on-gold' : ''}`} x={cellX(cage.cells[0]!) + 5} y={y(cage.cells[0]!) + 15}>
          {cageLabel(p, cage)}
        </text>
      ))}

      {p.stones.map((v, c) => v ? (
        <g key={c}>
          <path class="pebble" d={PEBBLE} transform={`translate(${cellX(c) + CELL_PX / 2 + 2} ${y(c) + CELL_PX / 2 + 4}) rotate(${(c * 67) % 360})`} />
          <text class={`stone${sealed.has(p.cageOf[c]!) ? ' on-gold' : ''}`} x={cellX(c) + CELL_PX / 2 + 2} y={y(c) + CELL_PX / 2 + 13}>{v}</text>
        </g>
      ) : null)}

      {props.revealed ? [...props.revealed].map(([c, v]) => (props.pieces[c] || p.stones[c] ? null : (
        <text key={`lens${c}`} class="revealed" x={cellX(c) + CELL_PX / 2} y={y(c) + CELL_PX / 2 + 9}>{v}</text>
      ))) : null}

      {props.targets ? [...props.targets].map((c) => (
        <rect key={`tg${c}`} class="tool-target" x={cellX(c) + 4} y={y(c) + 4} width={CELL_PX - 8} height={CELL_PX - 8} rx="8" />
      )) : null}

      {props.pieces.map((piece, c) => piece ? (
        <TokenShape
          key={piece.key} n={piece.n}
          x={cellX(c) + CELL_PX / 2 + 2} y={y(c) + CELL_PX / 2 + 4} r={pieceRadius} class={piece.cls ?? ''}
        />
      ) : null)}

      {hints?.map((h, c) => (h === 'blocked' ? (
        <rect key={`b${c}`} class="hint-blocked" x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} />
      ) : h === 'swap' ? (
        <rect key={`s${c}`} class="hint-swap" x={cellX(c) + 3} y={y(c) + 3} width={CELL_PX - 6} height={CELL_PX - 6} rx="6" />
      ) : null))}

      {props.blockers ? [...props.blockers].map((c) => (
        <circle key={`x${c}`} class="blocker" cx={cellX(c) + CELL_PX / 2 + 2} cy={y(c) + CELL_PX / 2 + 4} r={pieceRadius + 3} />
      )) : null}

      {hover ? (
        <rect class={hover.ok ? 'hover-ok' : 'hover-no'} x={cellX(hover.cell) + 1.5} y={y(hover.cell) + 1.5} width={CELL_PX - 3} height={CELL_PX - 3} rx="5" />
      ) : null}

      {refused ? (
        <rect key={refused.id} class="flash-no" x={cellX(refused.cell)} y={y(refused.cell)} width={CELL_PX} height={CELL_PX} />
      ) : null}
    </svg>
  );
}
