/**
 * One controller for every press on the page and tray. A press that moves more than a few
 * pixels becomes a drag; otherwise it's a tap. While dragging, the number floats above the
 * finger and the cell under the floating number is the drop target, so the finger never
 * hides where the number will land.
 */
import { CELLS, SIZE } from '../core/grid';
import {
  type Selection, drag, page, place, placed, removeAt, say, selection, sheet,
} from './state';

export const BOARD_PX = 362;
export const CELL_PX = 59;
export const INSET_PX = 4;
/** How far above the finger the dragged number floats, in CSS pixels. */
export const LIFT_PX = 56;
const DRAG_THRESHOLD = 8;

let boardEl: SVGSVGElement | null = null;
export function setBoardElement(el: SVGSVGElement | null) { boardEl = el; }

export function cellFromPoint(x: number, y: number): number {
  if (!boardEl) return -1;
  const rect = boardEl.getBoundingClientRect();
  const scale = rect.width / BOARD_PX;
  const lx = (x - rect.left) / scale - INSET_PX;
  const ly = (y - rect.top) / scale - INSET_PX;
  const span = CELL_PX * SIZE;
  if (lx < 0 || ly < 0 || lx >= span || ly >= span) return -1;
  const cell = Math.floor(ly / CELL_PX) * SIZE + Math.floor(lx / CELL_PX);
  return cell >= 0 && cell < CELLS ? cell : -1;
}

interface Press { from: Selection | null; cell: number; n: number; x0: number; y0: number; dragging: boolean; id: number }
let press: Press | null = null;

function onMove(e: PointerEvent) {
  if (!press || e.pointerId !== press.id) return;
  if (!press.dragging) {
    if (!press.from || Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < DRAG_THRESHOLD) return;
    press.dragging = true;
    sheet.value = null;
  }
  e.preventDefault();
  drag.value = { n: press.n, from: press.from!, x: e.clientX, y: e.clientY, over: cellFromPoint(e.clientX, e.clientY - LIFT_PX) };
}

function onUp(e: PointerEvent) {
  if (!press || e.pointerId !== press.id) return;
  const p = press;
  press = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onCancel);
  if (p.dragging) {
    const over = cellFromPoint(e.clientX, e.clientY - LIFT_PX);
    drag.value = null;
    drop(p, over);
  } else {
    tap(p);
  }
}

function onCancel(e: PointerEvent) {
  if (!press || e.pointerId !== press.id) return;
  press = null;
  drag.value = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onCancel);
}

function begin(e: PointerEvent, p: Omit<Press, 'x0' | 'y0' | 'dragging' | 'id'>) {
  if (press || (e.pointerType === 'mouse' && e.button !== 0)) return;
  press = { ...p, x0: e.clientX, y0: e.clientY, dragging: false, id: e.pointerId };
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
}

export function pressTray(e: PointerEvent, n: number) {
  begin(e, { from: { kind: 'tray', n }, cell: -1, n });
}

export function pressBoard(e: PointerEvent) {
  const cell = cellFromPoint(e.clientX, e.clientY);
  if (cell < 0) return;
  const n = placed.value[cell] ?? 0;
  begin(e, { from: n ? { kind: 'cell', cell } : null, cell, n });
}

function drop(p: Press, over: number) {
  const from = p.from!;
  if (over < 0) {
    if (from.kind === 'cell') { removeAt(from.cell); say(`Took the ${p.n} off the page.`); }
    return;
  }
  if (from.kind === 'tray') place(over, p.n);
  else place(over, p.n, from.cell);
  if (from.kind === 'cell') selection.value = null;
}

function tap(p: Press) {
  const sel = selection.value;
  if (p.cell < 0) {
    // Tray tap: pick up that number, or put it down if it's already in hand.
    const n = p.n;
    selection.value = sel?.kind === 'tray' && sel.n === n ? null : { kind: 'tray', n };
    return;
  }
  const cell = p.cell;
  if (sel?.kind === 'tray') { place(cell, sel.n); return; }
  if (sel?.kind === 'cell') {
    if (sel.cell === cell) { selection.value = null; return; }
    const n = placed.value[sel.cell] ?? 0;
    if (n && place(cell, n, sel.cell)) selection.value = null;
    return;
  }
  if (placed.value[cell]) { selection.value = { kind: 'cell', cell }; return; }
  sheet.value = { kind: 'cage', cage: page.value.cageOf[cell]! };
}
