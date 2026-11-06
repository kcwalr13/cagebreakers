/** Which of the garden's games the title shows: the number garden or Night Watch. */
import { effect, signal } from '@preact/signals';
import { readJson, writeJson } from './storage';

export type Mode = 'garden' | 'watch';
const KEY = 'cagebreakers.mode';
const saved = readJson<{ mode?: Mode }>(KEY)?.mode;
export const mode = signal<Mode>(saved === 'watch' ? 'watch' : 'garden');
effect(() => writeJson(KEY, { mode: mode.value }));
