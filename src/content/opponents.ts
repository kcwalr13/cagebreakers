import type { CallingId, KinId } from './types';

/** A named plan an opponent follows, shown on its scouting card. */
export interface Archetype {
  id: string;
  name: string;
  plan: string;
  kins: readonly KinId[];
  callings: readonly CallingId[];
}

export const ARCHETYPES: readonly Archetype[] = [
  { id: 'iron-warren', name: 'The Iron Warren', plan: 'Hare Wardens on Sum cages', kins: ['hare'], callings: ['warden'] },
  { id: 'glass-arrows', name: 'The Glass Arrows', plan: 'Marksmen behind thin cover', kins: ['stag', 'hare'], callings: ['marksman'] },
  { id: 'unmakers', name: 'The Unmakers', plan: 'Breakers aimed at your seals', kins: ['serpent', 'boar'], callings: ['breaker'] },
  { id: 'mossbound', name: 'The Mossbound', plan: 'Snails beside stones, shielded by Menders', kins: ['snail'], callings: ['mender', 'warden'] },
  { id: 'tusk-line', name: 'The Tusk Line', plan: 'Boars stacked down their columns', kins: ['boar'], callings: ['lancer'] },
  { id: 'quiet-library', name: 'The Quiet Library', plan: 'Owls that keep their seals whole', kins: ['owl'], callings: ['mender', 'sweeper'] },
  { id: 'coiled-court', name: 'The Coiled Court', plan: 'Lone Serpents that dodge', kins: ['serpent'], callings: ['lancer', 'breaker'] },
  { id: 'antler-choir', name: 'The Antler Choir', plan: 'Stags filling whole lines', kins: ['stag'], callings: ['sweeper', 'marksman'] },
];

export type KeeperId = 'proofreader' | 'mirror-scribe' | 'binder';

export interface Keeper {
  id: KeeperId;
  clash: number;
  name: string;
  twist: string;
}

export const KEEPERS: readonly Keeper[] = [
  { id: 'proofreader', clash: 5, name: 'The Proofreader', twist: "Your units in cages that didn't seal fight at reduced strength." },
  { id: 'mirror-scribe', clash: 10, name: 'The Mirror Scribe', twist: 'Fights with a copy of the army you fielded last clash, slightly stronger. Grow past it.' },
  { id: 'binder', clash: 15, name: 'The Binder', twist: 'Its cages cannot shatter.' },
];

/** Keeper twists as numbers for the simulator. */
export const KEEPER_RULES = {
  proofreaderPenalty: 0.15,
  mirrorBuff: 0.05,
} as const;
