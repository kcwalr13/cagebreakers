import { effect, signal } from '@preact/signals';
import { readJson, writeJson } from './storage';

export type Screen = 'title' | 'toy' | 'fight';

/** Every bottom sheet in the game. Only one is open at a time. */
export type Sheet =
  | { kind: 'menu' }
  | { kind: 'cage'; cage: number }
  | { kind: 'unit'; uid: string; side: 'player' | 'enemy' }
  | { kind: 'enemy' }
  | { kind: 'trait'; id: string; side: 'player' | 'enemy' }
  | { kind: 'result' }
  | null;

const NAV_KEY = 'cagebreakers.nav';
const fromUrl = new URLSearchParams(location.search).get('screen') as Screen | null;
const saved = readJson<{ screen?: Screen }>(NAV_KEY);
const valid = (s: unknown): s is Screen => s === 'title' || s === 'toy' || s === 'fight';

export const screen = signal<Screen>(valid(fromUrl) ? fromUrl : valid(saved?.screen) ? saved!.screen! : 'title');
export const sheet = signal<Sheet>(null);

effect(() => { writeJson(NAV_KEY, { screen: screen.value }); });
effect(() => { void screen.value; sheet.value = null; });
