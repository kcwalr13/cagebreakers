/**
 * The journal: the daily streak, and goals to aim for, each worth seeds once claimed. The rules
 * come from src/core/meta.ts.
 */
import { DAILY, GOALS } from '../content/journal';
import { dayNumber, dayOf } from '../core/calendar';
import { goalProgress, goalState, streakNow } from '../core/meta';
import { Icon } from './Icon';
import { claim, profile, ready } from './meta';
import { today } from './run/state';
import { Header, Tip } from './Scriptorium';
import { play } from './sound';

const WEEKDAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** The last fortnight's Daily Gardens: a mark for each day played, and the day a grace day covered. */
function StreakDays() {
  const p = profile.value;
  const now = dayNumber(today());
  const days = Array.from({ length: 14 }, (_, i) => dayOf(now - 13 + i));
  return (
    <div class="streak-days" role="img" aria-label={`Daily Gardens over the last two weeks: ${days.filter((d) => p.daily.done[d]?.length).length} days played`}>
      {days.map((d) => {
        const n = p.daily.done[d]?.length ?? 0;
        const grace = p.daily.grace === d;
        return (
          <span key={d} class={`sd${n ? ' on' : ''}${n === 4 ? ' four' : ''}${grace ? ' grace' : ''}${d === today() ? ' today' : ''}`}>
            <small>{WEEKDAY[(dayNumber(d) + 3) % 7]}</small>
            <i>{n === 4 ? <Icon name="star" class="ico" /> : n ? <Icon name="check" class="ico" /> : grace ? '·' : ''}</i>
          </span>
        );
      })}
    </div>
  );
}

export function JournalScreen() {
  const p = profile.value;
  const streak = streakNow(p.daily, today());
  const order = { ready: 0, open: 1, claimed: 2 } as const;
  const goals = GOALS.map((g) => ({ g, state: goalState(p, g), have: goalProgress(p, g) }))
    .sort((a, b) => order[a.state] - order[b.state] || b.have / b.g.of - a.have / a.g.of);
  return (
    <div class="column journal-screen">
      <Header title="Journal" sub={ready.value ? `${ready.value} ${ready.value === 1 ? 'goal' : 'goals'} to claim` : `${p.journal.length} of ${GOALS.length} goals claimed`} />
      <div class="scroll">
        <section class="streak-card">
          <div class="streak-head">
            <Icon name="flame" class={`ico flame${streak ? ' lit' : ''}`} />
            <div>
              <div class="streak-title">{streak ? `${streak}-day streak` : 'No streak yet'}</div>
              <div class="muted-sm">Best {p.daily.best} {p.daily.best === 1 ? 'day' : 'days'}. Each day you finish a Daily Garden keeps it growing; one missed day a week is forgiven.</div>
            </div>
          </div>
          <StreakDays />
          <p class="muted-sm">Each Daily Garden pays {DAILY.seeds} seeds; the first each day pays {DAILY.perStreakDay} more for every day of your streak (up to {DAILY.streakCap}), and all four in a day pay {DAILY.allFour} more.</p>
        </section>
        <ul class="goals">
          {goals.map(({ g, state, have }) => (
            <li key={g.id} class={`goal ${state}`}>
              <span class="goal-mark">{state === 'claimed' ? <Icon name="check" class="ico" /> : <Icon name="journal" class="ico" />}</span>
              <span class="goal-text">
                <span class="goal-name">{g.name}</span>
                <span class="muted-sm">{g.text}</span>
                {state === 'open' && g.of > 1 ? (
                  <span class="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={g.of} aria-valuenow={Math.min(have, g.of)} aria-label={`${Math.min(have, g.of)} of ${g.of}`}>
                    <i style={{ width: `${(100 * Math.min(have, g.of)) / g.of}%` }} /><small>{Math.min(have, g.of)} of {g.of}</small>
                  </span>
                ) : null}
              </span>
              {state === 'ready' ? (
                <button class="pill-btn buy" aria-label={`Claim ${g.name}: ${g.reward} seeds`} onClick={() => { if (!claim(g.id)) play('win'); }}>
                  <Icon name="leaf" class="ico leaf xs" />+{g.reward}
                </button>
              ) : <span class="goal-reward"><Icon name="leaf" class="ico leaf xs" />{g.reward}</span>}
            </li>
          ))}
        </ul>
      </div>
      <Tip id="journal" />
      <div class="bottom-pad" />
    </div>
  );
}
