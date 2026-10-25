import { TOOLS, type ToolId } from '../../content/balance';
import { describe } from '../../core/commission';
import { TOOL_NAMES, act, bagCount, scoreOf, tokenAt } from '../../core/run';
import { Icon } from '../Icon';
import { goBack, screen, sheet } from '../nav';
import { PageView, type PieceView } from '../PageView';
import { RoundScreen, TOOL_ICON } from './Round';
import { aim, dailyBest, dailyParts, dispatch, lastInk, page, run, sealed, startDaily, startStation } from './state';
import { lastSettled } from '../meta';
import { stationById } from '../../content/stations';

function Close() {
  return <button class="icon-btn" onClick={() => (sheet.value = null)} aria-label="Close"><Icon name="close" /></button>;
}

/** What each tool does, in one or two plain sentences. */
export const TOOL_TEXT: Record<ToolId, string> = {
  lens: 'Shows the right number for one empty square, the one it holds in the finished garden. It stays shown until harvest.',
  quill: 'Draws one extra number this week.',
  gilder: 'This week, every blooming plot pays double when you water.',
  eraser: 'Digs up one stone and makes it one of your numbers: it stays where it is, and can move like any other.',
  inkwell: 'Refills one drop of water, up to what your can held at the start.',
};

const TOOL_LABEL: Record<ToolId, string> = {
  lens: 'Choose a square', quill: 'Draw a number', gilder: 'Double this week',
  eraser: 'Choose a stone', inkwell: 'Refill a drop',
};

