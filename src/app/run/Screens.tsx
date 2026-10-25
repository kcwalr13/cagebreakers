import { RUN, TOOLS, type ToolId } from '../../content/balance';
import { describe } from '../../core/commission';
import { CELLS } from '../../core/grid';
import { act, dealtThisRound, scoreOf, tokenAt } from '../../core/run';
import { Icon } from '../Icon';
import { screen, sheet } from '../nav';
import { PageView, type PieceView } from '../PageView';
import { RoundScreen } from './Round';
import { dailyBest, dispatch, lastInk, lensMode, page, run, sealed, startDaily, startRun } from './state';

function Close() {
  return <button class="icon-btn" onClick={() => (sheet.value = null)} aria-label="Close"><Icon name="close" /></button>;
}

const TOOL_TEXT: Record<ToolId, { name: string; text: string }> = {
  redraw: { name: 'Redraw', text: "Swaps the numbers in your hand that were dealt this round for different ones from those still to come. Numbers on the page stay put. Your new numbers always keep all three commissions possible together." },
  lens: { name: 'Lens', text: "Shows the number the hidden solution has in one empty cell. It stays shown for the rest of the run." },
  blotter: { name: 'Blotter', text: "For this round only: missing the required commission spills no ink." },
};

export function ToolSheet({ tool }: { tool: ToolId }) {
  const s = run.value, p = page.value;
  if (!s || !p) return null;
  const cost = TOOLS[tool];
  const loose = dealtThisRound(s).filter((t) => t.cell < 0).length;
  // A redraw is refused when no new numbers would keep the commissions' promises; find out before offering it.
  const trial = tool === 'redraw' && loose && s.gold >= cost ? act(s, { type: 'redraw' }) : null;
  const empty = Array.from({ length: CELLS }, (_, c) => c).filter((c) => !p.stones[c] && !tokenAt(s, c) && !s.revealed.includes(c)).length;
  const why = s.gold < cost ? `You have ${s.gold} gold.`
    : tool === 'redraw' && !loose ? 'Every number dealt this round is on the page. Lift some into your hand to redraw them.'
      : tool === 'blotter' && s.blotter ? 'The Blotter is already down this round.'
        : tool === 'lens' && !empty ? 'There is no empty cell left to look at.'
          : trial && !trial.ok ? `${trial.reason}, so this round's numbers stay.` : null;
  const buy = () => {
    if (tool === 'lens') { lensMode.value = true; sheet.value = null; return; }
    if (dispatch({ type: tool })) sheet.value = null;
  };
  const label = tool === 'redraw' ? `Redraw ${loose} ${loose === 1 ? 'number' : 'numbers'}` : tool === 'lens' ? 'Choose a cell' : 'Put the Blotter down';
  return (
    <>
      <div class="sheet-head"><h2>{TOOL_TEXT[tool].name}</h2><Close /></div>
      <p>{TOOL_TEXT[tool].text}</p>
      <div class="row-btns">
        <button class="btn primary" disabled={!!why} onClick={buy}><Icon name="gold" />{label} for {cost}</button>
      </div>
      {why ? <p class="muted-sm">{why}</p> : null}
    </>
  );
}

