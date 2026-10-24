import { BEATS_PER_SECOND, SEAL, heft, STAR_MULT } from '../../content/balance';
import { speciesById } from '../../content/species';
import { CALLINGS, KINS } from '../../content/traits';
import type { CallingId, KinId } from '../../content/types';
import { ENEMY, PLAYER, tallyTraits } from '../../core/clash';
import { Icon } from '../Icon';
import type { IconName } from '../icons';
import { sheet } from '../nav';
import { PageView, type PieceView } from '../PageView';
import { TokenSvg } from '../Token';
import { UnitCardBody } from '../cards';
import { explainClash } from './explain';
import { backToPlan, encounter, enemyPage, enemySealed, playerPage, result, rosterById, units } from './state';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fill = (text: string, v: number) => text.replace('{v}', v < 1 ? `${Math.round(v * 100)}` : String(v));

function Close() {
  return <button class="icon-btn" onClick={() => (sheet.value = null)} aria-label="Close"><Icon name="close" /></button>;
}

export function UnitCard({ uid, side }: { uid: string; side: 'player' | 'enemy' }) {
  const spec = side === 'player' ? rosterById.get(uid) : encounter.enemy.find((u) => u.uid === uid);
  if (!spec) return null;
  return <UnitCardBody species={spec.species} n={spec.n} stars={spec.stars} footer={<p class="muted-sm">Tap the trait chips to see their bonuses.</p>} />;
}

export function TraitSheet({ id, side }: { id: string; side: 'player' | 'enemy' }) {
  const isKin = id in KINS;
  const def = isKin ? KINS[id as KinId] : CALLINGS[id as CallingId];
  const tally = side === 'player' ? tallyTraits(units.value) : tallyTraits(encounter.enemy);
  const mine = [...tally.kins, ...tally.callings].find((t) => t.id === id);
  const count = mine?.count ?? 0;
  return (
    <>
      <div class="sheet-head"><h2><Icon name={id as IconName} class="ico inline-ico big" /> {'plural' in def ? def.plural : def.name}</h2><Close /></div>
      {isKin ? <p class="muted-sm">Cares about: {(def as (typeof KINS)[KinId]).feature}.</p> : <p>{(def as (typeof CALLINGS)[CallingId]).behavior}</p>}
      <div class="tiers">
        {def.thresholds.map((th, i) => (
          <div key={th} class={`tier${count >= th ? ' on' : ''}`}>
            <span class="tier-n">{th}</span>
            <span>{id === 'serpent'
              ? `Serpents with no ally beside them evade every ${def.values[i] === 2 ? '2nd' : '3rd'} hit${i > 0 ? ' and hit 25% harder' : ''}.`
              : id === 'breaker'
                ? i === 0 ? 'Your first Breaker hit on a sealed cage shatters it.' : "Every Breaker's first hit on each sealed cage shatters it."
                : fill(def.text, def.values[i]!)}</span>
          </div>
        ))}
      </div>
      <p class="muted-sm">{side === 'player' ? 'You have' : 'They have'} {count} different {'plural' in def ? def.plural : def.name} on the page. Copies of the same species count once.</p>
    </>
  );
}

export function EnemySheet() {
  const pieces: (PieceView | null)[] = enemyPage.stones.map(() => null);
  for (const u of encounter.enemy) pieces[u.cell] = { key: u.uid, n: u.n, species: u.species, stars: u.stars };
  const tallies = tallyTraits(encounter.enemy);
  return (
    <>
      <div class="sheet-head"><h2>{encounter.enemyName}</h2><Close /></div>
      <p class="muted-sm">{encounter.enemyPlan}. Their front row is at the bottom, facing yours. Gold cages are already sealed.</p>
      <div class="enemy-board">
        <PageView id="enemy-sheet" page={enemyPage} pieces={pieces} sealed={enemySealed} mirrored label={`${encounter.enemyName}'s page`} />
      </div>
      <div class="traits wrap">
        {[...tallies.kins, ...tallies.callings].map((t) => (
          <button key={t.id} class={`chip${t.level ? ' on' : ''}`} onClick={() => (sheet.value = { kind: 'trait', id: t.id, side: 'enemy' })}>
            <Icon name={t.id as IconName} class="ico chip-ico" /><span>{t.id in KINS ? KINS[t.id as KinId].name : CALLINGS[t.id as CallingId].plural}</span><span class="chip-count">{t.count}</span>
          </button>
        ))}
      </div>
      <div class="unit-list">
        {encounter.enemy.map((u) => (
          <button key={u.uid} class="unit-row" onClick={() => (sheet.value = { kind: 'unit', uid: u.uid, side: 'enemy' })}>
            <TokenSvg n={u.n} species={u.species} stars={u.stars} size={40} />
            <span>{speciesById(u.species).name}</span>
            <span class="muted-sm">{speciesById(u.species).text}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function ResultSheet() {
  const r = result.value;
  if (!r) return null;
  const x = explainClash(r, [playerPage, enemyPage]);
  const max = Math.max(1, ...x.bars.map((b) => b.dealt));
  return (
    <>
      <div class="sheet-head">
        <h2 class={`verdict ${x.verdict.toLowerCase()}`}><Icon name={x.verdict === 'Victory' ? 'trophy' : x.verdict === 'Defeat' ? 'skull' : 'clash'} class="ico inline-ico big" /> {x.verdict}</h2>
        <Close />
      </div>
      <p><strong>{x.headline}</strong></p>
      <ul class="why">{x.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      <div class="section-label">Damage dealt</div>
      <div class="bars">
        {x.bars.map((b) => (
          <div key={b.uid} class={`bar-row ${b.team === PLAYER ? 'mine' : 'theirs'}`}>
            <span class="bar-name">{b.team === ENEMY ? 'Their ' : ''}{b.name}</span>
            <span class="bar-track"><span class="bar-fill" style={{ width: `${(100 * b.dealt) / max}%` }} /></span>
            <span class="bar-val">{b.dealt.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div class="row-btns">
        <button class="btn primary" onClick={() => { sheet.value = null; backToPlan(); }}>Rearrange</button>
        <button class="btn" onClick={() => (sheet.value = null)}>Back to the clash</button>
      </div>
    </>
  );
}

/** Seal rewards in the player's terms, for the cage sheet. */
export const SEAL_LINES = {
  '+': `Units inside gain ${pct(SEAL['+'].hp)} extra max HP.`,
  '×': `Units inside hit ${pct(SEAL['×'].damage)} harder.`,
  '−': `Units inside attack ${pct(SEAL['−'].speed)} faster.`,
  '÷': 'Units inside start with their ability half charged.',
} as const;
