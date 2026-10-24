import { RUN } from '../../content/balance';
import { ITEMS } from '../../content/items';
import { speciesById } from '../../content/species';
import { ENEMY, PLAYER } from '../../core/clash';
import { pieceKind, writeUnits } from '../../core/pieces';
import { onBoard, runPage, runScore, toSpecs } from '../../core/run';
import { boardValues, sealedCages } from '../../core/rules';
import { Close, EnemyBody, TraitsBody } from '../cards';
import { ClashView } from '../fight/Clash';
import { explainClash } from '../fight/explain';
import type { ItemId } from '../../content/types';
import { Icon } from '../Icon';
import { screen, sheet } from '../nav';
import { TokenSvg } from '../Token';
import { RunPlan } from './Plan';
import { dispatch, finishClash, itemMode, lastFight, run, scouted, startDaily, startRun, view } from './state';

export function MergeSheet() {
  const s = run.value;
  if (!s?.merge) return null;
  const copies = s.merge.uids.map((id) => s.units.find((u) => u.uid === id)!);
  const sp = speciesById(s.merge.species);
  const label = (u: { n: number; n2?: number }) => (pieceKind(sp.id) === 'domino' ? `${u.n} and ${u.n2}` : String(u.n));
  return (
    <>
      <div class="sheet-head"><h2>Three {sp.name.replace(/^The /, '')}s combine</h2></div>
      <p>They become one {sp.name.replace(/^The /, '')} with {s.merge.stars + 1} stars. Which {pieceKind(sp.id) === 'domino' ? 'numbers' : 'number'} should it keep? It stands where that copy stood, if it still fits there.</p>
      <div class="merge-choices">
        {copies.map((u) => (
          <button key={u.uid} class="merge-choice" onClick={() => { dispatch({ type: 'merge', keep: u.uid }); sheet.value = run.value?.phase === 'merge' ? { kind: 'merge' } : run.value?.phase === 'pick' ? { kind: 'pick' } : null; }}>
            <TokenSvg n={u.n} n2={u.n2} species={u.species} stars={(s.merge!.stars + 1)} relic={u.relic} size={56} />
            <span>Keep {label(u)}</span>
            <span class="muted-sm">{u.cell >= 0 ? 'on the page' : 'on the bench'}</span>
          </button>
        ))}
      </div>
    </>
  );
}

const ItemIcon = ({ id }: { id: ItemId }) => <span class={`item-icon ${ITEMS[id].family}`}><Icon name={id} /></span>;

