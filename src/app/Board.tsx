import { isLegal } from '../core/rules';
import { drag, pressBoard, setBoardElement } from './input';
import { PageView, type PieceView } from './PageView';
import {
  complete, hints, justPlaced, justSealed, page, placed, refused, sealed, selection, values,
} from './state';

/** The page toy's board: bare numbers on a generated page. */
export function Board() {
  const p = page.value;
  const d = drag.value;
  const sel = selection.value;
  const moving = d?.from.kind === 'cell' ? d.from.cell : -1;
  const pieces: (PieceView | null)[] = placed.value.map((n, c) => n ? {
    key: `${c}:${n}`, n,
    cls: [
      justPlaced.value === c ? 'stamp' : '',
      sel?.kind === 'cell' && sel.cell === c ? 'lifted' : '',
      moving === c ? 'ghosted' : '',
    ].join(' '),
  } : null);
  const hover = d && d.over >= 0
    ? { cell: d.over, ok: d.over === moving || isLegal(p, values.value, d.over, d.look.n, moving) }
    : null;

  return (
    <div class="board-wrap" onPointerDown={(e) => pressBoard(e as unknown as PointerEvent)}>
      <PageView
        id="toy"
        svgRef={setBoardElement}
        page={p}
        pieces={pieces}
        sealed={sealed.value}
        flashing={justSealed.value}
        hints={hints.value}
        hover={hover}
        refused={refused.value}
        class={complete.value ? 'complete' : ''}
        label={`Page ${p.seed}: ${sealed.value.size} of ${p.cages.length} cages sealed`}
      />
    </div>
  );
}
