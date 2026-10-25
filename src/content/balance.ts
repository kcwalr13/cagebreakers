/**
 * The shape of a run. Balance numbers live here, never in the rules code or the design doc.
 * The bot lab tunes them against the design doc's targets.
 */
export const RUN = {
  rounds: 8,
  startInk: 3,
  startGold: 0,
  /** Numbers dealt each round before the last; the last round deals whatever is left. */
  deal: [4, 4, 4, 4, 4, 5, 5] as readonly number[],
  /** Earlier deals never leave fewer than this many numbers for the final round. */
  finalReserve: 3,
  /** Each sealed cage pays this much gold when a round is inked. */
  sealGold: 1,
  /** Each drop of ink left at the end adds this much to the score. */
  inkBonus: 10,
} as const;

export const TOOLS = {
  redraw: 2,
  lens: 3,
  blotter: 5,
} as const;

export type ToolId = keyof typeof TOOLS;
