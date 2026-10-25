import { useEffect } from 'preact/hooks';
import { RUN } from '../content/balance';
import { Icon } from './Icon';
import { LIFT_PX, drag } from './input';
import { screen, sheet, updateReady } from './nav';
import { RunScreen } from './run/Screens';
import { dailyBest, lensMode, loadSlot, openSlot, run, selection as runSelection, slot, startDaily, startRun, today } from './run/state';
import { Sheets } from './Sheets';
import { selection as toySelection } from './state';
import { TokenSvg } from './Token';
import { ToyScreen } from './Toy';

function Ghost() {
  const d = drag.value;
  if (!d) return null;
  return (
    <div class="ghost" style={{ transform: `translate(${d.x - 28}px, ${d.y - LIFT_PX - 28}px)` }}>
      <TokenSvg n={d.look.n} fresh={d.look.fresh} size={56} />
    </div>
  );
}

function UpdateNote() {
  const apply = updateReady.value;
  if (!apply) return null;
  return (
    <div class="update-note" role="status">
      <span>A new version is ready.</span>
      <button class="pill-btn" onClick={apply}>Reload</button>
      <button class="icon-btn" aria-label="Later" onClick={() => (updateReady.value = null)}><Icon name="close" /></button>
    </div>
  );
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dailyLine(): string {
  const day = today();
  const best = dailyBest.value[day];
  const saved = slot.value === 'daily' ? run.value : loadSlot('daily');
  if (saved?.daily === day && saved.phase === 'arrange') return `In progress: round ${saved.round}, ${saved.gold} gold.`;
  if (best) return `Your best today: ${best.score} points${best.done ? '' : ', ruined'}. Play it again?`;
  return 'The same page, deals and commissions for everyone today.';
}

function Title() {
  const d = new Date();
  const main = slot.value === 'main' ? run.value : loadSlot('main');
  const live = main && main.phase === 'arrange' ? main : null;
  return (
    <div class="column title-screen">
      <header class="header">
        <div class="title" />
        <button class="icon-btn" aria-label="Menu" onClick={() => (sheet.value = { kind: 'menu' })}><Icon name="menu" /></button>
      </header>
      <div class="wordmark" aria-label="Cagebreakers">
        <span class="initial" aria-hidden="true">C</span>
        <span class="rest" aria-hidden="true">agebreakers</span>
      </div>
      <svg class="flourish" viewBox="0 0 240 24" aria-hidden="true">
        <path class="fl-line" d="M14 12H98M142 12H226" />
        <path class="fl-curl" d="M98 12c5-7 11-7 13 0M142 12c-5 7-11 7-13 0" />
        <path class="fl-diamond" d="M120 3l9 9-9 9-9-9z" />
        <circle class="fl-dot" cx="10" cy="12" r="2.5" /><circle class="fl-dot" cx="230" cy="12" r="2.5" />
      </svg>
      <p class="tagline">One KenKen page, filled in over {RUN.rounds} rounds.</p>
      <div class="spacer" />
      <nav class="title-menu">
        {live ? (
          <button class="menu-card primary" onClick={() => { openSlot('main'); screen.value = 'run'; }}>
            <span class="mc-title">Continue run</span>
            <span class="mc-sub">Round {live.round} of {RUN.rounds}, {live.ink} ink, {live.gold} gold.</span>
          </button>
        ) : (
          <button class="menu-card primary" onClick={() => { startRun(); screen.value = 'run'; }}>
            <span class="mc-title">New run</span>
            <span class="mc-sub">Each round deals more numbers and three commissions. Rearrange to meet them, until the page is full.</span>
          </button>
        )}
        <button class="menu-card" onClick={() => { startDaily(); screen.value = 'run'; }}>
          <span class="mc-title">Daily Page <span class="mc-date">{DAY_NAMES[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}</span></span>
          <span class="mc-sub">{dailyLine()}</span>
        </button>
        <div class="title-minor">
          {live ? <button class="minor-card" onClick={() => (sheet.value = { kind: 'confirm-new-run' })}>New run</button> : null}
          <button class="minor-card" onClick={() => (screen.value = 'toy')}>Page toy</button>
        </div>
      </nav>
      <div class="bottom-pad" />
    </div>
  );
}

export function App() {
  // Escape closes sheets and drops whatever is in hand.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      sheet.value = null; toySelection.value = null; runSelection.value = null; lensMode.value = false;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const s = screen.value;
  return (
    <div class="app">
      {s === 'title' ? <Title /> : s === 'toy' ? <ToyScreen /> : <RunScreen />}
      <Ghost />
      <UpdateNote />
      <Sheets />
    </div>
  );
}
