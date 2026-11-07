import { useEffect, useState } from 'preact/hooks';
import { RUN } from '../content/balance';
import { stationById } from '../content/stations';
import { Icon } from './Icon';
import { LIFT_PX, drag } from './input';
import { screen, sheet, updateReady } from './nav';
import { RunScreen } from './run/Screens';
import { aim, dailyBest, dailyKey, dailySlot, loadSlot, openSlot, run, selection as runSelection, slot, startDaily, startWeekly, today } from './run/state';
import { DAILY, WEEKLY } from '../content/journal';
import { mondayOf } from '../core/calendar';
import { streakNow, weeklyGarden } from '../core/meta';
import { HomeScreen } from './Home';
import { JournalScreen } from './Journal';
import { SIZES, type Size } from '../core/grid';
import { LibraryScreen, Leaf, MapScreen, ShopScreen } from './Scriptorium';
import { profile, ready, stars } from './meta';
import { Sheets } from './Sheets';
import { selection as toySelection } from './state';
import { TokenSvg } from './Token';
import { ToyScreen } from './Toy';
import { mode } from './mode';
import { DewBookScreen, DewfallScreen } from './dewfall/DewfallScreen';
import { DAILY_SIZES, bookTotals, carryOn, dewProfile, openDaily, openPuzzle } from './dewfall/state';
import { CHAPTERS, DAILY as DEW_DAILY } from '../content/dewfall';
import { dailyId, dailyStreak, nextInBook, puzzleName } from '../core/dewfall/play';
import { SiegeScreen, pestLine, waveKinds } from './siege/SiegeScreen';
import { siege, siegeBest, startSiege } from './siege/state';
import { WAVES } from '../content/siege';

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

/** Where today's Daily Garden of a size stands, in a word or two. */
function dailyNote(size: Size): string {
  const key = dailyKey(today(), size), sl = dailySlot(size);
  const saved = slot.value === sl ? run.value : loadSlot(sl);
  if (saved?.daily === key && saved.phase === 'arrange') return `Week ${saved.round}`;
  const best = dailyBest.value[key];
  if (best) return `Best ${best.score}`;
  return 'New';
}

/** This week's Weekly Garden on the title: its twist, and where you stand. */
function WeeklyCard() {
  const week = mondayOf(today());
  const w = weeklyGarden(week);
  const saved = slot.value === 'weekly' ? run.value : loadSlot('weekly');
  const live = saved?.weekly === week && saved.phase === 'arrange' ? saved : null;
  const done = profile.value.weekly.includes(week);
  const best = dailyBest.value[`week:${week}`];
  const note = live ? `Week ${live.round} of ${live.setup.rounds}` : done ? `Finished${best ? `, best ${best.score}` : ''}` : `+${WEEKLY.seeds} seeds`;
  return (
    <button class="menu-card weekly-card" onClick={() => { startWeekly(today()); screen.value = 'run'; }}>
      <span class="mc-title"><Icon name="weekly" class="ico inline-ico big" /> Weekly Garden {done ? <Icon name="check" class="ico inline-ico done-check" /> : null}</span>
      <span class="mc-sub"><b>{w.twist}</b>, new every Monday. {note}.</span>
    </button>
  );
}

