import type { Species } from './types';

/**
 * The launch roster: 30 species across five cost tiers (8 / 7 / 7 / 5 / 3). Each Kin has four
 * or five species and each Calling five, so every bonus threshold can be reached. Tier 5 is the
 * three Misprints, which have a Calling but no Kin and each bend one puzzle rule.
 */
export const SPECIES: readonly Species[] = [
  // ---- Tier 1 -------------------------------------------------------------------------------
  {
    id: 'shellguard', name: 'Shellguard', kin: 'snail', calling: 'warden', tier: 1,
    hp: 760, attack: 30, interval: 11, mana: 70,
    ability: { kind: 'fortify', reduction: 0.7, beats: 20 },
    text: 'Withdraws into its shell, taking 70% less damage for 2 seconds.',
  },
  {
    id: 'hart-sentinel', name: 'Hart Sentinel', kin: 'stag', calling: 'warden', tier: 1,
    hp: 800, attack: 28, interval: 11, mana: 80,
    ability: { kind: 'guard', fraction: 0.2 },
    text: 'Lowers its antlers, shielding itself and every ally beside it for 20% of its max HP.',
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
    id: 'owl-scrivener', name: 'Owl Scrivener', kin: 'owl', calling: 'sweeper', tier: 1,
    hp: 500, attack: 34, interval: 10, mana: 70,
    ability: { kind: 'splash-strike', mult: 1.4 },
    text: 'Sprays ink over its target and both of its neighbors.',
  },
  {
    id: 'fang-lancer', name: 'Fang Lancer', kin: 'serpent', calling: 'lancer', tier: 1,
    hp: 480, attack: 40, interval: 10, mana: 80,
    ability: { kind: 'venom', mult: 2, beats: 30, spread: 'behind' },
    text: 'Poisons its target and the unit behind it for double damage over 3 seconds.',
  },
  {
    id: 'boar-smasher', name: 'Boar Smasher', kin: 'boar', calling: 'breaker', tier: 1,
    hp: 560, attack: 44, interval: 12, mana: 80,
    ability: { kind: 'crash', mult: 2 },
    text: 'Crashes into its target for double damage. A sealed cage it hits shatters.',
  },
  {
    id: 'burrow-nurse', name: 'Burrow Nurse', kin: 'hare', calling: 'mender', tier: 1,
    hp: 480, attack: 24, interval: 10, mana: 70,
    ability: { kind: 'heal-row', fraction: 0.15 },
    text: 'Tends its row, healing every ally in it for 15% of their max HP.',
  },

  // ---- Tier 2 -------------------------------------------------------------------------------
  {
    id: 'warren-guard', name: 'Warren Guard', kin: 'hare', calling: 'warden', tier: 2,
    hp: 900, attack: 36, interval: 11, mana: 80,
    ability: { kind: 'stun', beats: 15, mult: 1 },
    text: 'Thumps the enemy it faces, stunning it for 1.5 seconds.',
  },
  {
    id: 'tusk-ram', name: 'Tusk Ram', kin: 'boar', calling: 'lancer', tier: 2,
    hp: 650, attack: 50, interval: 12, mana: 90,
    ability: { kind: 'column-strike', mult: 1.2 },
    text: 'Charges down the enemy column, hitting every unit in it.',
  },
  {
    id: 'quill-lancer', name: 'Quill Lancer', kin: 'owl', calling: 'lancer', tier: 2,
    hp: 620, attack: 46, interval: 11, mana: 80,
    ability: { kind: 'gore', mult: 1.8 },
    text: 'Runs its quill through its target and the unit behind it for 1.8× damage.',
  },
  {
    id: 'adder-whip', name: 'Adder Whip', kin: 'serpent', calling: 'sweeper', tier: 2,
    hp: 560, attack: 40, interval: 10, mana: 80,
    ability: { kind: 'venom', mult: 1.5, beats: 30, spread: 'beside' },
    text: 'Lashes its target and both of its neighbors with venom: 1.5× damage over 3 seconds.',
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
    id: 'tine-breaker', name: 'Tine Breaker', kin: 'stag', calling: 'breaker', tier: 2,
    hp: 680, attack: 50, interval: 12, mana: 90,
    ability: { kind: 'cage-strike', mult: 0.9 },
    text: "Bellows at its target's cage: the cage shatters if sealed, and every unit in it is struck.",
  },

  // ---- Tier 3 -------------------------------------------------------------------------------
  {
    id: 'bristleback', name: 'Bristleback', kin: 'boar', calling: 'warden', tier: 3,
    hp: 1250, attack: 40, interval: 11, mana: 80,
    ability: { kind: 'bristle', reflect: 0.5, beats: 40 },
    text: 'Raises its bristles: for 4 seconds, anyone who hits it takes half the damage back.',
  },
  {
    id: 'royal-hart', name: 'Royal Hart', kin: 'stag', calling: 'lancer', tier: 3,
    hp: 860, attack: 54, interval: 11, mana: 90,
    ability: { kind: 'rally-cross', damage: 0.3, beats: 40 },
    text: 'Raises the standard: every ally in its row and column hits 30% harder for 4 seconds.',
  },
  {
    id: 'hare-harrier', name: 'Hare Harrier', kin: 'hare', calling: 'sweeper', tier: 3,
    hp: 760, attack: 48, interval: 10, mana: 80,
    ability: { kind: 'frenzy', speed: 0.6, beats: 40 },
    text: 'Works itself into a frenzy, attacking 60% faster for 4 seconds.',
  },
  {
    id: 'shell-mortar', name: 'Shell Mortar', kin: 'snail', calling: 'marksman', tier: 3,
    hp: 640, attack: 62, interval: 12, mana: 80,
    ability: { kind: 'mortar', mult: 1.4 },
    text: 'Lobs a shell at the back-most enemy in its column; it bursts onto both its neighbors.',
  },
  {
    id: 'owl-censor', name: 'Owl Censor', kin: 'owl', calling: 'breaker', tier: 3,
    hp: 820, attack: 56, interval: 11, mana: 90,
    ability: { kind: 'censor', mult: 1, beats: 15 },
    text: 'Strikes out the enemy seal with the most units standing: the cage shatters and they are stunned for 1.5 seconds.',
  },
  {
    id: 'owl-archivist', name: 'Owl Archivist', kin: 'owl', calling: 'mender', tier: 3,
    hp: 700, attack: 36, interval: 10, mana: 90,
    ability: { kind: 'reseal', fallbackHeal: 0.3 },
    text: 'Reseals the most recently shattered allied cage, once per clash. Otherwise heals the most injured ally.',
  },
  {
    id: 'asp-apothecary', name: 'Asp Apothecary', kin: 'serpent', calling: 'mender', tier: 3,
    hp: 760, attack: 32, interval: 10, mana: 80,
    ability: { kind: 'heal-column', fraction: 0.25 },
    text: 'Heals every ally in its column for 25% of their max HP.',
  },

  // ---- Tier 4 -------------------------------------------------------------------------------
  {
    id: 'spiral-tyrant', name: 'Spiral Tyrant', kin: 'snail', calling: 'sweeper', tier: 4,
    hp: 1300, attack: 62, interval: 11, mana: 90,
    ability: { kind: 'rows-strike', mult: 1.2, depth: 2 },
    text: "Rolls through two rows: hits every enemy in its target's row and the row behind it.",
  },
  {
    id: 'moon-hare', name: 'Moon Hare', kin: 'hare', calling: 'breaker', tier: 4,
    hp: 1000, attack: 74, interval: 10, mana: 100,
    ability: { kind: 'front-line', mult: 1, shatter: true },
    text: 'Drums the ground: hits the front-most enemy in every column, and sealed cages it hits shatter.',
  },
  {
    id: 'siege-boar', name: 'Siege Boar', kin: 'boar', calling: 'marksman', tier: 4,
    hp: 900, attack: 84, interval: 12, mana: 90,
    ability: { kind: 'volley', columns: 'own-and-adjacent', mult: 1.6, target: 'back' },
    text: 'Lobs stones at the back-most enemy in its column and both neighboring columns.',
  },
  {
    id: 'night-hunter', name: 'Night Hunter', kin: 'owl', calling: 'marksman', tier: 4,
    hp: 860, attack: 86, interval: 12, mana: 80,
    ability: { kind: 'mark', mult: 2, vulnerable: 0.3, beats: 40 },
    text: 'Marks the back-most enemy in its column with a 2× shot; it takes 30% more damage for 4 seconds.',
  },
  {
    id: 'coil-unmaker', name: 'Coil Unmaker', kin: 'serpent', calling: 'breaker', tier: 4,
    hp: 1000, attack: 80, interval: 11, mana: 100,
    ability: { kind: 'unmake', mult: 1 },
    text: 'Shatters every sealed enemy cage in its column and strikes their members.',
  },

  // ---- Tier 5: the Misprints -----------------------------------------------------------------
  {
    id: 'blank', name: 'The Blank', kin: null, calling: 'mender', tier: 5, misprint: 'blank',
    hp: 1150, attack: 40, interval: 10, mana: 90,
    ability: { kind: 'heal-all', fraction: 0.2 },
    text: 'Has no number: it counts as whatever completes its cage. Its ability heals every ally for 20% of their max HP.',
  },
  {
    id: 'smudge', name: 'The Smudge', kin: null, calling: 'warden', tier: 5, misprint: 'smudge',
    hp: 2400, attack: 50, interval: 12, mana: 100,
    ability: { kind: 'stun-row', beats: 15, mult: 1 },
    text: "Ignores the Latin rule, but no cage it stands in can seal. Its ability strikes and stuns every enemy in its target's row for 1.5 seconds.",
  },
  {
    id: 'domino', name: 'The Domino', kin: null, calling: 'lancer', tier: 5, misprint: 'domino',
    hp: 1500, attack: 70, interval: 11, mana: 90,
    ability: { kind: 'topple', mult: 1.4 },
    text: 'Fills two cells, a number on each half, with one body. Its ability strikes every enemy in each column it covers.',
  },
];

export const SPECIES_BY_ID: ReadonlyMap<string, Species> = new Map(SPECIES.map((s) => [s.id, s]));

export function speciesById(id: string): Species {
  const s = SPECIES_BY_ID.get(id);
  if (!s) throw new Error(`unknown species ${id}`);
  return s;
}
