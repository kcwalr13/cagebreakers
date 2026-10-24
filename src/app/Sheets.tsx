import { useState } from 'preact/hooks';
import type { Op, Page } from '../core/page';
import { combinationSets } from '../core/rules';
import { normalizeSeed } from '../core/seed';
import { EnemySheet, ResultSheet, SEAL_LINES, TraitSheet, UnitCard } from './fight/Sheets';
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
  const inFight = screen.value === 'fight';
  const p: Page = inFight ? fight.playerPage : toy.page.value;
  const vals = inFight ? fight.values.value : toy.values.value;
  const sealedSet = inFight ? fight.sealed.value : toy.sealed.value;
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
      <div class="scrim" onClick={() => (sheet.value = null)} />
      <div class="sheet" role="dialog" aria-modal="true">
        {s.kind === 'cage' ? <CageSheet cageId={s.cage} />
          : s.kind === 'menu' ? <MenuSheet />
          : s.kind === 'unit' ? <UnitCard uid={s.uid} side={s.side} />
          : s.kind === 'trait' ? <TraitSheet id={s.id} side={s.side} />
          : s.kind === 'enemy' ? <EnemySheet />
          : s.kind === 'result' ? <ResultSheet /> : null}
      </div>
    </>
  );
}
