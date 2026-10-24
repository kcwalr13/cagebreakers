import type { ComponentChildren, Ref } from 'preact';
import { useMemo } from 'preact/hooks';
import { CELLS, SIZE, colOf, rowOf } from '../core/grid';
import type { Page } from '../core/page';
import type { RelicId } from '../content/types';
import type { Hint } from '../core/rules';
import { BOARD_PX, CELL_PX, INSET_PX } from './input';
import { DominoShape, TokenShape } from './Token';

export const cellX = (cell: number) => INSET_PX + colOf(cell) * CELL_PX;
export const cellY = (cell: number) => INSET_PX + rowOf(cell) * CELL_PX;

export interface PieceView {
  key: string; n: number; species?: string; stars?: number; cls?: string;
  /** A Domino's second number and the cell it lies on. */
  n2?: number; span?: number;
  relic?: RelicId;
  /** For a Blank in a sealed cage: the number it stands for. */
  shown?: number;
}

/** Pieces for a page, one entry per cell; a Domino sits on its first cell and spans to its second. */
export function piecesOf(
  units: readonly { uid: string; species: string; n: number; n2?: number; stars: number; cell: number; cell2?: number; relic?: RelicId }[],
  cls?: (uid: string, cell: number) => string,
  shown?: ReadonlyMap<number, number>,
): (PieceView | null)[] {
  const out = new Array<PieceView | null>(CELLS).fill(null);
  for (const u of units) {
    if (u.cell < 0) continue;
    const v: PieceView = { key: u.uid, n: u.n, species: u.species, stars: u.stars };
    if (u.n2 !== undefined) v.n2 = u.n2;
    if (u.cell2 !== undefined && u.cell2 >= 0) v.span = u.cell2;
    if (u.relic) v.relic = u.relic;
    const sh = shown?.get(u.cell);
    if (sh) v.shown = sh;
    const c = cls?.(u.uid, u.cell);
    if (c) v.cls = c;
    out[u.cell] = v;
  }
  return out;
}

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
  /** Cages not yet claimed: hatched and faded. */
  dimCages?: ReadonlySet<number>;
  /** Cages to call out with a gold dashed outline (the free first claim). */
  outlineCages?: ReadonlySet<number>;
  /** Hidden numbers the Lens has shown, by cell. */
  revealed?: ReadonlyMap<number, number>;
  /** Cells to ring for a tool that targets them. */
  targets?: ReadonlySet<number>;
  /** A second hover cell: where a Domino's other half would land. */
  hover2?: number;
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
        <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="hatch" /></pattern>
        {p.cages.map((cage) => (
          <clipPath id={`${id}-cage-${cage.id}`} key={cage.id}>
            {cage.cells.map((c) => <rect key={c} x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} />)}
          </clipPath>
        ))}
      </defs>

      <rect class="vellum" x={INSET_PX} y={INSET_PX} width={span} height={span} />

      {p.cages.map((cage) => (
        <g key={cage.id} class={`gilt${sealed.has(cage.id) ? ' on' : ''}${flashing?.has(cage.id) ? ' flash' : ''}`} data-cage={cage.id}>
          {cage.cells.map((c) => <rect key={c} x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} fill={`url(#${id}-gold)`} />)}
          {cage.cells.map((c) => <rect key={`t${c}`} x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} fill={`url(#${id}-tool)`} />)}
          <g clip-path={`url(#${id}-cage-${cage.id})`}>
            <rect class="sheen" x="0" y="0" width={BOARD_PX} height={BOARD_PX} fill={`url(#${id}-sheen)`} />
          </g>
        </g>
      ))}

      {props.dimCages ? p.cages.filter((cage) => props.dimCages!.has(cage.id)).map((cage) => (
        <g key={`dim${cage.id}`} class="unclaimed">
          {cage.cells.map((c) => <rect key={c} x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} class="unclaimed-fill" />)}
          {cage.cells.map((c) => <rect key={`h${c}`} x={cellX(c)} y={y(c)} width={CELL_PX} height={CELL_PX} fill={`url(#${id}-hatch)`} />)}
        </g>
      )) : null}

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
          <text key={cage.id} class={`target${sealed.has(cage.id) ? ' on-gold' : ''}${props.dimCages?.has(cage.id) ? ' faded' : ''}`} x={cellX(first) + 5} y={y(first) + 15}>
            {cage.target}{cage.op}
          </text>
        );
      })}

      {p.stones.map((v, c) => v ? (
        <text key={c} class={`stone${sealed.has(p.cageOf[c]!) ? ' on-gold' : ''}${props.dimCages?.has(p.cageOf[c]!) ? ' faded' : ''}`} x={cellX(c) + CELL_PX / 2} y={y(c) + CELL_PX / 2 + 10}>{v}</text>
      ) : null)}

      {props.outlineCages ? p.cages.filter((cage) => props.outlineCages!.has(cage.id)).map((cage) => (
        <g key={`out${cage.id}`} class="claimable">
          {cage.cells.map((c) => <rect key={c} x={cellX(c) + 3} y={y(c) + 3} width={CELL_PX - 6} height={CELL_PX - 6} rx="6" class="hint-seals" />)}
        </g>
      )) : null}

      {props.revealed ? [...props.revealed].map(([c, v]) => (props.pieces[c] || p.stones[c] ? null : (
        <text key={`lens${c}`} class="revealed" x={cellX(c) + CELL_PX - 8} y={y(c) + CELL_PX - 7}>{v}</text>
      ))) : null}

      {props.targets ? [...props.targets].map((c) => (
        <rect key={`tg${c}`} class="tool-target" x={cellX(c) + 4} y={y(c) + 4} width={CELL_PX - 8} height={CELL_PX - 8} rx="8" />
      )) : null}

      {props.pieces.map((piece, c) => piece ? (
        <g key={piece.key}>
          {piece.span !== undefined && piece.n2 !== undefined && piece.species ? (
            <DominoShape
              n={piece.n} n2={piece.n2} species={piece.species} stars={piece.stars} relic={piece.relic}
              x1={cellX(c) + CELL_PX / 2 + 2} y1={y(c) + CELL_PX / 2 + 4}
              x2={cellX(piece.span) + CELL_PX / 2 + 2} y2={y(piece.span) + CELL_PX / 2 + 4}
              r={pieceRadius} class={piece.cls ?? ''}
            />
          ) : (
            <TokenShape
              n={piece.n} species={piece.species} stars={piece.stars} relic={piece.relic} shown={piece.shown}
              x={cellX(c) + CELL_PX / 2 + 2} y={y(c) + CELL_PX / 2 + 4} r={pieceRadius} class={piece.cls ?? ''}
            />
          )}
        </g>
      ) : null)}

      {hover ? (
        <rect class={hover.ok ? 'hover-ok' : 'hover-no'} x={cellX(hover.cell) + 1.5} y={y(hover.cell) + 1.5} width={CELL_PX - 3} height={CELL_PX - 3} rx="5" />
      ) : null}
      {hover?.ok && props.hover2 !== undefined && props.hover2 >= 0 ? (
        <rect class="hover-ok second" x={cellX(props.hover2) + 1.5} y={y(props.hover2) + 1.5} width={CELL_PX - 3} height={CELL_PX - 3} rx="5" />
      ) : null}

      {refused ? (
        <rect key={refused.id} class="flash-no" x={cellX(refused.cell)} y={y(refused.cell)} width={CELL_PX} height={CELL_PX} />
      ) : null}

      {props.children}
    </svg>
  );
}
