import { useState } from 'preact/hooks';
import type { Op, Page } from '../core/page';
import { combinationSets } from '../core/rules';
import { normalizeSeed } from '../core/seed';
import { UnitCardBody } from './cards';
import { EnemySheet, ResultSheet, SEAL_LINES, TraitSheet, UnitCard } from './fight/Sheets';
import { MergeSheet, RunResultSheet, RunTraitsSheet, ScoutSheet } from './run/Screens';
import * as runState from './run/state';
import { claimCost, isClaimed as _isClaimed, openCells } from '../core/run';
import { abandonRun, startRun } from './run/state';
import * as fight from './fight/state';
import { Icon } from './Icon';
import { screen, sheet } from './nav';
import * as toy from './state';
import { type ThemeChoice, theme } from './state';

const SIZE_NOTE: Record<number, string> = { 2: '', 3: ' Three-cell cages give each member a quarter more.', 4: ' Four-cell cages give each member half again as much.' };

const join = (op: Op, nums: number[]) => nums.join(op === '+' ? ' + ' : op === '×' ? ' × ' : op === '−' ? ' − ' : ' ÷ ');
const orderFor = (op: Op, nums: number[]) => (op === '−' || op === '÷' ? nums.slice().sort((a, b) => b - a) : nums);

function Close() {
  return (
    <button class="icon-btn" onClick={() => (sheet.value = null)} aria-label="Close">
      <Icon name="close" />
    </button>
  );
}

function CageSheet({ cageId }: { cageId: number }) {
  const where = screen.value;
  const rs = runState.run.value;
  const inRun = where === 'run' && !!rs;
  const p: Page = inRun ? runState.page.value! : where === 'fight' ? fight.playerPage : toy.page.value;
  const vals = inRun ? runState.page.value!.stones.map((v, c) => v || (runState.unitAt.value[c]?.n ?? 0)) : where === 'fight' ? fight.values.value : toy.values.value;
  const sealedSet = inRun ? runState.sealed.value : where === 'fight' ? fight.sealed.value : toy.sealed.value;
  const cage = p.cages[cageId];
  if (!cage) return null;
  const isSealed = sealedSet.has(cageId);
  const sets = isSealed ? [] : combinationSets(p, vals, cage);
  const size = cage.cells.length;
  const reward = SEAL_LINES[cage.op] + (SIZE_NOTE[size] ?? '');
  return (
    <>
      <div class="sheet-head">
        <h2><span class="cage-target">{cage.target}{cage.op}</span> <span class="muted">in {size} cells</span></h2>
        <Close />
      </div>
      {inRun ? <ClaimRow cageId={cageId} /> : null}
      {isSealed ? (
        <p><strong>Sealed.</strong> {reward}</p>
      ) : sets.length ? (
        <>
          <p class="muted">Numbers that still fit, given the rows and columns around this cage:</p>
          <div class="combos">
            {sets.map((s) => <span class="combo" key={s.join()}>{join(cage.op, orderFor(cage.op, s))}</span>)}
          </div>
          <p class="muted">When it seals: {reward.charAt(0).toLowerCase() + reward.slice(1)}</p>
        </>
      ) : (
        <p>Nothing fits here with the numbers around it. Move or remove one of them.</p>
      )}
    </>
  );
}

function ClaimRow({ cageId }: { cageId: number }) {
  const s = runState.run.value!;
  const p = runState.page.value!;
  const cage = p.cages[cageId]!;
  const open = openCells(p, cageId).length;
  if (s.claimed.includes(cageId)) return <p class="muted-sm">You hold this cage: {open} open {open === 1 ? 'cell' : 'cells'} for your army.</p>;
  if (s.phase === 'first-claim') {
    if (cage.cells.length !== 2) return <p class="muted-sm">Your free first claim must be a cage of two cells (the gold-outlined ones).</p>;
    return (
      <div class="row-btns">
        <button class="btn primary" onClick={() => { runState.dispatch({ type: 'first-claim', cage: cageId }); sheet.value = null; }}>Claim it free</button>
        <span class="muted-sm">Adds {open} {open === 1 ? 'place' : 'places'} to your army.</span>
      </div>
    );
  }
  const cost = claimCost(s, cageId);
  return (
    <div class="row-btns">
      <button class="btn primary" disabled={s.gold < cost} onClick={() => { if (runState.dispatch({ type: 'claim', cage: cageId })) sheet.value = null; }}>
        <Icon name="gold" />Claim for {cost}
      </button>
      <span class="muted-sm">Adds {open} {open === 1 ? 'place' : 'places'} to your army. Each cage you hold makes the next claim cost 1 more.</span>
    </div>
  );
}

function ConfirmNewRun() {
  const s = runState.run.value;
  return (
    <>
      <div class="sheet-head"><h2>Start a new run?</h2><Close /></div>
      <p>Your run at clash {s?.clash ?? 1} with {s?.life ?? 0} Life will be abandoned.</p>
      <div class="row-btns">
        <button class="btn primary" onClick={() => { abandonRun(); startRun(); sheet.value = null; screen.value = 'run'; }}>Start fresh</button>
        <button class="btn" onClick={() => (sheet.value = null)}>Keep playing</button>
      </div>
    </>
  );
}

