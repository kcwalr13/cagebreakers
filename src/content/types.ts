/**
 * Content is data. Balance numbers live here, never in the simulator. The bot lab tunes these
 * values against the targets in the design doc.
 */
export type KinId = 'snail' | 'hare' | 'boar' | 'owl' | 'serpent' | 'stag';
export type CallingId = 'warden' | 'lancer' | 'sweeper' | 'marksman' | 'mender' | 'breaker';

/** The three Misprints bend a puzzle rule each. */
export type MisprintId = 'blank' | 'smudge' | 'domino';

/** What an ability does when a unit's mana fills. Each kind is resolved by the simulator. */
export type Ability =
  | { kind: 'fortify'; reduction: number; beats: number }
  | { kind: 'volley'; columns: 'adjacent' | 'own-and-adjacent'; mult: number; target: 'front' | 'back' }
  | { kind: 'column-strike'; mult: number }
  | { kind: 'row-strike'; mult: number }
  | { kind: 'rows-strike'; mult: number; depth: number }
  | { kind: 'front-line'; mult: number; shatter: boolean }
  | { kind: 'splash-strike'; mult: number }
  | { kind: 'snipe'; mult: number }
  | { kind: 'mortar'; mult: number }
  | { kind: 'mark'; mult: number; vulnerable: number; beats: number }
  | { kind: 'gore'; mult: number }
  | { kind: 'venom'; mult: number; beats: number; spread: 'behind' | 'beside' }
  | { kind: 'heal-row'; fraction: number }
  | { kind: 'heal-column'; fraction: number }
  | { kind: 'heal-all'; fraction: number }
  | { kind: 'shield-column'; fraction: number }
  | { kind: 'guard'; fraction: number }
  | { kind: 'reseal'; fallbackHeal: number }
  | { kind: 'crash'; mult: number }
  | { kind: 'cage-strike'; mult: number }
  | { kind: 'censor'; mult: number; beats: number }
  | { kind: 'unmake'; mult: number }
  | { kind: 'stun'; beats: number; mult: number }
  | { kind: 'stun-row'; beats: number; mult: number }
  | { kind: 'frenzy'; speed: number; beats: number }
  | { kind: 'bristle'; reflect: number; beats: number }
  | { kind: 'rally-cross'; damage: number; beats: number }
  | { kind: 'topple'; mult: number };

export interface Species {
  id: string;
  name: string;
  /** Misprints have no Kin. */
  kin: KinId | null;
  calling: CallingId;
  /** Shop cost in gold, 1–5. */
  tier: 1 | 2 | 3 | 4 | 5;
  misprint?: MisprintId;
  /** Base stats for a one-star unit with a middling number (heft 1.0). */
  hp: number;
  /** Damage per hit. */
  attack: number;
  /** Beats between attacks; ten beats make a second. */
  interval: number;
  /** Mana needed to cast. */
  mana: number;
  ability: Ability;
  /** One line for the unit card, in the player's terms. */
  text: string;
}

export interface Kin {
  id: KinId;
  name: string;
  /** The page feature this Kin cares about. */
  feature: string;
  thresholds: readonly [number, number, number];
  /** Bonus values at each threshold; meaning depends on the Kin (see the simulator). */
  values: readonly [number, number, number];
  text: string;
}

export interface Calling {
  id: CallingId;
  name: string;
  /** Plural, for trait chips: Wardens, Marksmen. */
  plural: string;
  thresholds: readonly [number, number];
  values: readonly [number, number];
  behavior: string;
  text: string;
}

export type ToolId = 'chisel' | 'flip' | 'eraser' | 'inkpot' | 'lens';
export type RelicId = 'blade' | 'bulwark' | 'quill' | 'hourglass' | 'thorn';
export type ItemId = ToolId | RelicId;

export interface Item {
  id: ItemId;
  family: 'tool' | 'relic';
  name: string;
  text: string;
}
