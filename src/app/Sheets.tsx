import { useState } from 'preact/hooks';
import { RUN } from '../content/balance';
import type { Op, Page } from '../core/page';
import { combinationSets } from '../core/rules';
import { normalizeSeed } from '../core/seed';
import { coachOff, resetTips } from './coach';
import { Icon } from './Icon';
import { screen, sheet } from './nav';
import { RoundSheet, ToolSheet } from './run/Screens';
import { BookSheet, StationSheet } from './Scriptorium';
import { profile } from './meta';
import { stationById } from '../content/stations';
import * as runState from './run/state';
import { exportCode, importCode } from './savecode';
import { type HandChoice, type MotionChoice, buzz, setSetting, settings } from './settings';
import { play, unlockAudio } from './sound';
import * as toy from './state';
import { type ThemeChoice, theme } from './state';

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
  const inRun = screen.value === 'run' && !!runState.run.value;
  const p: Page = inRun ? runState.page.value! : toy.page.value;
  const vals = inRun ? runState.values.value : toy.values.value;
  const sealedSet = inRun ? runState.sealed.value : toy.sealed.value;
  const cage = p.cages[cageId];
  if (!cage) return null;
  const isSealed = sealedSet.has(cageId);
  const sets = isSealed ? [] : combinationSets(p, vals, cage);
  return (
    <>
      <div class="sheet-head">
        <h2><span class="cage-target">{cage.target}{cage.op}</span> <span class="muted">plot of {cage.cells.length} squares</span></h2>
        <Close />
      </div>
      {isSealed ? (
        <p><strong>In bloom.</strong> {inRun ? `It pays ${RUN.sealGold} coin each week you water it in bloom.` : 'Its numbers make the target.'}</p>
      ) : sets.length ? (
        <>
          <p class="muted">Numbers that still fit, given the rows and columns around this plot:</p>
          <div class="combos">
            {sets.map((s) => <span class="combo" key={s.join()}>{join(cage.op, orderFor(cage.op, s))}</span>)}
          </div>
          {inRun ? <p class="muted">In bloom, it pays {RUN.sealGold} coin each week you water it.</p> : null}
        </>
      ) : (
        <p>Nothing fits here with the numbers around it. Move one of them.</p>
      )}
    </>
  );
}

function ConfirmNewRun() {
  const s = runState.slot.value === 'main' ? runState.run.value : runState.loadSlot('main');
  return (
    <>
      <div class="sheet-head"><h2>Abandon this garden?</h2><Close /></div>
      <p>Your garden in week {s?.round ?? 1}, with {s?.gold ?? 0} {s?.gold === 1 ? 'coin' : 'coins'}, will be abandoned. It saves no seeds.</p>
      <div class="row-btns">
        <button class="btn primary" onClick={() => { runState.openSlot('main'); runState.abandonRun(); sheet.value = null; screen.value = 'map'; }}>Abandon it</button>
        <button class="btn" onClick={() => (sheet.value = null)}>Keep playing</button>
      </div>
    </>
  );
}

const THEMES: [ThemeChoice, string][] = [['system', 'Match phone'], ['light', 'Botanical'], ['dark', 'Night Garden']];
const STYLES: [ThemeChoice, string][] = [['newsprint', 'Cottage'], ['neon', 'Greenhouse']];
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
      <div class="sheet-head"><h2>Plot Twist</h2><Close /></div>

      {s === 'toy' ? (
        <>
          <div class="section-label">This garden</div>
          <p>Code <strong class="code">{toy.page.value.seed}</strong>. Type it on another phone to grow the same garden.</p>
          <div class="row-btns">
            <button class="btn" onClick={() => { toy.clearPage(); sheet.value = null; }} disabled={!toy.placedCount.value}><Icon name="remove" />Clear this garden</button>
            <button class="btn" onClick={() => toy.newPage()}><Icon name="newPage" />New garden</button>
          </div>
          <div class="section-label">Grow a garden by code</div>
          <div class="row-btns">
            <input
              class="code-input" value={code} maxLength={12} autocapitalize="characters" autocomplete="off" spellcheck={false}
              aria-label="Garden code" placeholder="7KQ2X4"
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
          <div class="section-label">This garden</div>
          <p>{runState.run.value.setup.station ? `${stationById(runState.run.value.setup.station)?.name}. ` : runState.run.value.daily ? 'The Daily Garden. ' : ''}Code <strong class="code">{runState.run.value.seed}</strong>. Your garden is saved after every move, so you can close the game anytime.</p>
          {runState.slot.value === 'main' ? (
            <div class="row-btns">
              <button class="btn" onClick={() => (sheet.value = { kind: 'confirm-new-run' })}>Abandon and start over</button>
            </div>
          ) : null}
        </>
      ) : null}

      <div class="section-label">Look</div>
      <div class="seg" role="group" aria-label="Look">
        {THEMES.map(([value, label]) => (
          <button key={value} aria-pressed={theme.value === value} onClick={() => (theme.value = value)}>{label}</button>
        ))}
      </div>
      {STYLES.some(([v]) => profile.value.owned.includes(v as never)) ? (
        <div class="seg" role="group" aria-label="Looks from the Potting Shed">
          {STYLES.filter(([v]) => profile.value.owned.includes(v as never)).map(([value, label]) => (
            <button key={value} aria-pressed={theme.value === value} onClick={() => (theme.value = value)}>{label}</button>
          ))}
        </div>
      ) : null}
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
      <p>Your garden is a 6×6 bed. No number may repeat in a row or column. Each outlined plot shows a target; when its numbers make that target, it blooms.</p>
      <p>A garden grows over {RUN.rounds} weeks (some gardens on the map differ). Each week deals you a few more numbers and posts three requests. Anything in the garden can move: double-tap a number to pick it up, or use Pick up all to start over. To water the week, plant all your numbers, or all but one; planting every one pays a bonus coin, and a number you keep is dealt again later. While you hold a number, bright squares can take it and shaded ones can't.</p>
      <p>All three requests can always be met at once, with every number planted. Miss the required one and a drop of water dries up; lose all {RUN.startInk} and the garden dries out. The other two pay coins, and so does every blooming plot when you water. Coins buy the tools you carry. The numbers dealt over a season are exactly the ones the garden needs, so in harvest week the last of them go in and the garden is full. Your score is the coins you kept, plus {RUN.inkBonus} for each drop of water left.</p>
      <p>Between gardens, the Potting Shed keeps what lasts. A finished garden saves seeds: 1 for every 10 points and 5 for each new star. Finishing a garden on the map opens the ones beyond it. Spend seeds on tools to carry, upgrades and new looks.</p>

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
      <p class="muted-sm">A save code carries your garden, today's Daily Garden, your seeds, your best scores and your settings. No account, no connection needed.</p>
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
      <div class="scrim" onClick={() => (sheet.value = null)} />
      <div class="sheet" role="dialog" aria-modal="true">
        {s.kind === 'cage' ? <CageSheet cageId={s.cage} />
          : s.kind === 'menu' ? <MenuSheet />
          : s.kind === 'tool' ? <ToolSheet tool={s.tool} />
          : s.kind === 'round' ? <RoundSheet />
          : s.kind === 'station' ? <StationSheet id={s.station} />
          : s.kind === 'book' ? <BookSheet id={s.id} />
          : s.kind === 'transfer' ? <TransferSheet />
          : s.kind === 'confirm-new-run' ? <ConfirmNewRun /> : null}
      </div>
    </>
  );
}
