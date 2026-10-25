/**
 * The first rounds teach by playing: one short tip at the moment it matters. Each tip shows
 * once; the player can turn tips off or bring them back.
 */
import { computed, effect, signal } from '@preact/signals';
import { RUN, TOOLS, ZEN } from '../content/balance';
import { type RunState, inkBlocker, onPage, runPage, viewNow } from '../core/run';
import { run } from './run/state';
import { readJson, writeJson } from './storage';

interface Tip { id: string; text: string; when: (s: RunState) => boolean }

const page = (s: RunState) => runPage(s);
const TIPS: Tip[] = [
  { id: 'latin', when: (s) => s.round === 1 && !onPage(s).length, text: 'Drag a number into the garden, or tap it, then a square. Bright squares can take it; shaded ones can\'t.' },
  { id: 'zen', when: (s) => !!s.setup.zen, text: `A Zen garden: no requests and no water, just the puzzle. Every number is dealt at once. Each plot in bloom pays ${ZEN.bloomGold} coins at the end, and a garden in full bloom pays ${ZEN.perfectGold} more.` },
  { id: 'fences', when: (s) => !!page(s).fences?.length, text: 'Fences: a < or > on the edge between two squares opens towards the bigger number, as in 5 > 3. A number that breaks a fence can\'t go in.' },
  { id: 'hidden', when: (s) => !!page(s).hidden, text: 'Lost labels: plots show only their target. Adding, taking away, multiplying or dividing can make it; taking away and dividing only in two-square plots.' },
  { id: 'diagonal', when: (s) => !!page(s).diagonal, text: 'Crossed paths: the two dotted long diagonals count like rows, so no number repeats on either of them.' },
  { id: 'commissions', when: (s) => !s.setup.zen && s.round === 1 && onPage(s).length > 0, text: 'Above the garden are this week\'s requests. Miss the required one and a drop of water dries up; the other two pay coins. All three can always be met at once, with every number planted: finding how is the puzzle. Tap one to see where it applies.' },
  { id: 'seal', when: (s) => !s.setup.zen && viewNow(s).sealed.size > 0, text: 'In bloom! A full plot that makes its target blooms, and pays 1 coin every week you water it in bloom.' },
  { id: 'ink', when: (s) => !s.setup.zen && s.round === 1 && inkBlocker(s) === null, text: `Plant all your numbers, or all but one, then Water it. Planting every one pays ${RUN.fullHandGold} bonus ${RUN.fullHandGold === 1 ? 'coin' : 'coins'}; a number you keep is dealt again later.` },
  { id: 'move', when: (s) => s.round === 2, text: 'A number in its right square never has to move: all three requests can be met with it left there. Anything else can move to meet them. Double-tap a number to pick it up, or tap Pick up all to start over.' },
  { id: 'tools', when: (s) => s.round >= 3 && s.gold >= TOOLS.lens, text: 'Coins buy tools: Hint shows the right number for one empty square. The Potting Shed sells more to carry. Tap a tool to see what it does.' },
  { id: 'final', when: (s) => !s.setup.zen && s.round === s.setup.rounds, text: 'Harvest week: every number still to come is dealt now, and all of them go in. Fill the garden to harvest it.' },
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

/** Tips for the map, the Potting Shed and the Herbarium, shown once each on first visit. */
export const SCREEN_TIPS = {
  map: 'The map has four regions. Finish a garden, then spend seeds to open a path to one beyond it. Stars open new regions, score marks earn them, and a few gardens are hidden until you find them.',
  home: 'Every garden you finish leaves a seed packet. Tap a packet, then a bed, to plant it; it grows with every week you water, in any garden. Tap a square to build there.',
  journal: 'Goals to aim for, each worth seeds. Claim them here once they\'re done.',
  shop: 'Seeds buy things that stay: tools to carry, upgrades for every garden on the map, and new looks. Choose your tools when you start a garden.',
  library: 'Every garden you finish is pressed here, with its score and stars.',
} as const;

/** The screen tip to show, if it hasn't been seen and tips are on. */
export const screenTip = (id: keyof typeof SCREEN_TIPS): string | null =>
  coachOff.value || coachSeen.value.includes(id) ? null : SCREEN_TIPS[id];

export function dismissTip(id: string) { if (!coachSeen.value.includes(id)) coachSeen.value = [...coachSeen.value, id]; }
export function resetTips() { coachSeen.value = []; coachOff.value = false; }
