/**
 * The scriptorium as the app keeps it: the profile, saved on the phone, and what the last
 * finished run earned. Every rule comes from src/core/meta.ts.
 */
import { computed, effect, signal } from '@preact/signals';
import type { ToolId } from '../content/balance';
import type { HomeItemId, PlantId } from '../content/home';
import type { GoalId } from '../content/journal';
import { ITEMS, type ItemId } from '../content/meta';
import { REGIONS, type RegionId, STATIONS, type StationId } from '../content/stations';
import {
  type Profile, type Reward, buy as buyItem, buyAndLay, buyHome, claimGoal, goalsReady, isFound, layHome, migrateProfile, moveHome, openPath as openPathRule,
  pickUpHome, plantHome, reachable, recordRun, regionOpen, rewardFor, setSatchel, starCount,
} from '../core/meta';
import type { RunState } from '../core/run';
import { readJson, writeJson } from './storage';

const KEY = 'cagebreakers.meta';
const LAST_KEY = 'cagebreakers.meta.last';

export const profile = signal<Profile>(migrateProfile(readJson<unknown>(KEY)));
effect(() => writeJson(KEY, profile.value));

/** What the last finished run earned, and what it opened, for the run's summary. */
export interface Settled {
  id: string;
  reward: Reward;
  /** Gardens whose path can now be bought (or that opened free). */
  opened: StationId[];
  /** Hidden gardens it found. */
  found?: StationId[];
  /** Regions it opened. */
  regions?: RegionId[];
  forSale: ItemId[];
  /** Goals it finished, waiting in the journal. */
  goals?: GoalId[];
}
export const lastSettled = signal<Settled | null>(readJson<Settled>(LAST_KEY));
effect(() => writeJson(LAST_KEY, lastSettled.value));

export const stars = computed(() => starCount(profile.value));
/** Goals finished and not yet claimed: the journal's badge. */
export const ready = computed(() => goalsReady(profile.value).length);

/** Counts a finished run into the scriptorium, once. */
export function settle(s: RunState, when: string) {
  const before = profile.peek();
  if (s.phase === 'arrange' || !s.id || before.counted.includes(s.id)) return;
  const reward = rewardFor(before, s);
  const after = recordRun(before, s, when);
  const readyBefore = new Set(goalsReady(before).map((g) => g.id));
  lastSettled.value = {
    id: s.id,
    reward,
    opened: STATIONS.filter((st) => !reachable(before, st) && reachable(after, st)).map((st) => st.id),
    found: STATIONS.filter((st) => st.reveal && !isFound(before, st) && isFound(after, st)).map((st) => st.id),
    regions: REGIONS.filter((r) => !regionOpen(before, r) && regionOpen(after, r)).map((r) => r.id),
    forSale: ITEMS.filter((i) => i.after && !before.filled.includes(i.after) && after.filled.includes(i.after)).map((i) => i.id),
    goals: goalsReady(after).filter((g) => !readyBefore.has(g.id)).map((g) => g.id),
  };
  profile.value = after;
}

/** Applies a profile rule; returns why it was refused, or null. */
function apply(r: { profile: Profile; ok: boolean; reason?: string }): string | null {
  if (r.ok) profile.value = r.profile;
  return r.ok ? null : r.reason ?? 'That can\'t be done';
}

/** Buys something; returns why not, or null. */
export const buy = (id: ItemId) => apply(buyItem(profile.value, id));
export const openPath = (id: StationId) => apply(openPathRule(profile.value, id));
export const claim = (id: GoalId) => apply(claimGoal(profile.value, id));
export const buyForHome = (id: HomeItemId) => apply(buyHome(profile.value, id));
export const buyAndLayHome = (at: number, id: HomeItemId) => apply(buyAndLay(profile.value, at, id));
export const layInHome = (at: number, id: HomeItemId) => apply(layHome(profile.value, at, id));
export const plantInHome = (at: number, species: PlantId) => apply(plantHome(profile.value, at, species));
export const moveInHome = (from: number, to: number) => apply(moveHome(profile.value, from, to));
export const pickUpInHome = (at: number) => apply(pickUpHome(profile.value, at));

export function chooseSatchel(tools: readonly ToolId[]) {
  profile.value = setSatchel(profile.value, tools);
}

/** A short random id for a run, so its rewards are counted once. */
export function runId(): string {
  const ints = new Uint32Array(2);
  try { crypto.getRandomValues(ints); } catch { ints[0] = Math.floor(Math.random() * 2 ** 32); ints[1] = Date.now(); }
  return `${ints[0]!.toString(36)}${ints[1]!.toString(36)}`;
}
