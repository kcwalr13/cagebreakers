/**
 * How a unit stands on the page. Most units are one number in one cell. The Misprints differ:
 * the Blank has no number, the Smudge stands outside the Latin rule, and the Domino fills two
 * neighboring cells with a number on each half.
 */
import { heft } from '../content/balance';
import { speciesById } from '../content/species';
import type { MisprintId } from '../content/types';
import { CELLS, SIZE, colOf, rowOf } from './grid';
import { BLANK, SMUDGE } from './rules';

export type PieceKind = 'number' | MisprintId;

/** The fields every placed piece carries. A Domino's second half is `n2` at `cell2`. */
export interface Piece {
  species: string;
  n: number;
  n2?: number;
  /** -1 while on the bench. */
  cell: number;
  cell2?: number;
}

export const pieceKind = (species: string): PieceKind => speciesById(species).misprint ?? 'number';

/** The cells a unit fills on the page (none on the bench). */
export function cellsOf(u: Piece): number[] {
  if (u.cell < 0) return [];
  return u.cell2 !== undefined && u.cell2 >= 0 ? [u.cell, u.cell2] : [u.cell];
}

/** What a unit writes into a cell for the rules: its number, or a Misprint's marker. */
export function markAt(u: Piece, cell: number): number {
  const kind = pieceKind(u.species);
  if (kind === 'blank') return BLANK;
  if (kind === 'smudge') return SMUDGE;
  if (kind === 'domino' && cell === u.cell2) return u.n2 ?? 0;
  return u.n;
}

/** The numbers and markers standing on the page from these units (stones excluded). */
export function writeUnits(units: readonly Piece[]): number[] {
  const out = new Array<number>(CELLS).fill(0);
  for (const u of units) for (const c of cellsOf(u)) out[c] = markAt(u, c);
  return out;
}

/** Big numbers hit hard, small numbers act fast. The Blank fights as a middling number; a Domino as the mean of its halves. */
export function heftOf(u: Pick<Piece, 'species' | 'n' | 'n2'>): number {
  const kind = pieceKind(u.species);
  if (kind === 'blank') return 1;
  if (kind === 'domino') return heft((u.n + (u.n2 ?? u.n)) / 2);
  return heft(u.n);
}

/** The four directions a Domino's second half can lie from its first, in the order turning cycles through. */
export const DOMINO_TURNS = [1, SIZE, -1, -SIZE] as const;

export function besideCell(cell: number, step: number): number {
  const to = cell + step;
  if (to < 0 || to >= CELLS) return -1;
  if (Math.abs(step) === 1 && rowOf(to) !== rowOf(cell)) return -1;
  if (Math.abs(step) === SIZE && colOf(to) !== colOf(cell)) return -1;
  return to;
}

/** Short label for a unit's number in the player's terms: "4", "blank", "3|5". */
export function numberLabel(u: Pick<Piece, 'species' | 'n' | 'n2'>): string {
  const kind = pieceKind(u.species);
  if (kind === 'blank') return 'no number';
  if (kind === 'domino') return `${u.n} and ${u.n2}`;
  return String(u.n);
}
