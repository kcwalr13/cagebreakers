import { RUN } from '../../content/balance';
import { speciesById } from '../../content/species';
import { ENEMY, PLAYER } from '../../core/clash';
import { onBoard, pageOf, runScore, toSpecs } from '../../core/run';
import { boardValues, sealedCages } from '../../core/rules';
import { EnemyBody, TraitsBody } from '../cards';
import { ClashView } from '../fight/Clash';
import { explainClash } from '../fight/explain';
import { Icon } from '../Icon';
import { screen, sheet } from '../nav';
import { TokenSvg } from '../Token';
import { RunPlan } from './Plan';
import { dispatch, finishClash, lastFight, run, scouted, startRun, view } from './state';

export function MergeSheet() {
  const s = run.value;
  if (!s?.merge) return null;
  const copies = s.merge.uids.map((id) => s.units.find((u) => u.uid === id)!);
  const sp = speciesById(s.merge.species);
  return (
    <>
      <div class="sheet-head"><h2>Three {sp.name}s combine</h2></div>
      <p>They become one {sp.name} with {s.merge.stars + 1} stars. Which number should it keep? It stands where that copy stood, if the number still fits there.</p>
      <div class="merge-choices">
        {copies.map((u) => (
          <button key={u.uid} class="merge-choice" onClick={() => { dispatch({ type: 'merge', keep: u.uid }); sheet.value = run.value?.phase === 'merge' ? { kind: 'merge' } : null; }}>
            <TokenSvg n={u.n} species={u.species} stars={(s.merge!.stars + 1)} size={56} />
            <span>Keep {u.n}</span>
            <span class="muted-sm">{u.cell >= 0 ? 'on the page' : 'on the bench'}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function ScoutSheet() {
  const o = scouted.value;
  if (!o) return null;
  const placed = new Array(36).fill(0);
  for (const u of o.units) placed[u.cell] = u.n;
  const sealed = sealedCages(o.page, boardValues(o.page, placed));
  return <EnemyBody name={o.name} plan={o.plan} page={o.page} units={o.units} sealed={sealed} note={o.keeper ? `Keeper. ${o.keeper.twist}` : undefined} />;
}

export function RunTraitsSheet() {
  const s = run.value;
  return <TraitsBody units={s ? toSpecs(onBoard(s)) : []} title="Your Kins and Callings" />;
}

export function RunResultSheet() {
  const f = lastFight.value, s = run.value;
  if (!f || !s) return null;
  const x = explainClash(f.result, [pageOf(f.before.seed), f.opponent.page]);
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
        <button class="btn primary" onClick={() => { sheet.value = null; finishClash(); }}>{over ? 'See the run' : `On to clash ${s.clash}`}</button>
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
      r={f.result} key={`${f.record.clash}`} playerPage={pageOf(f.before.seed)} enemyPage={f.opponent.page}
      onBack={() => { sheet.value = null; finishClash(); }} backLabel="Continue"
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
      <p class="muted-sm center">Run code {s.seed}. Seals made: {s.records.reduce((n, r) => n + r.sealed, 0)} across the run.</p>
      <div class="spacer" />
      <button class="btn primary wide" onClick={() => startRun()}>New run</button>
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

