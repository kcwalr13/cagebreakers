import { useState } from 'preact/hooks';
import type { Op } from '../core/page';
import { combinationSets } from '../core/rules';
import { normalizeSeed } from '../core/seed';
import { Icon } from './Icon';
import {
  type ThemeChoice, clearPage, newPage, page, placedCount, sealed, sheet, theme, values,
} from './state';

/** What sealing each kind of cage will grant once units arrive. The operation is the reward. */
export const SEAL_REWARD: Record<Op, string> = {
  '+': 'Units inside gain extra max HP.',
  '×': 'Units inside hit harder.',
  '−': 'Units inside attack faster.',
  '÷': 'Units inside start with their ability half charged.',
};

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
  const p = page.value;
  const cage = p.cages[cageId];
  if (!cage) return null;
  const isSealed = sealed.value.has(cageId);
  const sets = isSealed ? [] : combinationSets(p, values.value, cage);
  const size = cage.cells.length;
  return (
    <>
      <div class="sheet-head">
        <h2><span class="cage-target">{cage.target}{cage.op}</span> <span class="muted">in {size} cells</span></h2>
        <Close />
      </div>
      {isSealed ? (
        <p><strong>Sealed.</strong> {SEAL_REWARD[cage.op]}</p>
      ) : sets.length ? (
        <>
          <p class="muted">Numbers that still fit, given the rows and columns around this cage:</p>
          <div class="combos">
            {sets.map((s) => <span class="combo" key={s.join()}>{join(cage.op, orderFor(cage.op, s))}</span>)}
          </div>
          <p class="muted">When it seals: {SEAL_REWARD[cage.op].toLowerCase()}</p>
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
  const p = page.value;
  const playCode = () => {
    const seed = normalizeSeed(code);
    if (!seed) { setCodeError(true); return; }
    newPage(seed);
  };
  return (
    <>
      <div class="sheet-head"><h2>Cagebreakers</h2><Close /></div>

      <div class="section-label">This page</div>
      <p>Code <strong style="font-family: Alegreya, serif; letter-spacing: .06em">{p.seed}</strong>. Type it on another phone to play the same page.</p>
      <div class="row-btns">
        <button class="btn" onClick={() => { clearPage(); sheet.value = null; }} disabled={!placedCount.value}>
          <Icon name="remove" />Clear this page
        </button>
        <button class="btn" onClick={() => newPage()}><Icon name="newPage" />New page</button>
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
      {codeError ? <p style="color: var(--rubric); margin-top: -6px">Codes are 4–12 letters and digits, without 0, 1, I, L or O.</p> : null}

      <div class="section-label">Theme</div>
      <div class="seg" role="group" aria-label="Theme">
        {THEMES.map(([value, label]) => (
          <button key={value} aria-pressed={theme.value === value} onClick={() => (theme.value = value)}>{label}</button>
        ))}
      </div>

      <div class="section-label">How to play this build</div>
      <p>Drag a number from the tray onto the page, or tap a number and then tap a cell. No number may repeat in a row or column.</p>
      <p>Each outlined cage shows a target in red. Fill a cage so its numbers make that target with the operation shown, and it seals in gold. Tap any empty cell to see which numbers still fit its cage.</p>
      <p>Drag a number off the page to remove it. This is the first milestone: units, combat and the shop come next.</p>

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
        {s.kind === 'cage' ? <CageSheet cageId={s.cage} /> : <MenuSheet />}
      </div>
    </>
  );
}
