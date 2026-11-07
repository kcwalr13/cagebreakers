/** Which of Plot Twist's games the title shows: the Number Garden, Dewfall or Garden Siege. */
import { effect, signal } from '@preact/signals';
import { readJson, writeJson } from './storage';

export type Mode = 'garden' | 'dewfall' | 'siege';
const KEY = 'cagebreakers.mode';
const saved = readJson<{ mode?: string }>(KEY)?.mode;
// Night Watch, the game before Dewfall, went by 'watch'.
export const mode = signal<Mode>(saved === 'siege' ? 'siege' : saved === 'dewfall' || saved === 'watch' ? 'dewfall' : 'garden');
effect(() => writeJson(KEY, { mode: mode.value }));
