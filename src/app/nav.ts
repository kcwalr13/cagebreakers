import { effect, signal } from '@preact/signals';
import type { ToolId } from '../content/balance';
import type { StationId } from '../content/stations';
import { readJson, writeJson } from './storage';

export type Screen = 'title' | 'toy' | 'run' | 'map' | 'shop' | 'library';

/** Every bottom sheet in the game. Only one is open at a time. */
export type Sheet =
  | { kind: 'menu' }
  | { kind: 'cage'; cage: number }
  | { kind: 'tool'; tool: ToolId }
  | { kind: 'station'; station: StationId }
  | { kind: 'book'; id: string }
  | { kind: 'round' }
  | { kind: 'confirm-new-run' }
  | { kind: 'transfer' }
  | null;

const NAV_KEY = 'cagebreakers.nav';
const fromUrl = new URLSearchParams(location.search).get('screen') as Screen | null;
const saved = readJson<{ screen?: Screen }>(NAV_KEY);
const SCREENS: readonly Screen[] = ['title', 'toy', 'run', 'map', 'shop', 'library'];
const valid = (s: unknown): s is Screen => SCREENS.includes(s as Screen);

export const screen = signal<Screen>(valid(fromUrl) ? fromUrl : valid(saved?.screen) ? saved!.screen! : 'title');
export const sheet = signal<Sheet>(null);
/** Set when a new version has downloaded and is waiting to take over. */
export const updateReady = signal<null | (() => void)>(null);

effect(() => { writeJson(NAV_KEY, { screen: screen.value }); });
effect(() => { void screen.value; sheet.value = null; });
