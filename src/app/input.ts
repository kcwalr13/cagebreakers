/**
 * One controller for every press on a page and its tray or bench. A press that moves more
 * than a few pixels becomes a drag; one held still becomes a long-press; otherwise it's a tap.
 * While dragging, the piece floats above the finger and the cell under the floating piece is
 * the drop target, so the finger never hides where it will land.
 *
 * Each screen registers its own handlers; the controller knows nothing about game rules.
 */
import { signal } from '@preact/signals';
import { CELLS, SIZE } from '../core/grid';

export const BOARD_PX = 362;
export const CELL_PX = 59;
export const INSET_PX = 4;
/** How far above the finger the dragged piece floats, in CSS pixels. */
export const LIFT_PX = 56;
const DRAG_THRESHOLD = 8;
const LONG_PRESS_MS = 450;

/** Where a press started: a tray or bench item (by key), or a cell on the page. */
export type Source = { kind: 'item'; key: string } | { kind: 'cell'; cell: number };

/** What the floating ghost shows while dragging. */
export interface DragLook { n: number; species?: string; stars?: number }

export interface DragState { from: Source; look: DragLook; x: number; y: number; over: number }

export interface PressHandlers {
  /** The movable piece on a cell, if any. */
  lookAt(cell: number): DragLook | null;
  lookOf(key: string): DragLook | null;
  drop(from: Source, cell: number): void;
  /** Released away from the page; x and y are where the finger lifted. */
  dropOff(from: Source, x: number, y: number): void;
  tapCell(cell: number): void;
  tapItem(key: string): void;
  longPress?(from: Source): void;
}

export const drag = signal<DragState | null>(null);

let handlers: PressHandlers | null = null;
let boardEl: SVGSVGElement | null = null;

export function setHandlers(h: PressHandlers | null) { handlers = h; }
export function setBoardElement(el: SVGSVGElement | null) { boardEl = el; }

export function cellFromPoint(x: number, y: number): number {
  if (!boardEl) return -1;
  const rect = boardEl.getBoundingClientRect();
  if (!rect.width) return -1;
  const scale = rect.width / BOARD_PX;
  const lx = (x - rect.left) / scale - INSET_PX;
  const ly = (y - rect.top) / scale - INSET_PX;
  const span = CELL_PX * SIZE;
  if (lx < 0 || ly < 0 || lx >= span || ly >= span) return -1;
  const cell = Math.floor(ly / CELL_PX) * SIZE + Math.floor(lx / CELL_PX);
  return cell >= 0 && cell < CELLS ? cell : -1;
}

interface Press { from: Source; look: DragLook | null; x0: number; y0: number; dragging: boolean; id: number; timer?: ReturnType<typeof setTimeout>; done: boolean }
let press: Press | null = null;

function end() {
  if (press?.timer) clearTimeout(press.timer);
  press = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onCancel);
}

function onMove(e: PointerEvent) {
  if (!press || e.pointerId !== press.id || press.done) return;
  if (!press.dragging) {
    if (!press.look || Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < DRAG_THRESHOLD) return;
    press.dragging = true;
    if (press.timer) clearTimeout(press.timer);
  }
  e.preventDefault();
  drag.value = { from: press.from, look: press.look!, x: e.clientX, y: e.clientY, over: cellFromPoint(e.clientX, e.clientY - LIFT_PX) };
}

function onUp(e: PointerEvent) {
  if (!press || e.pointerId !== press.id) return;
  const p = press;
  end();
  if (p.done || !handlers) return;
  if (p.dragging) {
    const over = cellFromPoint(e.clientX, e.clientY - LIFT_PX);
    drag.value = null;
    if (over >= 0) handlers.drop(p.from, over); else handlers.dropOff(p.from, e.clientX, e.clientY);
  } else if (p.from.kind === 'item') {
    handlers.tapItem(p.from.key);
  } else {
    handlers.tapCell(p.from.cell);
  }
}

function onCancel(e: PointerEvent) {
  if (!press || e.pointerId !== press.id) return;
  end();
  drag.value = null;
}

function begin(e: PointerEvent, from: Source, look: DragLook | null) {
  if (press || (e.pointerType === 'mouse' && e.button !== 0)) return;
  press = { from, look, x0: e.clientX, y0: e.clientY, dragging: false, id: e.pointerId, done: false };
  if (handlers?.longPress && look) {
    const p = press;
    p.timer = setTimeout(() => {
      if (press !== p || p.dragging) return;
      p.done = true;
      handlers?.longPress?.(from);
    }, LONG_PRESS_MS);
  }
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
}

export function pressItem(e: PointerEvent, key: string) {
  begin(e, { kind: 'item', key }, handlers?.lookOf(key) ?? null);
}

export function pressBoard(e: PointerEvent) {
  const cell = cellFromPoint(e.clientX, e.clientY);
  if (cell < 0) return;
  begin(e, { kind: 'cell', cell }, handlers?.lookAt(cell) ?? null);
}
