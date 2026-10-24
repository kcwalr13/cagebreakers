import { useEffect } from 'preact/hooks';
import { ClashScreen } from './fight/Clash';
import { PlanScreen } from './fight/Plan';
import { phase } from './fight/state';
import { Icon } from './Icon';
import { LIFT_PX, drag } from './input';
import { screen, sheet, updateReady } from './nav';
import { Sheets } from './Sheets';
import { selection as toySelection } from './state';
import { TokenSvg } from './Token';
import { ToyScreen } from './Toy';
import { RunScreen } from './run/Screens';
import { run, startRun } from './run/state';
import { RUN } from '../content/balance';

function Ghost() {
  const d = drag.value;
  if (!d) return null;
  return (
    <div class="ghost" style={{ transform: `translate(${d.x - 28}px, ${d.y - LIFT_PX - 28}px)` }}>
      <TokenSvg n={d.look.n} n2={d.look.n2} species={d.look.species} stars={d.look.stars} relic={d.look.relic} size={56} />
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

function Title() {
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
      <p class="tagline">An auto-battler played on a KenKen page.</p>
      <div class="spacer" />
      <nav class="title-menu">
        {run.value && run.value.phase !== 'won' && run.value.phase !== 'lost' ? (
          <>
            <button class="menu-card primary" onClick={() => (screen.value = 'run')}>
              <span class="mc-title">Continue run</span>
              <span class="mc-sub">Clash {run.value.clash} of {RUN.clashes}, {run.value.life} Life, {run.value.gold} gold.</span>
            </button>
            <button class="menu-card" onClick={() => (sheet.value = { kind: 'confirm-new-run' })}>
              <span class="mc-title">New run</span>
              <span class="mc-sub">Abandon this run and start a fresh page.</span>
            </button>
          </>
        ) : (
          <button class="menu-card primary" onClick={() => { startRun(); screen.value = 'run'; }}>
            <span class="mc-title">New run</span>
            <span class="mc-sub">Fifteen clashes on one page. Draft units, claim cages, seal them in gold.</span>
          </button>
        )}
        <button class="menu-card" onClick={() => (screen.value = 'fight')}>
          <span class="mc-title">First Blood</span>
          <span class="mc-sub">A practice fight: place eight units and watch them fight The Iron Warren.</span>
        </button>
        <button class="menu-card" onClick={() => (screen.value = 'toy')}>
          <span class="mc-title">Page toy</span>
          <span class="mc-sub">The puzzle on its own: fill a generated page until every cage is gold.</span>
        </button>
      </nav>
      <p class="build-note">Milestone 4 of 5. Final art, a first chapter that teaches by playing, and sound come next.</p>
      <div class="bottom-pad" />
    </div>
  );
}

export function App() {
  // Escape closes sheets and drops whatever is in hand.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { sheet.value = null; toySelection.value = null; } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const s = screen.value;
  return (
    <div class="app">
      {s === 'title' ? <Title /> : s === 'toy' ? <ToyScreen /> : s === 'run' ? <RunScreen /> : phase.value === 'plan' ? <PlanScreen /> : <ClashScreen />}
      <Ghost />
      <UpdateNote />
      <Sheets />
    </div>
  );
}
