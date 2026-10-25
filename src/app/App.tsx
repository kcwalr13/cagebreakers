import { useEffect } from 'preact/hooks';
import { RUN } from '../content/balance';
import { stationById } from '../content/stations';
import { Icon } from './Icon';
import { LIFT_PX, drag } from './input';
import { screen, sheet, updateReady } from './nav';
import { RunScreen } from './run/Screens';
import { aim, dailyBest, loadSlot, openSlot, run, selection as runSelection, slot, startDaily, today } from './run/state';
import { LibraryScreen, Leaf, MapScreen, ShopScreen } from './Scriptorium';
import { profile, stars } from './meta';
import { Sheets } from './Sheets';
import { selection as toySelection } from './state';
import { TokenSvg } from './Token';
import { ToyScreen } from './Toy';

function Ghost() {
  const d = drag.value;
  if (!d) return null;
  return (
    <div class="ghost" style={{ transform: `translate(${d.x - 28}px, ${d.y - LIFT_PX - 28}px)` }}>
      <TokenSvg n={d.look.n} size={56} />
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

/** The title's flourish: a vine twisting along the rule, in leaf and bloom. */
function Vine() {
  return (
    <svg class="vine" viewBox="0 0 240 30" aria-hidden="true">
      <path class="vn-stem" d="M8 16C38 2 58 28 88 15S136 3 152 15s42 13 80-1" />
      <path class="vn-leaf" d="M46 13c4-9 13-11 19-8c-3 7-11 11-19 8z" />
      <path class="vn-leaf" d="M70 19c5 8 14 9 19 5c-4-6-12-9-19-5z" />
      <path class="vn-leaf" d="M168 17c4 9 13 11 19 7c-3-7-11-11-19-7z" />
      <path class="vn-leaf" d="M194 11c4-8 12-10 18-7c-3 6-10 10-18 7z" />
      <g class="vn-bloom" transform="translate(120 13)">
        <circle cx="0" cy="-5" r="4.2" /><circle cx="4.8" cy="-1.5" r="4.2" /><circle cx="3" cy="4" r="4.2" />
        <circle cx="-3" cy="4" r="4.2" /><circle cx="-4.8" cy="-1.5" r="4.2" />
        <circle class="vn-heart" cx="0" cy="0" r="2.8" />
      </g>
    </svg>
  );
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dailyLine(): string {
  const day = today();
  const best = dailyBest.value[day];
  const saved = slot.value === 'daily' ? run.value : loadSlot('daily');
  if (saved?.daily === day && saved.phase === 'arrange') return `Growing: week ${saved.round}, ${saved.gold} ${saved.gold === 1 ? 'coin' : 'coins'}.`;
  if (best) return `Your best today: ${best.score} points${best.done ? '' : ', dried out'}. Grow it again?`;
  return 'The same garden, deals and requests for everyone today.';
}

function Title() {
  const d = new Date();
  const main = slot.value === 'main' ? run.value : loadSlot('main');
  const live = main && main.phase === 'arrange' ? main : null;
  return (
    <div class="column title-screen">
      <header class="header">
        <div class="title"><Leaf n={profile.value.leaf} /></div>
        <button class="icon-btn" aria-label="Menu" onClick={() => (sheet.value = { kind: 'menu' })}><Icon name="menu" /></button>
      </header>
      <h1 class="wordmark" aria-label="Plot Twist">
        <span class="wm-plot" aria-hidden="true">Plot</span>
        <span class="wm-twist" aria-hidden="true">Twist</span>
      </h1>
      <Vine />
      <p class="tagline">A number garden, grown over {RUN.rounds} weeks.</p>
      <div class="spacer" />
      <nav class="title-menu">
        {live ? (
          <button class="menu-card primary" onClick={() => { openSlot('main'); screen.value = 'run'; }}>
            <span class="mc-title">Keep growing</span>
            <span class="mc-sub">{live.setup.station ? `${stationById(live.setup.station)?.name}: w` : 'W'}eek {live.round} of {live.setup.rounds}, {live.ink} water, {live.gold} {live.gold === 1 ? 'coin' : 'coins'}.</span>
          </button>
        ) : null}
        <button class={`menu-card${live ? '' : ' primary'}`} onClick={() => (screen.value = 'map')}>
          <span class="mc-title"><Icon name="map" class="ico inline-ico big" /> The Map</span>
          <span class="mc-sub">{profile.value.filled.length
            ? `Six gardens, each with a twist. ${stars.value.have} of ${stars.value.of} stars.`
            : 'Each week brings more numbers and three requests. Plant them to meet the requests until the garden is full. Start in the Kitchen Garden.'}</span>
        </button>
        <button class="menu-card" onClick={() => { startDaily(); screen.value = 'run'; }}>
          <span class="mc-title">Daily Garden <span class="mc-date">{DAY_NAMES[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}</span></span>
          <span class="mc-sub">{dailyLine()}</span>
        </button>
        <div class="title-minor">
          <button class="minor-card" onClick={() => (screen.value = 'shop')}><Icon name="scriptorium" class="ico inline-ico" /> Potting Shed</button>
          <button class="minor-card" onClick={() => (screen.value = 'library')}><Icon name="library" class="ico inline-ico" /> Herbarium</button>
          <button class="minor-card" onClick={() => (screen.value = 'toy')}>Practice plot</button>
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
      sheet.value = null; toySelection.value = null; runSelection.value = null; aim.value = null;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const s = screen.value;
  return (
    <div class="app">
      {s === 'title' ? <Title /> : s === 'toy' ? <ToyScreen /> : s === 'map' ? <MapScreen /> : s === 'shop' ? <ShopScreen />
        : s === 'library' ? <LibraryScreen /> : <RunScreen />}
      <Ghost />
      <UpdateNote />
      <Sheets />
    </div>
  );
}
