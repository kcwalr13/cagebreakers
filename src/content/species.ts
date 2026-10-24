import type { Species } from './types';

/**
 * The starter roster: two species per Calling, every Kin represented. The full launch roster
 * of 30, including the Misprints, arrives in M4.
 */
export const SPECIES: readonly Species[] = [
  {
    id: 'shellguard', name: 'Shellguard', kin: 'snail', calling: 'warden', tier: 1,
    hp: 760, attack: 30, interval: 11, mana: 70,
    ability: { kind: 'fortify', reduction: 0.7, beats: 20 },
    text: 'Withdraws into its shell, taking 70% less damage for 2 seconds.',
  },
  {
    id: 'hare-fletcher', name: 'Hare Fletcher', kin: 'hare', calling: 'marksman', tier: 1,
    hp: 400, attack: 48, interval: 11, mana: 80,
    ability: { kind: 'volley', columns: 'adjacent', mult: 1.5, target: 'back' },
    text: 'Looses an arrow at the back-most enemy in each neighboring column.',
  },
  {
    id: 'stag-reaper', name: 'Stag Reaper', kin: 'stag', calling: 'sweeper', tier: 1,
    hp: 540, attack: 36, interval: 11, mana: 90,
    ability: { kind: 'row-strike', mult: 1.1 },
    text: "Reaps its target's whole row.",
  },
  {
    id: 'fang-lancer', name: 'Fang Lancer', kin: 'serpent', calling: 'lancer', tier: 1,
    hp: 480, attack: 40, interval: 10, mana: 80,
    ability: { kind: 'venom', mult: 2, beats: 30 },
    text: 'Poisons its target and the unit behind it for double damage over 3 seconds.',
  },
  {
    id: 'owl-scrivener', name: 'Owl Scrivener', kin: 'owl', calling: 'sweeper', tier: 1,
    hp: 500, attack: 34, interval: 10, mana: 70,
    ability: { kind: 'splash-strike', mult: 1.4 },
    text: 'Sprays ink over its target and both of its neighbors.',
  },
  {
    id: 'boar-smasher', name: 'Boar Smasher', kin: 'boar', calling: 'breaker', tier: 1,
    hp: 560, attack: 44, interval: 12, mana: 80,
    ability: { kind: 'crash', mult: 2 },
    text: 'Crashes into its target for double damage. A sealed cage it hits shatters.',
  },
  {
    id: 'tusk-ram', name: 'Tusk Ram', kin: 'boar', calling: 'lancer', tier: 2,
    hp: 650, attack: 50, interval: 12, mana: 90,
    ability: { kind: 'column-strike', mult: 1.2 },
    text: 'Charges down the enemy column, hitting every unit in it.',
  },
  {
    id: 'warren-guard', name: 'Warren Guard', kin: 'hare', calling: 'warden', tier: 2,
    hp: 900, attack: 36, interval: 11, mana: 80,
    ability: { kind: 'stun', beats: 15, mult: 1 },
    text: 'Thumps the enemy it faces, stunning it for 1.5 seconds.',
  },
  {
    id: 'moss-tender', name: 'Moss Tender', kin: 'snail', calling: 'mender', tier: 2,
    hp: 560, attack: 28, interval: 10, mana: 70,
    ability: { kind: 'shield-column', fraction: 0.2 },
    text: 'Shields every ally in its column for 20% of their max HP.',
  },
  {
    id: 'antler-archer', name: 'Antler Archer', kin: 'stag', calling: 'marksman', tier: 2,
    hp: 480, attack: 60, interval: 12, mana: 80,
    ability: { kind: 'snipe', mult: 2.5 },
    text: 'Pins the back-most enemy in its column for 2.5× damage.',
  },
  {
    id: 'owl-archivist', name: 'Owl Archivist', kin: 'owl', calling: 'mender', tier: 3,
    hp: 700, attack: 36, interval: 10, mana: 90,
    ability: { kind: 'reseal', fallbackHeal: 0.3 },
    text: 'Reseals the most recently shattered allied cage, once per clash. Otherwise heals the most injured ally.',
  },
  {
    id: 'coil-unmaker', name: 'Coil Unmaker', kin: 'serpent', calling: 'breaker', tier: 4,
    hp: 1000, attack: 80, interval: 11, mana: 100,
    ability: { kind: 'unmake', mult: 1 },
    text: 'Shatters every sealed enemy cage in its column and strikes their members.',
  },
];

export const SPECIES_BY_ID: ReadonlyMap<string, Species> = new Map(SPECIES.map((s) => [s.id, s]));

export function speciesById(id: string): Species {
  const s = SPECIES_BY_ID.get(id);
  if (!s) throw new Error(`unknown species ${id}`);
  return s;
}