const THEMES: [ThemeChoice, string][] = [['system', 'Match phone'], ['light', 'Vellum'], ['dark', 'Night Vellum']];

function MenuSheet() {
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const s = screen.value;
  const playCode = () => {
    const seed = normalizeSeed(code);
    if (!seed) { setCodeError(true); return; }
    toy.newPage(seed);
    screen.value = 'toy';
  };
  return (
    <>
      <div class="sheet-head"><h2>Cagebreakers</h2><Close /></div>

      {s === 'toy' ? (
        <>
          <div class="section-label">This page</div>
          <p>Code <strong class="code">{toy.page.value.seed}</strong>. Type it on another phone to play the same page.</p>
          <div class="row-btns">
            <button class="btn" onClick={() => { toy.clearPage(); sheet.value = null; }} disabled={!toy.placedCount.value}><Icon name="remove" />Clear this page</button>
            <button class="btn" onClick={() => toy.newPage()}><Icon name="newPage" />New page</button>
          </div>
          <div class="section-label">Play a page by code</div>
          <div class="row-btns">
            <input
              class="code-input" value={code} maxLength={12} autocapitalize="characters" autocomplete="off" spellcheck={false}
              aria-label="Page code" placeholder="7KQ2X4"
              onInput={(e) => { setCode((e.target as HTMLInputElement).value); setCodeError(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') playCode(); }}
            />
            <button class="btn" onClick={playCode}>Play</button>
          </div>
          {codeError ? <p class="warn-text">Codes are 4–12 letters and digits, without 0, 1, I, L or O.</p> : null}
        </>
      ) : null}

      {s === 'run' && runState.run.value ? (
        <>
          <div class="section-label">This run</div>
          <p>Code <strong class="code">{runState.run.value.seed}</strong>. Your run is saved after every move, so you can close the game anytime.</p>
          <div class="row-btns">
            <button class="btn" onClick={() => (sheet.value = { kind: 'confirm-new-run' })}>Abandon and start over</button>
          </div>
        </>
      ) : null}

      {s === 'fight' ? (
        <>
          <div class="section-label">This fight</div>
          <div class="row-btns">
            <button class="btn" onClick={() => { fight.clearLayout(); fight.backToPlan(); sheet.value = null; }}><Icon name="remove" />Bench every unit</button>
          </div>
        </>
      ) : null}

      <div class="section-label">Theme</div>
      <div class="seg" role="group" aria-label="Theme">
        {THEMES.map(([value, label]) => (
          <button key={value} aria-pressed={theme.value === value} onClick={() => (theme.value = value)}>{label}</button>
        ))}
      </div>

      <div class="section-label">How to play</div>
      <p>No number may repeat in a row or column. Each outlined cage shows a target in red; fill it so its numbers make that target and it seals in gold, empowering what stands inside. The operation is the reward: + makes units sturdier, × makes them hit harder, − makes them faster, and ÷ starts their ability half charged.</p>
      <p>In a fight, the two pages face each other and units never move. Each hits the front-most enemy in its own column unless its Calling says otherwise. A sealed cage holds until one of its members falls.</p>

      <p class="credits">
        Icons by Lorc, Delapouite and contributors at <a href="https://game-icons.net" target="_blank" rel="noreferrer">game-icons.net</a>, CC BY 3.0.
        Typefaces Alegreya and Alegreya Sans by Huerta Tipográfica, SIL Open Font License.
        <br />Build {__BUILD__.commit}, {__BUILD__.date}.
      </p>
    </>
  );
}

export function Sheets() {
  const s = sheet.value;
  if (!s) return null;
  return (
    <>
      <div class="scrim" onClick={() => { if (s.kind !== 'merge') sheet.value = null; }} />
      <div class="sheet" role="dialog" aria-modal="true">
        {s.kind === 'cage' ? <CageSheet cageId={s.cage} />
          : s.kind === 'menu' ? <MenuSheet />
          : s.kind === 'unit' ? <UnitCard uid={s.uid} side={s.side} />
          : s.kind === 'trait' ? <TraitSheet id={s.id} side={s.side} />
          : s.kind === 'enemy' ? <EnemySheet />
          : s.kind === 'result' ? <ResultSheet />
          : s.kind === 'card' ? <UnitCardBody species={s.species} n={s.n} stars={s.stars} />
          : s.kind === 'scout' ? <ScoutSheet />
          : s.kind === 'traits' ? <RunTraitsSheet />
          : s.kind === 'merge' ? <MergeSheet />
          : s.kind === 'run-result' ? <RunResultSheet />
          : s.kind === 'confirm-new-run' ? <ConfirmNewRun /> : null}
      </div>
    </>
  );
}