/** The pick of three at a chapter's start (and the extra one after a Keeper falls). */
export function PickSheet() {
  const s = run.value;
  if (!s?.pick) return null;
  const chapter = Math.ceil(s.clash / RUN.chapterLength);
  const extra = s.picksOwed > 0;
  return (
    <>
      <div class="sheet-head"><h2>{s.clash === 1 ? 'Choose an item' : extra ? `Chapter ${chapter}: two picks` : `Chapter ${chapter}: choose an item`}</h2></div>
      <p class="muted-sm">{extra ? 'You beat the Keeper, so another pick follows this one. ' : ''}Tools change the puzzle once. Relics stay with the unit that carries them.</p>
      <div class="pick-list">
        {s.pick.map((id, i) => (
          <button key={`${s.pickCount}-${id}`} class="pick-card" onClick={() => { dispatch({ type: 'pick', choice: i }); sheet.value = run.value?.phase === 'pick' ? { kind: 'pick' } : null; }}>
            <ItemIcon id={id} />
            <span class="pick-text">
              <span class="pick-name">{ITEMS[id].name} <span class="pick-family">{ITEMS[id].family}</span></span>
              <span class="muted-sm">{ITEMS[id].text}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

export function SatchelSheet() {
  const s = run.value;
  if (!s) return null;
  const carried = s.units.filter((u) => u.relic);
  return (
    <>
      <div class="sheet-head"><h2>Satchel</h2><Close /></div>
      {!s.satchel.length ? <p class="muted-sm">Empty. Each chapter opens with a pick of three items, and beating a Keeper earns another.</p> : null}
      <div class="pick-list">
        {s.satchel.map((id, slot) => (
          <div key={`${slot}-${id}`} class="pick-card static">
            <ItemIcon id={id} />
            <span class="pick-text">
              <span class="pick-name">{ITEMS[id].name} <span class="pick-family">{ITEMS[id].family}</span></span>
              <span class="muted-sm">{ITEMS[id].text}</span>
            </span>
            <button class="pill-btn" disabled={s.phase !== 'plan'} onClick={() => { itemMode.value = { slot, item: id }; sheet.value = null; }}>Use</button>
          </div>
        ))}
      </div>
      {carried.length ? (
        <>
          <div class="section-label">Carried</div>
          <p class="muted-sm">{carried.map((u) => `${speciesById(u.species).name}: ${ITEMS[u.relic!].name}`).join('. ')}. Sell a unit to get its relic back.</p>
        </>
      ) : null}
    </>
  );
}

/** Which way to chisel, or which half of a Domino to flip. */
export function ToolSheet({ slot, uid }: { slot: number; uid: string }) {
  const s = run.value;
  const u = s?.units.find((x) => x.uid === uid);
  const item = s?.satchel[slot];
  if (!s || !u || !item) return null;
  const halves: { half: 0 | 1; n: number }[] = pieceKind(u.species) === 'domino' ? [{ half: 0, n: u.n }, { half: 1, n: u.n2! }] : [{ half: 0, n: u.n }];
  const go = (half: 0 | 1, dir?: 1 | -1) => {
    if (dispatch({ type: 'use', slot, uid, half, ...(dir ? { dir } : {}) })) { itemMode.value = null; sheet.value = null; }
  };
  return (
    <>
      <div class="sheet-head"><h2>{item === 'chisel' ? 'Chisel' : 'Flip'} {speciesById(u.species).name}</h2><Close /></div>
      {pieceKind(u.species) === 'blank' ? <p>The Blank has no number to change.</p> : null}
      {pieceKind(u.species) !== 'blank' ? halves.map(({ half, n }) => (
        <div key={half} class="row-btns">
          {item === 'chisel' ? (
            <>
              <button class="btn" disabled={n <= 1} onClick={() => go(half, -1)}>Make the {n} a {n - 1}</button>
              <button class="btn" disabled={n >= 6} onClick={() => go(half, 1)}>Make the {n} a {n + 1}</button>
            </>
          ) : <button class="btn" onClick={() => go(half)}>Flip the {n} to a {7 - n}</button>}
        </div>
      )) : null}
      <p class="muted-sm">If the new number breaks the Latin rule where the unit stands, it moves to your bench.</p>
    </>
  );
}

export function ScoutSheet() {
  const o = scouted.value;
  if (!o) return null;
  const sealed = sealedCages(o.page, boardValues(o.page, writeUnits(o.units)));
  return <EnemyBody name={o.name} plan={o.plan} page={o.page} units={o.units} sealed={sealed} note={o.keeper ? `Keeper. ${o.keeper.twist}` : undefined} />;
}

export function RunTraitsSheet() {
  const s = run.value;
  return <TraitsBody units={s ? toSpecs(onBoard(s)) : []} title="Your Kins and Callings" />;
}

export function RunResultSheet() {
  const f = lastFight.value, s = run.value;
  if (!f || !s) return null;
  const x = explainClash(f.result, [runPage(f.before), f.opponent.page]);
  const rec = f.record;
  const over = s.phase === 'won' || s.phase === 'lost';
  const survivors = f.result.survivors.filter((uid) => f.result.fighters.find((g) => g.uid === uid)?.team === ENEMY).length;
  const keeper = !!f.opponent.keeper;
  const lifeLine = rec.winner === PLAYER ? 'No Life lost.'
    : rec.winner === 'draw' ? `A draw costs ${rec.lifeLost} Life.`
      : `Lost ${rec.lifeLost} Life: ${RUN.lossBase} for the loss and 1 for each of their ${survivors} survivors${keeper ? `, times ${RUN.keeperLossMult} against a Keeper` : ''}.`;
  return (
    <>
      <div class="sheet-head">
        <h2 class={`verdict ${x.verdict.toLowerCase()}`}><Icon name={x.verdict === 'Victory' ? 'trophy' : x.verdict === 'Defeat' ? 'skull' : 'clash'} class="ico inline-ico big" /> {x.verdict}</h2>
      </div>
      <p><strong>{x.headline}</strong> {lifeLine}</p>
      <ul class="why">{x.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      <div class="row-btns">
        <button class="btn primary" onClick={() => { sheet.value = null; finishClash(); if (run.value?.phase === 'pick') sheet.value = { kind: 'pick' }; }}>{over ? 'See the run' : `On to clash ${s.clash}`}</button>
        <button class="btn" onClick={() => (sheet.value = null)}>Back to the clash</button>
      </div>
    </>
  );
}

function RunClash() {
  const f = lastFight.value;
  if (!f) { view.value = 'plan'; return null; }
  return (
    <ClashView
      r={f.result} key={`${f.record.clash}`} playerPage={runPage(f.before)} enemyPage={f.opponent.page}
      onBack={() => { sheet.value = null; finishClash(); if (run.value?.phase === 'pick') sheet.value = { kind: 'pick' }; }} backLabel="Continue"
      onResult={() => (sheet.value = { kind: 'run-result' })}
      subtitle={`Clash ${f.record.clash}: ${f.opponent.name}`}
    />
  );
}

function RunSummary() {
  const s = run.value!;
  const score = runScore(s);
  const won = s.phase === 'won';
  return (
    <div class="column summary">
      <header class="header"><button class="icon-btn" aria-label="Back to title" onClick={() => (screen.value = 'title')}><Icon name="back" /></button><div class="title" /></header>
      <div class={`summary-verdict ${won ? 'won' : 'lost'}`}>
        <Icon name={won ? 'trophy' : 'skull'} class="ico big-ico" />
        <h1>{won ? 'The page is yours' : `Your run ends at clash ${score.reached}`}</h1>
        <p>{won ? `All ${RUN.clashes} clashes survived with ${s.life} Life left.` : `You won ${score.won} of ${score.reached} clashes.`}</p>
      </div>
      <div class="records">
        {s.records.map((r) => (
          <div key={r.clash} class={`record ${r.winner === PLAYER ? 'w' : r.winner === 'draw' ? 'd' : 'l'}`}>
            <span class="r-n">{r.clash}</span>
            <span class="r-name">{r.enemyName}</span>
            <span class="r-res">{r.winner === PLAYER ? 'won' : r.winner === 'draw' ? 'draw' : `lost, −${r.lifeLost}`}</span>
          </div>
        ))}
      </div>
      <p class="muted-sm center">{s.daily ? `Daily Page for ${s.daily}. ` : ''}Run code {s.seed}. Seals made: {s.records.reduce((n, r) => n + r.sealed, 0)} across the run.</p>
      <div class="spacer" />
      {s.daily ? (
        <div class="row-btns">
          <button class="btn primary grow" onClick={() => startDaily(s.daily, true)}>Play today's page again</button>
          <button class="btn" onClick={() => (screen.value = 'title')}>Title</button>
        </div>
      ) : <button class="btn primary wide" onClick={() => startRun()}>New run</button>}
      <div class="bottom-pad" />
    </div>
  );
}

export function RunScreen() {
  const s = run.value;
  if (!s) { screen.value = 'title'; return null; }
  if (view.value === 'clash' && lastFight.value) return <RunClash />;
  if (s.phase === 'won' || s.phase === 'lost') return <RunSummary />;
  return <RunPlan />;
}

