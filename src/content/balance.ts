/**
 * The shape of a run. Balance numbers live here, never in the rules code or the design doc.
 * The bot lab tunes them against the design doc's targets.
 */
export const RUN = {
  rounds: 6,
  startInk: 3,
  startGold: 0,
  /** Numbers dealt each round before the last; the last round deals whatever is left. */
  deal: [4, 4, 4, 4, 4] as readonly number[],
  /** Earlier deals never leave fewer than this many numbers for the final round. */
  finalReserve: 3,
  /** Each sealed cage pays this much gold when a round is inked. */
  sealGold: 1,
  /** Placing every number dealt this round (not just all but one) pays this much gold when it's inked. */
  fullHandGold: 1,
  /** Each drop of ink left at the end adds this much to the score. */
  inkBonus: 10,
} as const;

/** What each tool costs in gold when you use it during a run. */
export const TOOLS = {
  lens: 3,
  quill: 3,
  gilder: 4,
  eraser: 4,
  inkwell: 10,
} as const;

export type ToolId = keyof typeof TOOLS;

/** The tools every run carries unless the satchel says otherwise. */
export const BASE_TOOLS: readonly ToolId[] = ['lens'];
/** How many tools fit in the satchel, before and after the Second Strap. */
export const SATCHEL = { slots: 3, strapSlots: 4 } as const;
