import { useState } from 'preact/hooks';
import type { Op, Page } from '../core/page';
import { combinationSets } from '../core/rules';
import { normalizeSeed } from '../core/seed';
import { UnitCardBody } from './cards';
import { EnemySheet, ResultSheet, SEAL_LINES, TraitSheet, UnitCard } from './fight/Sheets';
import { MergeSheet, PickSheet, RunResultSheet, RunTraitsSheet, SatchelSheet, ScoutSheet, ToolSheet } from './run/Screens';
import * as runState from './run/state';
import { claimCost, openCells, values } from '../core/run';
import { abandonRun, startRun } from './run/state';
import * as fight from './fight/state';
import { Icon } from './Icon';
import { screen, sheet } from './nav';
import * as toy from './state';
import { type HandChoice, type MotionChoice, buzz, setSetting, settings } from './settings';
import { coachOff, resetTips } from './coach';
import { exportCode, importCode } from './savecode';
import { play, unlockAudio } from './sound';
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
  const vals = inRun ? values(rs!) : where === 'fight' ? fight.values.value : toy.values.value;
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
  const s = runState.slot.value === 'main' ? runState.run.value : runState.loadSlot('main');
  return (
    <>
      <div class="sheet-head"><h2>Start a new run?</h2><Close /></div>
      <p>Your run at clash {s?.clash ?? 1} with {s?.life ?? 0} Life will be abandoned.</p>
      <div class="row-btns">
        <button class="btn primary" onClick={() => { runState.openSlot('main'); abandonRun(); startRun(); sheet.value = null; screen.value = 'run'; }}>Start fresh</button>
        <button class="btn" onClick={() => (sheet.value = null)}>Keep playing</button>
      </div>
    </>
  );
}

const THEMES: [ThemeChoice, string][] = [['system', 'Match phone'], ['light', 'Vellum'], ['dark', 'Night Vellum']];
const MOTIONS: [MotionChoice, string][] = [['system', 'Match phone'], ['reduced', 'Less'], ['full', 'Full']];
const HANDS: [HandChoice, string][] = [['right', 'Right thumb'], ['left', 'Left thumb']];

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div class="seg" role="group" aria-label={label}>
      <button aria-pressed={on} onClick={() => set(true)}>On</button>
      <button aria-pressed={!on} onClick={() => set(false)}>Off</button>
    </div>
  );
}

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
      <div class="settings-grid">
        <div>
          <div class="section-label">Sound</div>
          <Toggle label="Sound" on={settings.value.sound} set={(v) => { setSetting('sound', v); if (v) { unlockAudio(); play('seal'); } }} />
        </div>
        {'vibrate' in navigator ? (
          <div>
            <div class="section-label">Vibration</div>
            <Toggle label="Vibration" on={settings.value.haptics} set={(v) => { setSetting('haptics', v); if (v) buzz(12); }} />
          </div>
        ) : null}
      </div>
      <div class="section-label">Tips while you play</div>
      <div class="row-btns">
        <button class="btn" aria-pressed={!coachOff.value} onClick={() => (coachOff.value = !coachOff.value)}>{coachOff.value ? 'Turn tips on' : 'Turn tips off'}</button>
        <button class="btn" onClick={() => { resetTips(); sheet.value = null; }}>Show every tip again</button>
      </div>
      <div class="section-label">Motion</div>
      <div class="seg" role="group" aria-label="Motion">
        {MOTIONS.map(([value, label]) => (
          <button key={value} aria-pressed={settings.value.motion === value} onClick={() => setSetting('motion', value)}>{label}</button>
        ))}
      </div>
      <div class="section-label">Controls</div>
      <div class="seg" role="group" aria-label="Controls">
        {HANDS.map(([value, label]) => (
          <button key={value} aria-pressed={settings.value.hand === value} onClick={() => setSetting('hand', value)}>{label}</button>
        ))}
      </div>

      <div class="section-label">Your progress</div>
      <div class="row-btns">
        <button class="btn" onClick={() => (sheet.value = { kind: 'transfer' })}>Move to another phone</button>
      </div>

      <div class="section-label">How to play</div>
      <p>No number may repeat in a row or column. Each outlined cage shows a target in red; fill it so its numbers make that target and it seals in gold, empowering what stands inside. The operation is the reward: + makes units sturdier, × makes them hit harder, − makes them faster, and ÷ starts their ability half charged.</p>
      <p>In a fight, the two pages face each other and units never move. Each hits the front-most enemy in its own column unless its Calling says otherwise. A sealed cage holds until one of its members falls.</p>
      <p>The three Misprints at the top of the shop bend the rules: the Blank has no number and counts as whatever completes its cage, the Smudge ignores the Latin rule but stops its cage sealing, and the Domino fills two cells at once. Each chapter opens with a pick of items: tools that change the page once, and relics that strengthen one unit.</p>

      <p class="credits">
        Icons by Lorc, Delapouite and contributors at <a href="https://game-icons.net" target="_blank" rel="noreferrer">game-icons.net</a>, CC BY 3.0.
        Typefaces Alegreya and Alegreya Sans by Huerta Tipográfica, SIL Open Font License.
        <br />Build {__BUILD__.commit}, {__BUILD__.date}.
      </p>
    </>
  );
}

