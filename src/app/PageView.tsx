import type { ComponentChildren, Ref } from 'preact';
import { useMemo } from 'preact/hooks';
import { CELLS, SIZE, colOf, rowOf } from '../core/grid';
import type { Page } from '../core/page';
import type { Hint } from '../core/rules';
import { BOARD_PX, CELL_PX, INSET_PX } from './input';
import { TokenShape } from './Token';

export const cellX = (cell: number) => INSET_PX + colOf(cell) * CELL_PX;
export const cellY = (cell: number) => INSET_PX + rowOf(cell) * CELL_PX;

export interface PieceView { key: string; n: number; species?: string; stars?: number; cls?: string }

/** Ruled lines: dashed within a cage, heavy between cages. */
function useRules(p: Page) {
  return useMemo(() => {
    const thin: string[] = [], heavy: string[] = [];
    for (let cell = 0; cell < CELLS; cell++) {
      const r = rowOf(cell), c = colOf(cell);
      if (c < SIZE - 1) {
        const d = `M${cellX(cell) + CELL_PX} ${cellY(cell)}V${cellY(cell) + CELL_PX}`;
        (p.cageOf[cell] === p.cageOf[cell + 1] ? thin : heavy).push(d);
      }
      if (r < SIZE - 1) {
        const d = `M${cellX(cell)} ${cellY(cell) + CELL_PX}H${cellX(cell) + CELL_PX}`;
        (p.cageOf[cell] === p.cageOf[cell + SIZE] ? thin : heavy).push(d);
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
  hints?: readonly (Hint | null)[];
  hover?: { cell: number; ok: boolean } | null;
  refused?: { cell: number; id: number } | null;
  /** Flip vertically, so an enemy page's front row faces down toward yours. */
  mirrored?: boolean;
  label: string;
  svgRef?: Ref<SVGSVGElement>;
  class?: string;
  /** Extra SVG drawn over the page in page coordinates (clash effects). */
  children?: ComponentChildren;
  pieceRadius?: number;
}

/** Maps a cell to the row it is drawn on (enemy pages are mirrored). */
export const drawnY = (cell: number, mirrored = false) =>
  INSET_PX + (mirrored ? SIZE - 1 - rowOf(cell) : rowOf(cell)) * CELL_PX;

export function PageView(props: PageViewProps) {
  const { page: p, id, sealed, flashing, hints, hover, refused, mirrored = false, pieceRadius = 21 } = props;
  const rules = useRules(p);
  const span = CELL_PX * SIZE;
  const y = (cell: number) => drawnY(cell, mirrored);
  const flip = mirrored ? `translate(0 ${BOARD_PX}) scale(1 -1)` : undefined;

  return (
    <svg ref={props.svgRef} class={`board ${props.class ?? ''}`} viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`} role="img" aria-label={props.label}>
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
        {p.cages.map((cage) => (
          <clipPath id={`${id}-cage-${cage.id}`} key={cage.id}>
            {cage.cells.map((c) => <rect key={c} x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} />)}
          </clipPath>
        ))}
      </defs>

      <rect class="vellum" x={INSET_PX} y={INSET_PX} width={span} height={span} />

      {p.cages.map((cage) => (
        <g key={cage.id} class={`gold${sealed.has(cage.id) ? ' on' : ''}${flashing?.has(cage.id) ? ' flash' : ''}`} data-cage={cage.id}>
          {cage.cells.map((c) => <rect key={c} x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} fill={`url(#${id}-gold)`} />)}
          {cage.cells.map((c) => <rect key={`t${c}`} x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} fill={`url(#${id}-tool)`} />)}
          <g clip-path={`url(#${id}-cage-${cage.id})`}>
            <rect class="sheen" x="0" y="0" width={BOARD_PX} height={BOARD_PX} fill={`url(#${id}-sheen)`} />
          </g>
        </g>
      ))}

      {hints?.map((h, c) => {
        if (!h || h === 'blocked') return null;
        const x = cellX(c), yy = y(c);
        if (h === 'dead') return <line key={c} class="hint-dead" x1={x + 12} y1={yy + CELL_PX - 12} x2={x + CELL_PX - 12} y2={yy + 12} />;
        return <rect key={c} class={h === 'seals' ? 'hint-seals' : 'hint-open'} x={x + 3} y={yy + 3} width={CELL_PX - 6} height={CELL_PX - 6} rx="6" />;
      })}

      <g transform={flip}>
        <path d={rules.thin} class="rule-thin" />
        <path d={rules.heavy} class="rule-heavy" />
      </g>
      <rect class="frame" x={INSET_PX} y={INSET_PX} width={span} height={span} />

      {p.cages.map((cage) => {
        // The target sits in the cage's top-left cell as drawn.
        const first = mirrored ? cage.cells.slice().sort((a, b) => rowOf(b) - rowOf(a) || colOf(a) - colOf(b))[0]! : cage.cells[0]!;
        return (
          <text key={cage.id} class={`target${sealed.has(cage.id) ? ' on-gold' : ''}`} x={cellX(first) + 5} y={y(first) + 15}>
            {cage.target}{cage.op}
          </text>
        );
      })}

      {p.stones.map((v, c) => v ? (
        <text key={c} class={`stone${sealed.has(p.cageOf[c]!) ? ' on-gold' : ''}`} x={cellX(c) + CELL_PX / 2} y={y(c) + CELL_PX / 2 + 10}>{v}</text>
      ) : null)}

      {props.pieces.map((piece, c) => piece ? (
        <g key={piece.key}>
          <TokenShape
            n={piece.n} species={piece.species} stars={piece.stars}
            x={cellX(c) + CELL_PX / 2 + 2} y={y(c) + CELL_PX / 2 + 4} r={pieceRadius} class={piece.cls ?? ''}
          />
        </g>
      ) : null)}

      {hover ? (
        <rect class={hover.ok ? 'hover-ok' : 'hover-no'} x={cellX(hover.cell) + 1.5} y={y(hover.cell) + 1.5} width={CELL_PX - 3} height={CELL_PX - 3} rx="5" />
      ) : null}

      {refused ? (
        <rect key={refused.id} class="flash-no" x={cellX(refused.cell)} y={y(refused.cell)} width={CELL_PX} height={CELL_PX} />
      ) : null}

      {props.children}
    </svg>
  );
}
