import { useMemo } from 'preact/hooks';
import { CELLS, SIZE, colOf, rowOf } from '../core/grid';
import type { Page } from '../core/page';
import { isLegal } from '../core/rules';
import { BOARD_PX, CELL_PX, INSET_PX, pressBoard, setBoardElement } from './input';
import { TokenShape } from './Token';
import {
  complete, drag, hints, justPlaced, justSealed, page, placed, refused, sealed, selection, values,
} from './state';

const cx = (cell: number) => INSET_PX + colOf(cell) * CELL_PX;
const cy = (cell: number) => INSET_PX + rowOf(cell) * CELL_PX;

/** Ruled lines: dashed within a cage, heavy between cages. Computed once per page. */
function useRules(p: Page) {
  return useMemo(() => {
    const thin: string[] = [], heavy: string[] = [];
    for (let cell = 0; cell < CELLS; cell++) {
      const r = rowOf(cell), c = colOf(cell);
      if (c < SIZE - 1) {
        const d = `M${cx(cell) + CELL_PX} ${cy(cell)}V${cy(cell) + CELL_PX}`;
        (p.cageOf[cell] === p.cageOf[cell + 1] ? thin : heavy).push(d);
      }
      if (r < SIZE - 1) {
        const d = `M${cx(cell)} ${cy(cell) + CELL_PX}H${cx(cell) + CELL_PX}`;
        (p.cageOf[cell] === p.cageOf[cell + SIZE] ? thin : heavy).push(d);
      }
    }
    return { thin: thin.join(''), heavy: heavy.join('') };
  }, [p]);
}

export function Board() {
  const p = page.value;
  const rules = useRules(p);
  const isSealed = sealed.value;
  const flashing = justSealed.value;
  const hintList = hints.value;
  const d = drag.value;
  const sel = selection.value;
  const moving = d?.from.kind === 'cell' ? d.from.cell : -1;
  const refusedNow = refused.value;
  const span = CELL_PX * SIZE;

  return (
    <div class="board-wrap" onPointerDown={(e) => pressBoard(e as unknown as PointerEvent)}>
      <svg
        ref={setBoardElement}
        class={`board${complete.value ? ' complete' : ''}`}
        viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`}
        role="img"
        aria-label={`Page ${p.seed}: ${isSealed.size} of ${p.cages.length} cages sealed`}
      >
        <defs>
          <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" class="g0" /><stop offset=".45" class="g1" /><stop offset=".55" class="g2" /><stop offset="1" class="g3" />
          </linearGradient>
          <linearGradient id="sheen" x1="0" y1="0" x2="1" y2=".35">
            <stop offset=".38" stop-color="var(--sheen)" stop-opacity="0" />
            <stop offset=".5" stop-color="var(--sheen)" stop-opacity="1" />
            <stop offset=".62" stop-color="var(--sheen)" stop-opacity="0" />
          </linearGradient>
          <pattern id="tool" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r=".9" class="tooling" /></pattern>
          {p.cages.map((cage) => (
            <clipPath id={`cage-${cage.id}`} key={cage.id}>
              {cage.cells.map((c) => <rect key={c} x={cx(c)} y={cy(c)} width={CELL_PX} height={CELL_PX} />)}
            </clipPath>
          ))}
        </defs>

        <rect class="vellum" x={INSET_PX} y={INSET_PX} width={span} height={span} />

        {p.cages.map((cage) => (
          <g key={cage.id} class={`gold${isSealed.has(cage.id) ? ' on' : ''}${flashing.has(cage.id) ? ' flash' : ''}`}>
            {cage.cells.map((c) => <rect key={c} x={cx(c)} y={cy(c)} width={CELL_PX} height={CELL_PX} fill="url(#gold)" />)}
            {cage.cells.map((c) => <rect key={`t${c}`} x={cx(c)} y={cy(c)} width={CELL_PX} height={CELL_PX} fill="url(#tool)" />)}
            <g clip-path={`url(#cage-${cage.id})`}>
              <rect class="sheen" x="0" y="0" width={BOARD_PX} height={BOARD_PX} />
            </g>
          </g>
        ))}

        {hintList.map((h, c) => {
          if (!h || h === 'blocked') return null;
          const x = cx(c), y = cy(c);
          if (h === 'dead') return <line key={c} class="hint-dead" x1={x + 12} y1={y + CELL_PX - 12} x2={x + CELL_PX - 12} y2={y + 12} />;
          return <rect key={c} class={h === 'seals' ? 'hint-seals' : 'hint-open'} x={x + 3} y={y + 3} width={CELL_PX - 6} height={CELL_PX - 6} rx="6" />;
        })}

        <path class="thin-path" d={rules.thin} stroke="var(--ink-soft)" stroke-width=".9" stroke-dasharray="2 3" opacity=".75" fill="none" />
        <path d={rules.heavy} stroke="var(--ink)" stroke-width="2.4" stroke-linecap="square" fill="none" />
        <rect class="frame" x={INSET_PX} y={INSET_PX} width={span} height={span} />

        {p.cages.map((cage) => {
          const first = cage.cells[0]!;
          return (
            <text key={cage.id} class={`target${isSealed.has(cage.id) ? ' on-gold' : ''}`} x={cx(first) + 5} y={cy(first) + 15}>
              {cage.target}{cage.op}
            </text>
          );
        })}

        {p.stones.map((v, c) => v ? (
          <text key={c} class={`stone${isSealed.has(p.cageOf[c]!) ? ' on-gold' : ''}`} x={cx(c) + CELL_PX / 2} y={cy(c) + CELL_PX / 2 + 10}>{v}</text>
        ) : null)}

        {placed.value.map((n, c) => n ? (
          <g key={`${c}:${n}`}>
            <TokenShape
              n={n}
              x={cx(c) + CELL_PX / 2 + 2}
              y={cy(c) + CELL_PX / 2 + 4}
              r={21}
              class={[
                justPlaced.value === c ? 'stamp' : '',
                sel?.kind === 'cell' && sel.cell === c ? 'lifted' : '',
                moving === c ? 'ghosted' : '',
              ].join(' ')}
            />
          </g>
        ) : null)}

        {d && d.over >= 0 ? (
          <rect
            class={d.over === moving || isLegal(p, values.value, d.over, d.n, moving) ? 'hover-ok' : 'hover-no'}
            x={cx(d.over) + 1.5} y={cy(d.over) + 1.5} width={CELL_PX - 3} height={CELL_PX - 3} rx="5"
          />
        ) : null}

        {refusedNow ? (
          <rect key={refusedNow.id} class="flash-no" x={cx(refusedNow.cell)} y={cy(refusedNow.cell)} width={CELL_PX} height={CELL_PX} />
        ) : null}
      </svg>
    </div>
  );
}