function TransferSheet() {
  const [code, setCode] = useState('');
  const [mine, setMine] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; warn?: boolean } | null>(null);
  const copy = async () => {
    const c = await exportCode();
    setMine(c);
    try { await navigator.clipboard.writeText(c); setNote({ text: 'Copied. Paste it into this screen on the other phone.' }); }
    catch { setNote({ text: 'Select the code below and copy it.' }); }
  };
  const load = async () => {
    const err = await importCode(code);
    if (err) setNote({ text: err, warn: true }); else location.reload();
  };
  return (
    <>
      <div class="sheet-head"><h2>Move to another phone</h2><Close /></div>
      <p class="muted-sm">A save code carries your run, today's Daily Page, the Codex and your settings. No account, no connection needed.</p>
      <div class="section-label">From this phone</div>
      <div class="row-btns"><button class="btn" onClick={() => void copy()}>Copy my save code</button></div>
      {mine ? <textarea class="code-box" readOnly value={mine} aria-label="Your save code" onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()} /> : null}
      <div class="section-label">Onto this phone</div>
      <textarea class="code-box" placeholder="Paste a save code here" value={code} aria-label="Save code to load" onInput={(e) => { setCode((e.target as HTMLTextAreaElement).value); setNote(null); }} />
      <div class="row-btns"><button class="btn primary" disabled={!code.trim()} onClick={() => void load()}>Load it, replacing this phone's progress</button></div>
      {note ? <p class={note.warn ? 'warn-text' : 'muted-sm'} role="status">{note.text}</p> : null}
    </>
  );
}

export function Sheets() {
  const s = sheet.value;
  if (!s) return null;
  return (
    <>
      <div class="scrim" onClick={() => { if (s.kind !== 'merge' && s.kind !== 'pick') sheet.value = null; }} />
      <div class="sheet" role="dialog" aria-modal="true">
        {s.kind === 'cage' ? <CageSheet cageId={s.cage} />
          : s.kind === 'menu' ? <MenuSheet />
          : s.kind === 'unit' ? <UnitCard uid={s.uid} side={s.side} />
          : s.kind === 'trait' ? <TraitSheet id={s.id} side={s.side} />
          : s.kind === 'enemy' ? <EnemySheet />
          : s.kind === 'result' ? <ResultSheet />
          : s.kind === 'card' ? <UnitCardBody species={s.species} n={s.n} n2={s.n2} stars={s.stars} relic={s.relic} />
          : s.kind === 'pick' ? <PickSheet />
          : s.kind === 'satchel' ? <SatchelSheet />
          : s.kind === 'tool' ? <ToolSheet slot={s.slot} uid={s.uid} />
          : s.kind === 'transfer' ? <TransferSheet />
          : s.kind === 'scout' ? <ScoutSheet />
          : s.kind === 'traits' ? <RunTraitsSheet />
          : s.kind === 'merge' ? <MergeSheet />
          : s.kind === 'run-result' ? <RunResultSheet />
          : s.kind === 'confirm-new-run' ? <ConfirmNewRun /> : null}
      </div>
    </>
  );
}
