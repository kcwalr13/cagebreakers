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

/** What every back arrow does: an open sheet closes first; otherwise any screen returns to the title. */
export function goBack() {
  if (sheet.value) { sheet.value = null; return; }
  if (screen.value !== 'title') screen.value = 'title';
}

/*
 * Android's back gesture (and a browser's back button) acts like the back arrow. While the game is
 * anywhere but the bare title screen, one extra history entry sits on top: going back uses it up,
 * and the game steps back its own way. Back at the title with nothing open, that entry is removed,
 * so the next back leaves the app as usual.
 */
let guarded = false;
let consuming = false;
function syncHistory() {
  const away = screen.value !== 'title' || sheet.value !== null;
  if (away && !guarded) { history.pushState({ cagebreakers: 'back' }, ''); guarded = true; }
  else if (!away && guarded) { guarded = false; consuming = true; history.back(); }
}
effect(() => { void screen.value; void sheet.value; syncHistory(); });
addEventListener('popstate', () => {
  if (consuming) { consuming = false; return; }
  guarded = false;
  goBack();
  // Still away from the title (say, a sheet closed): put the entry back for the next back.
  syncHistory();
});