/** What the round just inked earned and cost. */
export function RoundSheet() {
  const li = lastInk.value, s = run.value, p = page.value;
  if (!li || !s || !p) return null;
  const r = li.record;
  const over = s.phase !== 'arrange';
  const title = s.phase === 'done' ? 'The page is full' : s.phase === 'ruined' ? 'The page is ruined' : r.round === RUN.rounds ? 'Finished' : `Round ${r.round} inked`;
  const gained = r.bountyGold + r.sealGold;
  return (
    <>
      <div class="sheet-head"><h2 class={`verdict${s.phase === 'ruined' ? ' lost' : ''}`}>{title}</h2></div>
      <ul class="ink-lines">
        {li.posted.map((c, i) => {
          const ok = li.met[i];
          const outcome = c.required
            ? (ok ? 'Met' : r.blotted ? 'Missed, but the Blotter kept your ink' : 'Missed: a drop of ink spilled')
            : (ok ? `+${c.gold} gold` : 'Not met');
          return (
            <li key={i} class={`${ok ? 'ok' : c.required ? 'miss' : 'no'}`}>
              <span class="il-mark">{ok ? <Icon name="check" class="ico" /> : c.required && !r.blotted ? <Icon name="spill" class="ico" /> : null}</span>
              <span class="il-text"><span>{describe(c.c, p)}</span><span class="il-out">{outcome}</span></span>
            </li>
          );
        })}
        <li class={r.seals ? 'ok' : 'no'}>
          <span class="il-mark"><Icon name="seal" class="ico" /></span>
          <span class="il-text"><span>{r.seals} {r.seals === 1 ? 'cage' : 'cages'} sealed</span><span class="il-out">{r.seals ? `+${r.sealGold} gold` : 'No seals this round'}</span></span>
        </li>
      </ul>
      {li.spare.length ? <p class="muted-sm">{li.spare.length === 1 ? `Your spare ${li.spare[0]} comes back in a later round.` : `Your spare ${li.spare.join(' and ')} come back in later rounds.`}</p> : null}
      <p class="ink-total">
        {gained ? <>+{gained} gold this round. </> : null}
        {s.phase === 'ruined' ? 'No ink left.' : `${s.ink} ${s.ink === 1 ? 'drop' : 'drops'} of ink left.`}
      </p>
      <div class="row-btns">
        <button class="btn primary wide" onClick={() => (sheet.value = null)}>{over ? 'See the run' : s.round === RUN.rounds ? 'On to the final round' : `On to round ${s.round}`}</button>
      </div>
    </>
  );
}

function RunSummary() {
  const s = run.value!, p = page.value!;
  const score = scoreOf(s);
  const done = s.phase === 'done';
  const pieces: (PieceView | null)[] = new Array(CELLS).fill(null);
  for (const t of s.tokens) if (t.cell >= 0) pieces[t.cell] = { key: `t${t.id}`, n: t.n };
  const best = s.daily ? dailyBest.value[s.daily] : undefined;
  return (
    <div class="column summary">
      <header class="header"><button class="icon-btn" aria-label="Back to title" onClick={() => (screen.value = 'title')}><Icon name="back" /></button><div class="title" /></header>
      <div class={`summary-verdict ${done ? 'won' : 'lost'}`}>
        <h1>{done ? 'The page is full' : `Ruined in round ${s.records.length}`}</h1>
        <p class="score"><b>{score.total}</b> points</p>
        <p class="muted-sm">{done ? `${score.gold} gold kept, plus ${score.ink} ${score.ink === 1 ? 'drop' : 'drops'} of ink × ${RUN.inkBonus}.` : `${score.gold} gold kept. A ruined page earns no ink bonus.`}</p>
      </div>
      <div class="summary-page">
        <PageView id="summary" page={p} pieces={pieces} sealed={sealed.value} label={`Your finished page: ${sealed.value.size} of ${p.cages.length} cages sealed`} />
      </div>
      <table class="records">
        <thead><tr><th>Round</th><th>Required</th><th>Bounties</th><th>Gold</th></tr></thead>
        <tbody>
          {s.records.map((r) => (
            <tr key={r.round}>
              <td>{r.round}</td>
              <td class={r.required === false ? (r.blotted ? 'soft' : 'miss') : ''}>{r.required === null ? '–' : r.required ? 'met' : r.blotted ? 'blotted' : 'missed'}</td>
              <td>{r.bounties}</td>
              <td>+{r.bountyGold + r.sealGold}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="muted-sm center">
        {s.daily ? `Daily Page for ${s.daily}${best ? `. Your best today: ${best.score}` : ''}. ` : ''}Run code {s.seed}.
      </p>
      <div class="spacer" />
      {s.daily ? (
        <div class="row-btns">
          <button class="btn primary grow" onClick={() => startDaily(s.daily, true)}>Play today's page again</button>
          <button class="btn" onClick={() => (screen.value = 'title')}>Title</button>
        </div>
      ) : <button class="btn primary wide" onClick={() => startRun()}>New run</button>}
      <div class="bottom-pad" />
    </div>
  );
}

export function RunScreen() {
  const s = run.value;
  if (!s) { screen.value = 'title'; return null; }
  if (s.phase !== 'arrange') return <RunSummary />;
  return <RoundScreen />;
}