/** The title's menu for Dewfall: carry on, the book, the day's three puzzles, how to play. */
function DewMenu() {
  const go = carryOn.value;
  const prof = dewProfile.value;
  const totals = bookTotals.value;
  const next = nextInBook(prof);
  const day = today();
  const done = prof.daily[day] ?? [];
  const streak = dailyStreak(prof, day);
  const d = new Date();
  return (
    <nav class="title-menu">
      {go ? (
        <button class="menu-card primary" onClick={() => openPuzzle(go.id)}>
          <span class="mc-title"><Icon name="dewfall" class="ico inline-ico big" /> Carry on</span>
          <span class="mc-sub">{puzzleName(go.id)}, where you left it.</span>
        </button>
      ) : null}
      <button class={`menu-card${go ? '' : ' primary'}`} onClick={() => (screen.value = 'dewbook')}>
        <span class="mc-title"><Icon name="dewBook" class="ico inline-ico big" /> The book</span>
        <span class="mc-sub">{totals.solved
          ? `${CHAPTERS.length} chapters, each with a new clue. ${totals.solved} of ${totals.of} solved, ${totals.stars} stars.${next ? ` Next: ${puzzleName(next)}.` : ''}`
          : `${CHAPTERS.length} chapters of puzzles, each bringing in a new clue. Start with ${CHAPTERS[0]!.name}.`}</span>
      </button>
      <div class="menu-card daily-card">
        <span class="mc-title">Daily Dewfall <span class="mc-date">{DAY_NAMES[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}</span>
          {streak ? <span class="streak-chip" aria-label={`${streak}-day streak`}><Icon name="flame" class="ico" />{streak}</span> : null}</span>
        <span class="mc-sub">{done.length === DAILY_SIZES.length ? 'All three done today. Three new ones tomorrow.' : 'Three new puzzles every day, the same for everyone.'}</span>
        <div class="daily-sizes three">
          {DEW_DAILY.map((dd) => {
            const solved = done.includes(dd.size);
            const stars = prof.stars[dailyId(day, dd.size)] ?? 0;
            return (
              <button key={dd.size} class={`daily-size${solved ? ' done' : ''}`} aria-label={`Daily Dewfall, ${dd.name.toLowerCase()}, ${dd.shape.width} by ${dd.shape.height}${solved ? `: done, ${stars} ${stars === 1 ? 'star' : 'stars'}` : ''}`}
                onClick={() => openDaily(dd.size)}>
                <span class="ds-size">{dd.name}{solved ? <Icon name="check" class="ico ds-check" /> : null}</span>
                <span class="ds-note">{dd.shape.width}×{dd.shape.height}</span>
              </button>
            );
          })}
        </div>
      </div>
      <button class="menu-card" onClick={() => (sheet.value = { kind: 'dew-help' })}>
        <span class="mc-title"><Icon name="help" class="ico inline-ico big" /> How to play</span>
        <span class="mc-sub">The trail, the counts and every clue, on one page.</span>
      </button>
    </nav>
  );
}

/** The title's menu for Garden Siege: carry on, a new season, how to play. */
function SiegeMenu() {
  const s = siege.value;
  const live = s && (s.phase === 'build' || s.phase === 'pick') ? s : null;
  const [sure, setSure] = useState(false);
  const best = siegeBest.value ? ` Best season ${siegeBest.value}.` : '';
  return (
    <nav class="title-menu">
      <button class="menu-card primary" onClick={() => { if (!live) startSiege(); screen.value = 'siege'; }}>
        <span class="mc-title"><Icon name="siege" class="ico inline-ico big" /> {live ? 'Keep defending' : 'A new season'}</span>
        <span class="mc-sub">{live
          ? `Wave ${live.wave} of ${WAVES.length} next: ${pestLine(waveKinds(live.wave))}. ${live.seedlings} seedlings, ${live.coins} coins.`
          : `${WAVES.length} waves of pests. Plant hedges to make them walk the long way round, and defenders to stop them.${best}`}</span>
      </button>
      {live ? (
        <button class={`menu-card${sure ? ' warn' : ''}`} onClick={() => { if (!sure) { setSure(true); return; } startSiege(); screen.value = 'siege'; }}>
          <span class="mc-title">{sure ? 'Tap again to start over' : 'Start over'}</span>
          <span class="mc-sub">Leave this season and begin a new one.{best}</span>
        </button>
      ) : null}
      <button class="menu-card" onClick={() => (sheet.value = { kind: 'siege-help' })}>
        <span class="mc-title"><Icon name="help" class="ico inline-ico big" /> How to play</span>
        <span class="mc-sub">Hedges, defenders, layers and hybrids, in five short paragraphs.</span>
      </button>
    </nav>
  );
}

function Title() {
  const d = new Date();
  const streak = streakNow(profile.value.daily, today());
  const todayDone = profile.value.daily.done[today()] ?? [];
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
      <div class="seg mode-seg" role="group" aria-label="Game">
        <button aria-pressed={mode.value === 'garden'} onClick={() => (mode.value = 'garden')}>Number Garden</button>
        <button aria-pressed={mode.value === 'dewfall'} onClick={() => (mode.value = 'dewfall')}><Icon name="dewfall" class="ico inline-ico" /> Dewfall</button>
        <button aria-pressed={mode.value === 'siege'} onClick={() => (mode.value = 'siege')}><Icon name="siege" class="ico inline-ico" /> Garden Siege</button>
      </div>
      <p class="tagline">{mode.value === 'dewfall' ? 'A slug crossed the garden in the night. Read the dew, and find its one trail.'
        : mode.value === 'siege' ? 'Wave after wave of pests, and a garden to hold. Make them walk the long way round.'
          : `A number garden, grown over ${RUN.rounds} weeks.`}</p>
      <div class="spacer" />
      {mode.value === 'dewfall' ? <DewMenu /> : mode.value === 'siege' ? <SiegeMenu /> : <nav class="title-menu">
        {live ? (
          <button class="menu-card primary" onClick={() => { openSlot('main'); screen.value = 'run'; }}>
            <span class="mc-title">Keep growing</span>
            <span class="mc-sub">{live.setup.station ? `${stationById(live.setup.station)?.name}: w` : 'W'}eek {live.round} of {live.setup.rounds}, {live.ink} water, {live.gold} {live.gold === 1 ? 'coin' : 'coins'}.</span>
          </button>
        ) : null}
        <button class={`menu-card${live ? '' : ' primary'}`} onClick={() => (screen.value = 'map')}>
          <span class="mc-title"><Icon name="map" class="ico inline-ico big" /> The Map</span>
          <span class="mc-sub">{profile.value.filled.length
            ? `Five regions of gardens, each with a twist. ${stars.value.have} of ${stars.value.of} stars.`
            : 'Each week brings more numbers and three requests. Plant them to meet the requests until the garden is full. Start in the Kitchen Garden.'}</span>
        </button>
        <div class="menu-card daily-card">
          <span class="mc-title">Daily Gardens <span class="mc-date">{DAY_NAMES[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}</span>
            {streak ? <span class="streak-chip" aria-label={`${streak}-day streak`}><Icon name="flame" class="ico" />{streak}</span> : null}</span>
          <span class="mc-sub">{todayDone.length === 4 ? 'All four done today. Come back tomorrow for the next four.'
            : `The same for everyone today. +${DAILY.seeds} seeds each${todayDone.length ? '' : `, +${Math.min(streak + 1, DAILY.streakCap) * DAILY.perStreakDay} for your streak`}, +${DAILY.allFour} for all four.`}</span>
          <div class="daily-sizes">
            {SIZES.map((size) => (
              <button key={size} class={`daily-size${todayDone.includes(size) ? ' done' : ''}`} aria-label={`Daily Garden ${size}×${size}: ${todayDone.includes(size) ? 'done, ' : ''}${dailyNote(size)}`}
                onClick={() => { startDaily(today(), false, size); screen.value = 'run'; }}>
                <span class="ds-size">{size}×{size}{todayDone.includes(size) ? <Icon name="check" class="ico ds-check" /> : null}</span>
                <span class="ds-note">{dailyNote(size)}</span>
              </button>
            ))}
          </div>
        </div>
        <WeeklyCard />
        <div class="title-minor">
          <button class="minor-card" onClick={() => (screen.value = 'home')}><Icon name="home" class="ico inline-ico" />Home garden</button>
          <button class="minor-card" onClick={() => (screen.value = 'journal')}>
            <Icon name="journal" class="ico inline-ico" />Journal{ready.value ? <span class="badge" aria-label={`${ready.value} to claim`}>{ready.value}</span> : null}
          </button>
          <button class="minor-card" onClick={() => (screen.value = 'shop')}><Icon name="scriptorium" class="ico inline-ico" />Potting Shed</button>
          <button class="minor-card" onClick={() => (screen.value = 'library')}><Icon name="library" class="ico inline-ico" />Herbarium</button>
          <button class="minor-card" onClick={() => (screen.value = 'toy')}><Icon name="page" class="ico inline-ico" />Practice plot</button>
        </div>
      </nav>}
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
        : s === 'library' ? <LibraryScreen /> : s === 'home' ? <HomeScreen /> : s === 'journal' ? <JournalScreen />
          : s === 'dewfall' ? <DewfallScreen /> : s === 'dewbook' ? <DewBookScreen /> : s === 'siege' ? <SiegeScreen /> : <RunScreen />}
      <Ghost />
      <UpdateNote />
      <Sheets />
    </div>
  );
}
