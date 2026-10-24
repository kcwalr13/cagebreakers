import type { Calling, CallingId, Kin, KinId } from './types';

/** Each Kin keys off a different feature of the page, so traits pull layout as hard as cages do. */
export const KINS: Record<KinId, Kin> = {
  snail: {
    id: 'snail', name: 'Snails', feature: 'Stones',
    thresholds: [2, 4, 6], values: [0.15, 0.3, 0.5],
    text: 'Snails next to a stone take {v}% less damage.',
  },
  hare: {
    id: 'hare', name: 'Hares', feature: 'Rows',
    thresholds: [2, 4, 6], values: [0.08, 0.14, 0.22],
    text: 'Hares attack {v}% faster for each other Hare in their row.',
  },
  boar: {
    id: 'boar', name: 'Boars', feature: 'Columns',
    thresholds: [2, 4, 6], values: [0.15, 0.25, 0.4],
    text: 'Boars hit {v}% harder for each Boar behind them in their column.',
  },
  owl: {
    id: 'owl', name: 'Owls', feature: 'Seals',
    thresholds: [2, 4, 6], values: [1.5, 2, 3],
    text: "Owls' seal bonuses are multiplied by {v}.",
  },
  serpent: {
    id: 'serpent', name: 'Serpents', feature: 'Empty space',
    thresholds: [2, 4, 6], values: [3, 3, 2],
    text: 'Serpents with no ally beside them evade every {v}th hit; from 4 Serpents they also hit 25% harder.',
  },
  stag: {
    id: 'stag', name: 'Stags', feature: 'Full lines',
    thresholds: [2, 4, 6], values: [0.2, 0.4, 0.7],
    text: 'Stags in a completely filled row or column hit {v}% harder.',
  },
};

/** Serpent damage bonus at each threshold (the second number in their bonus). */
export const SERPENT_DAMAGE = [0, 0.25, 0.25] as const;

export const CALLINGS: Record<CallingId, Calling> = {
  warden: {
    id: 'warden', name: 'Warden', plural: 'Wardens', thresholds: [2, 4], values: [0.2, 0.45],
    behavior: 'Front-liner with the most HP.',
    text: 'Wardens start each clash with a shield of {v}% of their max HP.',
  },
  lancer: {
    id: 'lancer', name: 'Lancer', plural: 'Lancers', thresholds: [2, 4], values: [0.75, 1.1],
    behavior: 'Attacks pierce to the unit behind the target for half damage.',
    text: 'Pierce damage rises to {v}%.',
  },
  sweeper: {
    id: 'sweeper', name: 'Sweeper', plural: 'Sweepers', thresholds: [2, 4], values: [0.6, 0.9],
    behavior: "Attacks splash onto the target's left and right neighbors for 40% damage.",
    text: 'Splash damage rises to {v}%.',
  },
  marksman: {
    id: 'marksman', name: 'Marksman', plural: 'Marksmen', thresholds: [2, 4], values: [0.2, 0.45],
    behavior: 'Shoots the back-most enemy in its column.',
    text: 'Marksmen hit {v}% harder.',
  },
  mender: {
    id: 'mender', name: 'Mender', plural: 'Menders', thresholds: [2, 4], values: [0.01, 0.025],
    behavior: 'Weak attacks; its ability heals or protects.',
    text: 'All allies regenerate {v}% of their max HP each second.',
  },
  breaker: {
    id: 'breaker', name: 'Breaker', plural: 'Breakers', thresholds: [2, 4], values: [1, 2],
    behavior: 'Hits 50% harder against units in sealed cages.',
    text: "With 2 Breakers, your first Breaker hit on a sealed cage shatters it. With 4, every Breaker's first hit on each sealed cage does.",
  },
};

/** Calling behaviours that apply below any threshold. */
export const CALLING_BASE = {
  pierce: 0.5,
  splash: 0.4,
  breakerBonus: 0.5,
} as const;
