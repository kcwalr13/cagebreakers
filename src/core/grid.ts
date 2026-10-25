/**
 * Square pages from 5×5 to 8×8, numbers 1 to n. Cells are indexed row-major from 0; row 0 is the
 * top. Every rule reads its geometry from here, through the page's size.
 */
export const SIZES = [5, 6, 7, 8] as const;
export type Size = (typeof SIZES)[number];

export interface Grid {
  size: number;
  /** size × size */
  cells: number;
  /** 1 to size. */
  numbers: readonly number[];
  rowOf(cell: number): number;
  colOf(cell: number): number;
  cellAt(row: number, col: number): number;
  /** Orthogonal neighbours of each cell. Shared: don't mutate. */
  neighbors: readonly (readonly number[])[];
  /** Cells sharing a row or column with each cell, excluding it. Shared: don't mutate. */
  peers: readonly (readonly number[])[];
  /** Every cell index, 0 to cells − 1. Shared: don't mutate. */
  all: readonly number[];
  /** The two long diagonals: top-left to bottom-right, then top-right to bottom-left. Shared: don't mutate. */
  diagonals: readonly [readonly number[], readonly number[]];
  /**
   * Peers on a page where the long diagonals count too: the row and column, and every other cell on
   * either long diagonal the cell lies on. Shared: don't mutate.
   */
  crossPeers: readonly (readonly number[])[];
}

const grids = new Map<number, Grid>();

export function gridOf(size: number): Grid {
  let g = grids.get(size);
  if (g) return g;
  const cells = size * size;
  const rowOf = (c: number) => Math.floor(c / size);
  const colOf = (c: number) => c % size;
  const cellAt = (r: number, c: number) => r * size + c;
  const all = Array.from({ length: cells }, (_, i) => i);
  const neighbors = all.map((c) => {
    const r = rowOf(c), k = colOf(c), out: number[] = [];
    if (r > 0) out.push(c - size);
    if (r < size - 1) out.push(c + size);
    if (k > 0) out.push(c - 1);
    if (k < size - 1) out.push(c + 1);
    return out;
  });
  const peers = all.map((c) => {
    const r = rowOf(c), k = colOf(c), out: number[] = [];
    for (let i = 0; i < size; i++) {
      if (i !== k) out.push(cellAt(r, i));
      if (i !== r) out.push(cellAt(i, k));
    }
    return out;
  });
  const down = Array.from({ length: size }, (_, i) => cellAt(i, i));
  const up = Array.from({ length: size }, (_, i) => cellAt(i, size - 1 - i));
  const crossPeers = all.map((c) => {
    const out = new Set(peers[c]);
    for (const d of [down, up]) if (d.includes(c)) for (const x of d) if (x !== c) out.add(x);
    return [...out];
  });
  g = {
    size, cells, numbers: Array.from({ length: size }, (_, i) => i + 1), rowOf, colOf, cellAt, neighbors, peers, all,
    diagonals: [down, up], crossPeers,
  };
  grids.set(size, g);
  return g;
}

/** The grid a board of values belongs to, from its length. */
export const gridOfValues = (values: readonly unknown[]): Grid => gridOf(Math.round(Math.sqrt(values.length)));
