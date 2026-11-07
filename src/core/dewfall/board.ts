/**
 * A Dewfall garden: a grid `width` squares across and `height` down, indexed row-major from the
 * top-left. The trail comes in through a gap in the hedge above the top row and ends at the bed
 * below the bottom row.
 */
export interface Board {
  width: number;
  height: number;
  cells: number;
  rowOf(cell: number): number;
  colOf(cell: number): number;
  cellAt(row: number, col: number): number;
  /** The squares sharing an edge with each square. Shared: don't mutate. */
  orth: readonly (readonly number[])[];
  /** The up to eight squares touching each square, corners included. Shared: don't mutate. */
  around: readonly (readonly number[])[];
  all: readonly number[];
  /** The square one step from `cell` towards `dir`, or -1 past the edge. */
  step(cell: number, dir: Dir): number;
  /** The squares from `cell` (not counting it) towards `dir`, up to the edge. Shared: don't mutate. */
  ray(cell: number, dir: Dir): readonly number[];
}

/** North, east, south and west. */
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly Dir[] = [0, 1, 2, 3];
const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];

const boards = new Map<string, Board>();

export function boardOf(width: number, height: number): Board {
  const key = `${width}x${height}`;
  let b = boards.get(key);
  if (b) return b;
  const cells = width * height;
  const rowOf = (c: number) => Math.floor(c / width);
  const colOf = (c: number) => c % width;
  const cellAt = (r: number, c: number) => r * width + c;
  const all = Array.from({ length: cells }, (_, i) => i);
  const inside = (r: number, c: number) => r >= 0 && r < height && c >= 0 && c < width;
  const orth = all.map((i) => {
    const r = rowOf(i), c = colOf(i);
    return ([[-1, 0], [0, -1], [0, 1], [1, 0]] as const).filter(([dr, dc]) => inside(r + dr, c + dc)).map(([dr, dc]) => cellAt(r + dr, c + dc));
  });
  const around = all.map((i) => {
    const r = rowOf(i), c = colOf(i);
    const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && inside(r + dr, c + dc)) out.push(cellAt(r + dr, c + dc));
    return out;
  });
  const step = (i: number, d: Dir) => {
    const r = rowOf(i) + DR[d]!, c = colOf(i) + DC[d]!;
    return inside(r, c) ? cellAt(r, c) : -1;
  };
  const rays = all.map((i) => DIRS.map((d) => {
    const out: number[] = [];
    for (let x = step(i, d); x >= 0; x = step(x, d)) out.push(x);
    return out;
  }));
  b = { width, height, cells, rowOf, colOf, cellAt, orth, around, all, step, ray: (i, d) => rays[i]![d]! };
  boards.set(key, b);
  return b;
}
