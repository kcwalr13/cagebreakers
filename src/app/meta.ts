/**
 * The scriptorium as the app keeps it: the profile, saved on the phone, and what the last
 * finished run earned. Every rule comes from src/core/meta.ts.
 */
import { computed, effect, signal } from '@preact/signals';
import type { ToolId } from '../content/balance';
import { ITEMS, type ItemId } from '../content/meta';
import { STATIONS, type StationId } from '../content/stations';
import { type Profile, type Reward, buy as buyItem, migrateProfile, recordRun, rewardFor, setSatchel, starCount, stationOpen } from '../core/meta';
import type { RunState } from '../core/run';
import { readJson, writeJson } from './storage';

const KEY = 'cagebreakers.meta';
const LAST_KEY = 'cagebreakers.meta.last';

export const profile = signal<Profile>(migrateProfile(readJson<unknown>(KEY)));
effect(() => writeJson(KEY, profile.value));

/** What the last finished run earned, and what it opened, for the run's summary. */
export interface Settled { id: string; reward: Reward; opened: StationId[]; forSale: ItemId[] }
export const lastSettled = signal<Settled | null>(readJson<Settled>(LAST_KEY));
effect(() => writeJson(LAST_KEY, lastSettled.value));

export const stars = computed(() => starCount(profile.value));

/** Counts a finished run into the scriptorium, once. */
export function settle(s: RunState, when: string) {
  const before = profile.peek();
  if (s.phase === 'arrange' || !s.id || before.counted.includes(s.id)) return;
  const reward = rewardFor(before, s);
  const after = recordRun(before, s, when);
  lastSettled.value = {
    id: s.id,
    reward,
    opened: STATIONS.filter((st) => !stationOpen(before, st) && stationOpen(after, st)).map((st) => st.id),
    forSale: ITEMS.filter((i) => i.after && !before.filled.includes(i.after) && after.filled.includes(i.after)).map((i) => i.id),
  };
  profile.value = after;
}

/** Buys something; returns why not, or null. */
export function buy(id: ItemId): string | null {
  const r = buyItem(profile.value, id);
  if (r.ok) profile.value = r.profile;
  return r.reason ?? null;
}

export function chooseSatchel(tools: readonly ToolId[]) {
  profile.value = setSatchel(profile.value, tools);
}

/** A short random id for a run, so its rewards are counted once. */
export function runId(): string {
  const ints = new Uint32Array(2);
  try { crypto.getRandomValues(ints); } catch { ints[0] = Math.floor(Math.random() * 2 ** 32); ints[1] = Date.now(); }
  return `${ints[0]!.toString(36)}${ints[1]!.toString(36)}`;
}
