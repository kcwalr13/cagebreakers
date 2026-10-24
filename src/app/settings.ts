/**
 * Player settings, saved on the phone. The cabin defaults: silent, gentle haptics, motion as the
 * phone prefers, controls for the right thumb.
 */
import { computed, effect, signal } from '@preact/signals';
import { readJson, writeJson } from './storage';

export type MotionChoice = 'system' | 'reduced' | 'full';
export type HandChoice = 'right' | 'left';

export interface Settings {
  sound: boolean;
  haptics: boolean;
  motion: MotionChoice;
  hand: HandChoice;
}

const KEY = 'cagebreakers.settings';
const DEFAULTS: Settings = { sound: false, haptics: true, motion: 'system', hand: 'right' };

export const settings = signal<Settings>({ ...DEFAULTS, ...readJson<Partial<Settings>>(KEY) });
effect(() => writeJson(KEY, settings.value));

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings.value = { ...settings.value, [key]: value };
}

const prefersReduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const systemReduced = signal(!!prefersReduced?.matches);
prefersReduced?.addEventListener?.('change', () => (systemReduced.value = prefersReduced.matches));

export const reducedMotion = computed(() => settings.value.motion === 'reduced' || (settings.value.motion === 'system' && systemReduced.value));

/** Reflects motion and handedness on the page root, where the stylesheet reads them. */
export function applySettingsToDocument() {
  effect(() => {
    const root = document.documentElement;
    root.dataset.motion = reducedMotion.value ? 'reduced' : 'full';
    root.dataset.hand = settings.value.hand;
  });
}

/** A short vibration, when the phone supports it and the player wants it. */
export function buzz(pattern: number | number[]) {
  if (!settings.value.haptics) return;
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}
