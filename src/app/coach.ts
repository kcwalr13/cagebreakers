/**
 * The first rounds teach by playing: one short tip at the moment it matters. Each tip shows
 * once; the player can turn tips off or bring them back.
 */
import { computed, effect, signal } from '@preact/signals';
import { RUN } from '../content/balance';
import { type RunState, dealtThisRound, onPage, viewNow } from '../core/run';
import { run } from './run/state';
import { readJson, writeJson } from './storage';

interface Tip { id: string; text: string; when: (s: RunState) => boolean }

const TIPS: Tip[] = [
  { id: 'latin', when: (s) => s.round === 1 && !onPage(s).length, text: 'Drag a number onto the page. As in sudoku, no number may repeat in its row or column.' },
  { id: 'commissions', when: (s) => s.round === 1 && onPage(s).length > 0, text: 'Above the page are this round\'s commissions. Miss the required one and you spill a drop of ink; the others pay gold. Tap one to see where it applies.' },
  { id: 'seal', when: (s) => viewNow(s).sealed.size > 0, text: 'Sealed! A full cage that makes its red target turns gold, and pays 1 gold every round you ink it sealed.' },
  { id: 'ink', when: (s) => s.round === 1 && dealtThisRound(s).filter((t) => t.cell >= 0).length >= s.need, text: 'Place at least all but one of your numbers, then Ink it. A spare number goes back to the bag for a later round.' },
  { id: 'move', when: (s) => s.round === 2, text: 'Everything on the page can move. Drag an old number somewhere new to meet this round\'s commissions.' },
  { id: 'tools', when: (s) => s.round >= 3 && s.gold >= 2, text: 'Gold buys tools: Redraw swaps the numbers in your hand, the Lens shows a hidden number, and the Blotter saves your ink for a round.' },
  { id: 'final', when: (s) => s.round === RUN.rounds, text: 'The final round: every number left in the bag is yours, and all of it goes in. Fill the page to finish the run.' },
];

const KEY = 'cagebreakers.coach';
const saved = readJson<{ seen?: string[]; off?: boolean }>(KEY);
export const coachSeen = signal<string[]>(saved?.seen ?? []);
// Automated tests play without tips unless they ask for them.
const params = new URLSearchParams(typeof location === 'object' ? location.search : '');
export const coachOff = signal<boolean>(saved?.off ?? (params.has('test') && !params.has('coach')));
effect(() => writeJson(KEY, { seen: coachSeen.value, off: coachOff.value }));

/** The tip to show now, if any. */
export const tip = computed<Tip | null>(() => {
  const s = run.value;
  if (!s || s.phase !== 'arrange' || coachOff.value) return null;
  return TIPS.find((t) => !coachSeen.value.includes(t.id) && t.when(s)) ?? null;
});

export function dismissTip(id: string) { if (!coachSeen.value.includes(id)) coachSeen.value = [...coachSeen.value, id]; }
export function resetTips() { coachSeen.value = []; coachOff.value = false; }
