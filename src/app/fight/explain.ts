import { speciesById } from '../../content/species';
import { type ClashResult, ENEMY, PLAYER, type Team } from '../../core/clash';
import type { Page } from '../../core/page';

export interface Explanation {
  verdict: 'Victory' | 'Defeat' | 'Draw';
  headline: string;
  lines: string[];
  bars: { uid: string; team: Team; name: string; dealt: number }[];
}

const secs = (t: number) => `${(t / 10).toFixed(1)} s`;

/**
 * Turns a clash's event log into the few sentences that explain it: what sealed, what broke
 * and who broke it, who did the damage, and who fell first. Pillar 4: every loss is explainable.
 */
export function explainClash(r: ClashResult, pages: [Page, Page]): Explanation {
  const byUid = new Map(r.fighters.map((f) => [f.uid, f]));
  const name = (uid: string | null, owner = true) => {
    if (!uid) return 'overtime';
    const f = byUid.get(uid);
    if (!f) return uid;
    const n = speciesById(f.species).name;
    return owner ? `${f.team === PLAYER ? 'your' : 'their'} ${n}` : n;
  };
  const cageLabel = (team: Team, id: number) => { const c = pages[team].cages[id]!; return `${c.target}${c.op}`; };
  const list = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

  const verdict = r.winner === PLAYER ? 'Victory' : r.winner === ENEMY ? 'Defeat' : 'Draw';
  const standing = (team: Team) => r.survivors.filter((uid) => byUid.get(uid)?.team === team).length;
  const headline = r.winner === PLAYER
    ? `Won in ${secs(r.beats)} with ${standing(PLAYER)} of ${r.fighters.filter((f) => f.team === PLAYER).length} units standing.`
    : r.winner === ENEMY
      ? `Lost in ${secs(r.beats)}; they kept ${standing(ENEMY)} of ${r.fighters.filter((f) => f.team === ENEMY).length} units.`
      : `Both sides fell at ${secs(r.beats)}.`;

  const lines: string[] = [];
  // Seals, and how each one broke.
  for (const team of [PLAYER, ENEMY] as const) {
    const sealed = r.sealedAtStart[team];
    const who = team === PLAYER ? 'You' : 'They';
    if (!sealed.length) { lines.push(`${who} sealed no cages.`); continue; }
    const breaks: string[] = [];
    r.events.forEach((e, i) => {
      if (e.type !== 'shatter' || e.team !== team) return;
      const prev = r.events[i - 1];
      const fell = prev?.type === 'death' && byUid.get(prev.uid)?.team === team && byUid.get(prev.uid)?.cage === e.cage;
      const how = fell ? `when ${name(prev.uid)} fell` : `by ${name(e.by)}`;
      breaks.push(`${cageLabel(team, e.cage)} at ${secs(e.t)} ${how}`);
    });
    const reseals = r.events.filter((e) => e.type === 'reseal' && e.team === team).length;
    const first = `${who} sealed ${sealed.length} cage${sealed.length > 1 ? 's' : ''} (${list(sealed.map((id) => cageLabel(team, id)))}).`;
    const broke = breaks.length ? ` Shattered: ${list(breaks)}.` : ' None of them broke.';
    const again = reseals ? ` ${reseals === 1 ? 'One was' : `${reseals} were`} resealed.` : '';
    lines.push(first + broke + again);
  }
  // Damage leaders.
  const top = (team: Team) => r.fighters.filter((f) => f.team === team)
    .map((f) => ({ uid: f.uid, dealt: r.damageDealt[f.uid] ?? 0 })).sort((a, b) => b.dealt - a.dealt)[0];
  const mine = top(PLAYER), theirs = top(ENEMY);
  if (mine && theirs) {
    lines.push(`Most damage: ${name(mine.uid)} (${Math.round(mine.dealt).toLocaleString()}), and ${name(theirs.uid)} (${Math.round(theirs.dealt).toLocaleString()}).`);
  }
  // The first to fall.
  const firstDeath = r.events.find((e) => e.type === 'death');
  if (firstDeath && firstDeath.type === 'death') {
    lines.push(`First to fall: ${name(firstDeath.uid)} at ${secs(firstDeath.t)}${firstDeath.by ? `, to ${name(firstDeath.by)}` : ''}.`);
  }
  if (r.events.some((e) => e.type === 'overtime')) lines.push('It went past 30 seconds, so the ink ran: every unit took rising damage.');

  const bars = r.fighters.map((f) => ({ uid: f.uid, team: f.team, name: speciesById(f.species).name, dealt: Math.round(r.damageDealt[f.uid] ?? 0) }))
    .sort((a, b) => b.dealt - a.dealt);
  return { verdict, headline, lines, bars };
}
