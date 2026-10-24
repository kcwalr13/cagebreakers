import { BEATS_PER_SECOND, STAR_MULT, heft } from '../content/balance';
import { speciesById } from '../content/species';
import { CALLINGS, KINS } from '../content/traits';
import type { CallingId, KinId } from '../content/types';
import { type TraitTally, type UnitSpec, tallyTraits } from '../core/clash';
import type { Page } from '../core/page';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { sheet } from './nav';
import { PageView, type PieceView } from './PageView';
import { TokenSvg } from './Token';

export function Close() {
  return <button class="icon-btn" onClick={() => (sheet.value = null)} aria-label="Close"><Icon name="close" /></button>;
}

export const traitName = (id: string) => (id in KINS ? KINS[id as KinId].name : CALLINGS[id as CallingId].plural);

/** A unit's card: stats for its number and stars, its ability, its Calling's behaviour. */
export function UnitCardBody({ species, n, stars, footer }: { species: string; n: number; stars: number; footer?: preact.ComponentChildren }) {
  const sp = speciesById(species);
  const h = heft(n), star = STAR_MULT[stars - 1]!;
  const hp = Math.round(sp.hp * h * star), dmg = Math.round(sp.attack * h * star);
  const perSecond = (BEATS_PER_SECOND / (sp.interval * h)).toFixed(2);
  const kin = KINS[sp.kin], calling = CALLINGS[sp.calling];
  return (
    <>
      <div class="sheet-head card-head">
        <TokenSvg n={n} species={species} stars={stars} size={64} />
        <h2>{sp.name}<span class="card-sub">{kin.name.replace(/s$/, '')} {calling.name}, cost {sp.tier}{stars > 1 ? `, ${stars} stars` : ''}</span></h2>
        <Close />
      </div>
      <div class="stats">
        <div><b>{hp}</b><span>HP</span></div>
        <div><b>{dmg}</b><span>per hit</span></div>
        <div><b>{perSecond}</b><span>hits a second</span></div>
        <div><b>{sp.mana}</b><span>mana to cast</span></div>
      </div>
      <p class="muted-sm">As a {n}: {n >= 4 ? 'big numbers hit hard and swing slower.' : 'small numbers act fast and cast more often.'}</p>
      <p><strong>Ability.</strong> {sp.text}</p>
      <p><strong>{calling.name}.</strong> {calling.behavior}</p>
      <p class="muted-sm"><Icon name={sp.kin as IconName} class="ico inline-ico" /> {kin.name} care about {kin.feature.toLowerCase()}.</p>
      {footer}
    </>
  );
}

const fill = (text: string, v: number) => text.replace('{v}', v < 1 ? `${Math.round(v * 100)}` : String(v));

export function tierLine(id: string, i: number): string {
  if (id === 'serpent') return `Serpents with no ally beside them evade every ${KINS.serpent.values[i] === 2 ? '2nd' : '3rd'} hit${i > 0 ? ' and hit 25% harder' : ''}.`;
  if (id === 'breaker') return i === 0 ? 'Your first Breaker hit on a sealed cage shatters it.' : "Every Breaker's first hit on each sealed cage shatters it.";
  const def = id in KINS ? KINS[id as KinId] : CALLINGS[id as CallingId];
  return fill(def.text, def.values[i]!);
}

/** One Kin or Calling: what it cares about and each threshold, lit when reached. */
export function TraitBody({ id, count }: { id: string; count: number }) {
  const isKin = id in KINS;
  const def = isKin ? KINS[id as KinId] : CALLINGS[id as CallingId];
  return (
    <>
      <div class="sheet-head"><h2><Icon name={id as IconName} class="ico inline-ico big" /> {traitName(id)}</h2><Close /></div>
      {isKin ? <p class="muted-sm">Cares about: {(def as (typeof KINS)[KinId]).feature}.</p> : <p>{(def as (typeof CALLINGS)[CallingId]).behavior}</p>}
      <div class="tiers">
        {def.thresholds.map((th, i) => (
          <div key={th} class={`tier${count >= th ? ' on' : ''}`}>
            <span class="tier-n">{th}</span>
            <span>{tierLine(id, i)}</span>
          </div>
        ))}
      </div>
      <p class="muted-sm">{count} different {traitName(id)} on the page. Copies of the same species count once.</p>
    </>
  );
}

/** Every Kin and Calling an army has, with thresholds, for the traits sheet. */
export function TraitsBody({ units, title }: { units: UnitSpec[]; title: string }) {
  const t = tallyTraits(units);
  const all: TraitTally[] = [...t.kins, ...t.callings].sort((a, b) => b.level - a.level || b.count - a.count);
  return (
    <>
      <div class="sheet-head"><h2>{title}</h2><Close /></div>
      {!all.length ? <p class="muted-sm">Place units on the page and their Kins and Callings appear here.</p> : null}
      <div class="trait-list">
        {all.map((x) => {
          const isKin = x.id in KINS;
          const def = isKin ? KINS[x.id as KinId] : CALLINGS[x.id as CallingId];
          const next = def.thresholds.find((th) => th > x.count);
          return (
            <div key={x.id} class={`trait-row${x.level ? ' on' : ''}`}>
              <Icon name={x.id as IconName} class="ico chip-ico" />
              <div>
                <div class="trait-title">{traitName(x.id)} <span class="chip-count">{x.count}</span>{next ? <span class="muted-sm"> (next at {next})</span> : null}</div>
                <div class="muted-sm">{x.level ? tierLine(x.id, x.level - 1) : `Needs ${def.thresholds[0]}: ${tierLine(x.id, 0)}`}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** The scouted enemy: their page as it faces you, their plan, their units. */
export function EnemyBody({ name, plan, page, units, sealed, note }: {
  name: string; plan: string; page: Page; units: UnitSpec[]; sealed: ReadonlySet<number>; note?: string;
}) {
  const pieces: (PieceView | null)[] = page.stones.map(() => null);
  for (const u of units) pieces[u.cell] = { key: u.uid, n: u.n, species: u.species, stars: u.stars };
  const tallies = tallyTraits(units);
  return (
    <>
      <div class="sheet-head"><h2>{name}</h2><Close /></div>
      <p class="muted-sm">{plan}. {note ?? 'Their front row is at the bottom, facing yours. Gold cages are already sealed.'}</p>
      <div class="enemy-board">
        <PageView id="enemy-sheet" page={page} pieces={pieces} sealed={sealed} mirrored label={`${name}'s page`} />
      </div>
      <div class="traits wrap">
        {[...tallies.kins, ...tallies.callings].map((t) => (
          <span key={t.id} class={`chip static${t.level ? ' on' : ''}`}>
            <Icon name={t.id as IconName} class="ico chip-ico" /><span>{traitName(t.id)}</span><span class="chip-count">{t.count}</span>
          </span>
        ))}
      </div>
      <div class="unit-list">
        {units.map((u) => (
          <button key={u.uid} class="unit-row" onClick={() => (sheet.value = { kind: 'card', species: u.species, n: u.n, stars: u.stars })}>
            <TokenSvg n={u.n} species={u.species} stars={u.stars} size={40} />
            <span>{speciesById(u.species).name}{u.stars > 1 ? ` (${u.stars} stars)` : ''}</span>
            <span class="muted-sm">{speciesById(u.species).text}</span>
          </button>
        ))}
      </div>
    </>
  );
}
