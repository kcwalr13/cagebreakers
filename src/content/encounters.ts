import type { UnitSpec } from '../core/clash';

export interface Encounter {
  id: string;
  title: string;
  /** The enemy's plan, shown on its scouting card. */
  enemyName: string;
  enemyPlan: string;
  playerSeed: string;
  enemySeed: string;
  /** The player's units, waiting on the bench. */
  roster: Omit<UnitSpec, 'cell'>[];
  enemy: UnitSpec[];
}

/**
 * M2's fixed fight. The player's page has two front-row sockets between stones (a Snail there
 * gets armor), an 8+ cage that a Boar Lancer and a Snail Mender seal together, and a 1− pair.
 * The Iron Warren seals three cages behind two Wardens, and its Coil Unmaker shatters every
 * sealed cage in the player's column 2. Lab, Oct 24: random layouts win about 55%, two or more
 * seals about 74%, and the best layouts found by search win with every unit standing.
 */
export const FIRST_BLOOD: Encounter = {
  id: 'first-blood',
  title: 'First Blood',
  enemyName: 'The Iron Warren',
  enemyPlan: 'Hare and Snail Wardens on Sum cages, a Coil Unmaker behind them',
  playerSeed: 'FRSTBD',
  enemySeed: 'WARREN',
  roster: [
    { uid: 'p-shellguard', species: 'shellguard', n: 1, stars: 1 },
    { uid: 'p-warren-guard', species: 'warren-guard', n: 3, stars: 1 },
    { uid: 'p-tusk-ram', species: 'tusk-ram', n: 4, stars: 1 },
    { uid: 'p-moss-tender', species: 'moss-tender', n: 2, stars: 1 },
    { uid: 'p-boar-smasher', species: 'boar-smasher', n: 6, stars: 1 },
    { uid: 'p-stag-reaper', species: 'stag-reaper', n: 5, stars: 1 },
    { uid: 'p-hare-fletcher', species: 'hare-fletcher', n: 5, stars: 1 },
    { uid: 'p-owl-archivist', species: 'owl-archivist', n: 4, stars: 1 },
  ],
  enemy: [
    { uid: 'e-warren-guard', species: 'warren-guard', n: 1, stars: 1, cell: 3 },
    { uid: 'e-shellguard', species: 'shellguard', n: 4, stars: 2, cell: 4 },
    { uid: 'e-fang-lancer', species: 'fang-lancer', n: 3, stars: 1, cell: 1 },
    { uid: 'e-owl-scrivener', species: 'owl-scrivener', n: 3, stars: 1, cell: 10 },
    { uid: 'e-hare-fletcher', species: 'hare-fletcher', n: 2, stars: 1, cell: 16 },
    { uid: 'e-coil-unmaker', species: 'coil-unmaker', n: 6, stars: 1, cell: 8 },
  ],
};
