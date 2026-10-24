/** The page is always 6×6, numbers 1–6. Cells are indexed 0–35, row-major; row 0 is the front. */
export const SIZE = 6;
export const CELLS = SIZE * SIZE;
export const NUMBERS = [1, 2, 3, 4, 5, 6] as const;

export const rowOf = (cell: number): number => Math.floor(cell / SIZE);
export const colOf = (cell: number): number => cell % SIZE;
export const cellAt = (row: number, col: number): number => row * SIZE + col;

export function neighbors(cell: number): number[] {
  const r = rowOf(cell), c = colOf(cell);
  const out: number[] = [];
  if (r > 0) out.push(cell - SIZE);
  if (r < SIZE - 1) out.push(cell + SIZE);
  if (c > 0) out.push(cell - 1);
  if (c < SIZE - 1) out.push(cell + 1);
  return out;
}

/** Cells sharing a row or column with `cell`, excluding it. */
export function peers(cell: number): number[] {
  const r = rowOf(cell), c = colOf(cell);
  const out: number[] = [];
  for (let i = 0; i < SIZE; i++) {
    if (i !== c) out.push(cellAt(r, i));
    if (i !== r) out.push(cellAt(i, c));
  }
  return out;
}

export const PEERS: readonly (readonly number[])[] = Array.from({ length: CELLS }, (_, i) => peers(i));
