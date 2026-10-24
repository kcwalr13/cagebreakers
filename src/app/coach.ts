/**
 * The first chapter teaches by playing: one short tip at the moment it matters, one rule per
 * clash. Each tip shows once; the player can turn tips off or bring them back.
 */
import { computed, effect, signal } from '@preact/signals';
import { onBoard, sealedNow, type RunState } from '../core/run';
import { pieceKind } from '../core/pieces';
import { run } from './run/state';
import { readJson, writeJson } from './storage';

interface Tip { id: string; text: string; when: (s: RunState) => boolean }

const TIPS: Tip[] = [
  { id: 'latin', when: (s) => s.phase === 'plan' && s.clash === 1 && !onBoard(s).length, text: 'Drag a unit from the shop onto your cage. As in sudoku, no number may repeat in its row or column.' },
  { id: 'seal', when: (s) => s.phase === 'plan' && sealedNow(s).size > 0, text: "Sealed! A full cage that makes its red target turns gold and empowers everyone in it: + sturdier, × harder hitting, − faster, ÷ quicker to cast." },
  { id: 'fight', when: (s) => s.phase === 'plan' && s.clash === 1 && onBoard(s).length > 0, text: 'Units never move. Each hits the enemy facing it in its column. Press Clash when you are ready.' },
  { id: 'scout', when: (s) => s.phase === 'plan' && s.clash === 2, text: 'The strip above the page is your next enemy. Tap it to study their page before you fight.' },
  { id: 'claims', when: (s) => s.phase === 'plan' && s.clash === 3, text: 'You can field one unit per open cell you hold. Tap a hatched cage to claim it; holding more also brings stronger units to the shop.' },
  { id: 'callings', when: (s) => s.phase === 'plan' && s.clash === 4, text: "A unit's badge is its Calling: how it fights. Two different species of one Calling unlock a bonus. Tap the trait row under the page." },
  { id: 'kins', when: (s) => s.phase === 'plan' && s.clash === 5, text: "The emblem is its Kin, and each Kin cares about the page: Snails like stones, Hares share rows, Boars stack in columns, Owls love seals, Serpents want space, Stags fill lines. This clash is a Keeper: tap the strip to read its twist." },
  { id: 'merge', when: (s) => s.phase === 'merge', text: 'Three copies of one species combine into a stronger unit with a star. You choose which number it keeps.' },
  { id: 'items', when: (s) => s.phase === 'plan' && s.satchel.length > 0 && s.clash >= 2, text: 'Your satchel holds items. Tools change the page once; relics strengthen one unit for the rest of the run.' },
  { id: 'misprint', when: (s) => s.phase === 'plan' && s.offers.some((o) => !o.sold && pieceKind(o.species) !== 'number'), text: 'A Misprint is in the shop. These top-tier units are printed wrong, and each bends one puzzle rule. Hold it to read its card.' },
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
  if (!s || coachOff.value) return null;
  return TIPS.find((t) => !coachSeen.value.includes(t.id) && t.when(s)) ?? null;
});

export function dismissTip(id: string) { if (!coachSeen.value.includes(id)) coachSeen.value = [...coachSeen.value, id]; }
export function resetTips() { coachSeen.value = []; coachOff.value = false; }