export function ToolSheet({ tool }: { tool: ToolId }) {
  const s = run.value, p = page.value;
  if (!s || !p) return null;
  const cost = TOOLS[tool];
  // Try the tool first (the rules are pure), so a refusal is explained before any gold changes hands.
  const instant = tool !== 'lens' && tool !== 'eraser' && s.gold >= cost ? act(s, { type: tool }) : null;
  const empty = p.stones.map((_, c) => c).filter((c) => !p.stones[c] && !tokenAt(s, c) && !s.revealed.includes(c)).length;
  const printed = p.stones.filter(Boolean).length;
  const why = s.gold < cost ? `You have ${s.gold} ${s.gold === 1 ? 'coin' : 'coins'}.`
    : tool === 'lens' && !empty ? 'There is no empty square left to look at.'
        : tool === 'eraser' && !printed ? 'There are no stones left to dig up.'
          : instant && !instant.ok ? `${instant.reason}.` : null;
  const buy = () => {
    if (tool === 'lens' || tool === 'eraser') { aim.value = tool; sheet.value = null; return; }
    if (dispatch({ type: tool })) sheet.value = null;
  };
  const label = TOOL_LABEL[tool];
  return (
    <>
      <div class="sheet-head"><h2><Icon name={TOOL_ICON[tool]} class="ico inline-ico big" /> {TOOL_NAMES[tool]}</h2><Close /></div>
      <p>{TOOL_TEXT[tool]}</p>
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
  const title = s.phase === 'done' ? 'Harvest!' : s.phase === 'ruined' ? 'The garden dried out' : `Week ${r.round} watered`;
  const gained = r.bountyGold + r.sealGold + r.fullHandGold;
  const choice = r.round < s.setup.rounds;
  return (
    <>
      <div class="sheet-head"><h2 class={`verdict${s.phase === 'ruined' ? ' lost' : ''}`}>{title}</h2></div>
      <ul class="ink-lines">
        {li.posted.map((c, i) => {
          const ok = li.met[i];
          const outcome = c.required
            ? (ok ? 'Met' : 'Missed: a drop of water dried up')
            : (ok ? `+${c.gold} ${c.gold === 1 ? 'coin' : 'coins'}` : 'Not met');
          return (
            <li key={i} class={`${ok ? 'ok' : c.required ? 'miss' : 'no'}`}>
              <span class="il-mark">{ok ? <Icon name="check" class="ico" /> : c.required ? <Icon name="spill" class="ico" /> : null}</span>
              <span class="il-text"><span>{describe(c.c, p)}</span><span class="il-out">{outcome}</span></span>
            </li>
          );
        })}
        <li class={r.seals ? 'ok' : 'no'}>
          <span class="il-mark"><Icon name="seal" class="ico" /></span>
          <span class="il-text"><span>{r.seals} {r.seals === 1 ? 'plot' : 'plots'} in bloom</span><span class="il-out">{r.seals ? `+${r.sealGold} ${r.sealGold === 1 ? 'coin' : 'coins'}` : 'No blooms this week'}</span></span>
        </li>
        {choice ? (
          <li class={r.fullHand ? 'ok' : 'no'}>
            <span class="il-mark">{r.fullHand ? <Icon name="check" class="ico" /> : null}</span>
            <span class="il-text">
              <span>{r.fullHand ? 'Every number planted' : `Kept back: the ${li.spare.join(' and ')}, dealt again later`}</span>
              <span class="il-out">{r.fullHand ? `+${r.fullHandGold} ${r.fullHandGold === 1 ? 'coin' : 'coins'}` : 'No bonus'}</span>
            </span>
          </li>
        ) : null}
      </ul>
      <p class="ink-total">
        {gained ? <>+{gained} {gained === 1 ? 'coin' : 'coins'} this week. </> : null}
        {s.phase === 'ruined' ? 'No water left.' : `${s.ink} ${s.ink === 1 ? 'drop' : 'drops'} of water left.`}
        {!over && s.round < s.setup.rounds ? ` ${bagCount(s.bag)} numbers still to come.` : null}
      </p>
      <div class="row-btns">
        <button class="btn primary wide" onClick={() => (sheet.value = null)}>{over ? 'See the garden' : s.round === s.setup.rounds ? 'On to harvest week' : `On to week ${s.round}`}</button>
      </div>
    </>
  );
}

/** What the garden earned in seeds for the Potting Shed, and what it opened. */
function LeafPanel() {
  const s = run.value!, st = lastSettled.value;
  if (!st || st.id !== s.id) return null;
  const r = st.reward;
  return (
    <div class="leaf-panel" role="status">
      <div class="leaf-earned"><Icon name="leaf" class="ico leaf" /><b>+{r.leaf}</b> {r.leaf === 1 ? 'seed' : 'seeds'}</div>
      <div class="muted-sm">
        {r.fromScore ? `${r.fromScore} for your ${s.phase === 'done' ? 'score' : 'coins'}` : s.phase === 'ruined' ? 'A dried-out garden saves a few seeds, for the coins you kept' : ''}
        {r.fromStars ? `, ${r.fromStars} for ${r.newStars === 1 ? 'a new star' : `${r.newStars} new stars`}` : ''}
      </div>
      {s.setup.station && r.stars ? (
        <div class="leaf-stars" aria-label={`${r.stars} of 3 stars`}>
          {[1, 2, 3].map((i) => <Icon key={i} name="star" class={`ico star${i <= r.stars ? ' on' : ''}`} />)}
        </div>
      ) : null}
      {st.opened.length ? <div class="leaf-news">Opened on the map: {st.opened.map((id) => stationById(id)!.name).join(' and ')}.</div> : null}
      {st.forSale.length ? <div class="leaf-news">New in the Potting Shed: {st.forSale.length} {st.forSale.length === 1 ? 'thing' : 'things'} to buy.</div> : null}
    </div>
  );
}

function RunSummary() {
  const s = run.value!, p = page.value!;
  const score = scoreOf(s);
  const done = s.phase === 'done';
  const pieces: (PieceView | null)[] = new Array(p.stones.length).fill(null);
  for (const t of s.tokens) if (t.cell >= 0) pieces[t.cell] = { key: `t${t.id}`, n: t.n };
  const best = s.daily ? dailyBest.value[s.daily] : undefined;
  const station = s.setup.station ? stationById(s.setup.station) : undefined;
  const daily = s.daily ? dailyParts(s.daily) : null;
  return (
    <div class="column summary">
      <header class="header"><button class="icon-btn" aria-label="Back to title" onClick={goBack}><Icon name="back" /></button><div class="title">{station ? <span class="title-page">{station.name}</span> : null}</div></header>
      <div class={`summary-verdict ${done ? 'won' : 'lost'}`}>
        <h1>{done ? 'Harvest!' : `Dried out in week ${s.records.length}`}</h1>
        <p class="score"><b>{score.total}</b> points</p>
        <p class="muted-sm">{done ? `${score.gold} coins kept, plus ${score.ink} ${score.ink === 1 ? 'drop' : 'drops'} of water × ${s.setup.inkBonus}.` : `${score.gold} coins kept. A dried-out garden earns no water bonus.`}</p>
      </div>
      <LeafPanel />
      <div class="summary-page">
        <PageView id="summary" page={p} pieces={pieces} sealed={sealed.value} label={`Your finished garden: ${sealed.value.size} of ${p.cages.length} plots in bloom`} />
      </div>
      <table class="records">
        <thead><tr><th>Week</th><th>Required</th><th>Bonus</th><th>Coins</th></tr></thead>
        <tbody>
          {s.records.map((r) => (
            <tr key={r.round}>
              <td>{r.round}</td>
              <td class={r.required === false ? 'miss' : ''}>{r.required === null ? '–' : r.required ? 'met' : 'missed'}</td>
              <td>{r.bounties}</td>
              <td>+{r.bountyGold + r.sealGold + r.fullHandGold}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="muted-sm center">
        {daily ? `${daily.size}×${daily.size} Daily Garden for ${daily.day}${best ? `. Your best today: ${best.score}` : ''}. ` : ''}Garden code {s.seed}.
      </p>
      <div class="spacer" />
      {s.daily ? (
        <div class="row-btns">
          <button class="btn primary grow" onClick={() => startDaily(daily!.day, true, daily!.size)}>Grow today's garden again</button>
          <button class="btn" onClick={() => (screen.value = 'title')}>Title</button>
        </div>
      ) : (
        <div class="row-btns">
          <button class="btn primary grow" onClick={() => (screen.value = 'map')}><Icon name="map" />Back to the map</button>
          {station ? <button class="btn" onClick={() => startStation(station.id)}>Again</button> : null}
        </div>
      )}
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

