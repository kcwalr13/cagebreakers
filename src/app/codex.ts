/**
 * The Codex fills in as you meet things: species in your shop or across the page from you,
 * items offered to you, seals you make, Keepers you face. Kept on the phone across runs.
 */
import { effect, signal } from '@preact/signals';
import type { Op } from '../core/page';
import { runPage, sealedNow } from '../core/run';
import { lastFight, run, scouted } from './run/state';
import { readJson, writeJson } from './storage';

export interface CodexState { species: string[]; items: string[]; seals: Op[]; keepers: string[] }

const KEY = 'cagebreakers.codex';
const saved = readJson<Partial<CodexState>>(KEY);
export const codex = signal<CodexState>({
  species: saved?.species ?? [], items: saved?.items ?? [], seals: saved?.seals ?? [], keepers: saved?.keepers ?? [],
});

/** Adds whatever is new, saving only when something was. */
export function meet(part: Partial<CodexState>) {
  const cur = codex.peek();
  let changed = false;
  const next = { ...cur };
  for (const k of ['species', 'items', 'seals', 'keepers'] as const) {
    const add = (part[k] ?? []).filter((x) => !(cur[k] as string[]).includes(x));
    if (add.length) { (next[k] as string[]) = [...cur[k], ...add]; changed = true; }
  }
  if (changed) { codex.value = next; writeJson(KEY, next); }
}

/** Watches the run for anything worth writing down. */
export function watchRunForCodex() {
  effect(() => {
    const s = run.value;
    if (!s) return;
    const page = runPage(s);
    meet({
      species: [...s.offers.map((o) => o.species), ...s.units.map((u) => u.species)],
      items: [...(s.pick ?? []), ...s.satchel, ...s.units.flatMap((u) => (u.relic ? [u.relic] : []))],
      seals: [...sealedNow(s)].map((id) => page.cages[id]!.op),
    });
  });
  effect(() => {
    const o = scouted.value;
    if (o) meet({ species: o.units.map((u) => u.species), keepers: o.keeper ? [o.keeper.id] : [] });
  });
  effect(() => {
    const f = lastFight.value;
    if (f) meet({ species: f.opponent.units.map((u) => u.species) });
  });
}
