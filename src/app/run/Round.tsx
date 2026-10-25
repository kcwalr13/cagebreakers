import { useEffect } from 'preact/hooks';
import { TOOLS, type ToolId } from '../../content/balance';
import { cellsOf, describe, readout } from '../../core/commission';
import { type RunState, type Token, TOOL_NAMES, dealtThisRound, inHand, placementOf, tokenAt } from '../../core/run';
import { dismissTip, tip } from '../coach';
import { Icon } from '../Icon';
import type { IconName } from '../icons';
import { type PressHandlers, drag, pressBoard, pressItem, setBoardElement, setHandlers } from '../input';
import { goBack, screen, sheet } from '../nav';
import { PageView, type PieceView } from '../PageView';
import { TokenSvg } from '../Token';
import {
  blocker, blockers, canPutBack, clearPage, dispatch, focus, hints, holding, justPlaced, justSealed, legal, aim, message, met, page,
  placeToken, putBack, refused, revealed, run, say, sealed, selection, useAim, view, weekTurn,
} from './state';

/** How long the new week's card shows over the garden. */
const WEEK_CARD_MS = 1500;

/** The last tap that picked up a number on the page, so a second tap on it can send it home. */
let lastPick = { cell: -1, at: 0 };
const DOUBLE_TAP_MS = 350;

const handlers: PressHandlers = {
  lookAt(cell) {
    const s = run.value;
    if (!s || aim.value) return null;
    const t = tokenAt(s, cell);
    return t ? { n: t.n } : null;
  },
  lookOf(key) {
    const s = run.value;
    const t = s?.tokens.find((x) => x.id === Number(key));
    return s && t && !aim.value ? { n: t.n } : null;
  },
  drop(from, cell) {
    const s = run.value;
    if (!s) return;
    const id = from.kind === 'item' ? Number(from.key) : tokenAt(s, from.cell)?.id;
    if (id !== undefined) placeToken(id, cell);
    selection.value = null;
  },
  dropOff(from) {
    const s = run.value;
    if (s && from.kind === 'cell') { const t = tokenAt(s, from.cell); if (t) placeToken(t.id, -1); }
    selection.value = null;
  },
  tapItem(key) {
    if (aim.value) return;
    const id = Number(key);
    selection.value = selection.value === id ? null : id;
  },
  tapCell(cell) {
    const s = run.value, p = page.value;
    if (!s || !p) return;
    if (aim.value) { useAim(cell); return; }
    const here = tokenAt(s, cell);
    const sel = selection.value;
    if (sel !== null) {
      if (here?.id === sel) {
        // A double tap on a number sends it back to your hand.
        if (lastPick.cell === cell && performance.now() - lastPick.at < DOUBLE_TAP_MS) placeToken(sel, -1);
        lastPick = { cell: -1, at: 0 };
        selection.value = null;
        return;
      }
      if (placeToken(sel, cell)) selection.value = null;
      return;
    }
    if (here) { selection.value = here.id; lastPick = { cell, at: performance.now() }; return; }
    sheet.value = { kind: 'cage', cage: p.cageOf[cell]! };
  },
};

function Ink({ ink, max }: { ink: number; max: number }) {
  return (
    <span class="hud-ink" role="img" aria-label={`${ink} ${ink === 1 ? 'drop' : 'drops'} of water`}>
      {Array.from({ length: Math.max(max, ink) }, (_, i) => <Icon key={i} name="ink" class={`ico drop${i < ink ? '' : ' spent'}`} />)}
    </span>
  );
}

function Hud() {
  const s = run.value!;
  const final = s.round === s.setup.rounds;
  return (
    <header class="header hud-row">
      <button class="icon-btn" aria-label="Back to title" onClick={goBack}><Icon name="back" /></button>
      <span class={`hud-round${weekTurn.value ? ' turned' : ''}`}>{final ? 'Harvest week' : <>Week <b>{s.round}</b> of {s.setup.rounds}</>}</span>
      <Ink ink={s.ink} max={s.setup.startInk} />
      <span class="hud-stat" aria-label={`${s.gold} ${s.gold === 1 ? 'coin' : 'coins'}`}><Icon name="gold" class="ico gold" /><b>{s.gold}</b></span>
      <button class="icon-btn" aria-label="Menu" onClick={() => (sheet.value = { kind: 'menu' })}><Icon name="menu" /></button>
    </header>
  );
}

function Commissions() {
  const s = run.value!, p = page.value!, v = view.value!;
  return (
    <ol class={`commissions${weekTurn.value ? ' arrive' : ''}`} aria-label="This week's requests">
      {s.posted.map((c, i) => {
        const ok = met.value[i];
        const on = focus.value === i;
        return (
          <li key={i} style={`--i:${i}`}>
            <button
              class={`commission${c.required ? ' required' : ''}${ok ? ' met' : ''}${on ? ' focused' : ''}`}
              aria-pressed={on}
              onClick={() => (focus.value = on ? null : i)}
            >
              <span class="cm-check" aria-label={ok ? 'met' : 'not met yet'}>{ok ? <Icon name="check" class="ico" /> : null}</span>
              <span class="cm-text">
                <span class="cm-sentence">{describe(c.c, p)}</span>
                <span class="cm-readout">{readout(c.c, v)}</span>
              </span>
              <span class="cm-tag">
                {c.required
                  ? <><Icon name="ink" class="ico sm ink" />Required</>
                  : <><Icon name="gold" class="ico sm gold" />{c.gold}</>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The new week, announced over the garden once the last week's summary closes: the board looks
 * the same from one week to the next, so this card (with the requests and numbers arriving behind
 * it) is what says a week has passed.
 */
function WeekCard() {
  const t = weekTurn.value;
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => { if (weekTurn.value?.id === t.id) weekTurn.value = null; }, WEEK_CARD_MS);
    return () => clearTimeout(timer);
  }, [t?.id]);
  const s = run.value!;
  if (!t || t.round !== s.round) return null;
  const final = s.round === s.setup.rounds;
  const n = dealtThisRound(s).length;
  const numbers = `${n} ${n === 1 ? 'number' : 'numbers'}`;
  const requests = s.posted.length;
  return (
    <div class="week-card" key={t.id} role="status" aria-live="polite">
      <Icon name="sun" class="ico week-sun" />
      <span class="week-title">{final ? 'Harvest week' : `Week ${s.round}`}</span>
      <span class="week-line">{final ? `The last ${numbers}: fill the garden.` : `${n} new ${n === 1 ? 'number' : 'numbers'}, ${requests} new ${requests === 1 ? 'request' : 'requests'}`}</span>
    </div>
  );
}

/** A tip from the teaching rounds, laid over the bottom of the garden until dismissed. */
function Coach() {
  const t = tip.value;
  if (!t) return null;
  return (
    <div class="coach" role="note" key={t.id} onPointerDown={(e) => e.stopPropagation()}>
      <p>{t.text}</p>
      <button class="pill-btn" onClick={() => dismissTip(t.id)}>Got it</button>
    </div>
  );
}

function Board() {
  const s = run.value!, p = page.value!;
  const d = drag.value;
  const sel = selection.value;
  const movingCell = d?.from.kind === 'cell' ? d.from.cell : -1;
  const pieces: (PieceView | null)[] = new Array(36).fill(null);
  for (const t of s.tokens) {
    if (t.cell < 0) continue;
    pieces[t.cell] = {
      key: `t${t.id}`, n: t.n,
      cls: [justPlaced.value === t.id ? 'stamp' : '', sel === t.id ? 'lifted' : '', movingCell === t.cell ? 'ghosted' : ''].join(' ').trim(),
    };
  }
  const h = holding.value;
  const hover = d && d.over >= 0 && h ? { cell: d.over, ok: d.over === h.origin || !!legal.value?.has(d.over) } : null;
  const f = focus.value;
  const marked = f !== null && s.posted[f] ? new Set(cellsOf(s.posted[f]!.c, p)) : undefined;
  const aimTargets = aim.value === 'lens'
    ? new Set(p.stones.map((v, c) => (!v && !s.revealed.includes(c) && !tokenAt(s, c) ? c : -1)).filter((c) => c >= 0))
    : aim.value === 'eraser' ? new Set(p.stones.map((v, c) => (v ? c : -1)).filter((c) => c >= 0)) : undefined;
  return (
    <div class="board-wrap" onPointerDown={(e) => pressBoard(e as unknown as PointerEvent)}>
      <Coach />
      <WeekCard />
      <PageView
        id="run" svgRef={setBoardElement} page={p} pieces={pieces} sealed={sealed.value} flashing={justSealed.value}
        hints={aim.value ? undefined : hints.value} blockers={aim.value ? undefined : blockers.value} hover={hover} refused={refused.value}
        revealed={revealed.value} targets={aimTargets} marked={marked}
        label={`Your garden: ${s.tokens.filter((t) => t.cell >= 0).length} numbers planted, ${sealed.value.size} of ${p.cages.length} plots in bloom`}
      />
    </div>
  );
}

function Status() {
  const s = run.value!;
  const m = message.value;
  if (m) return <div class={`status${m.warn ? ' warn' : ''}`} role="status" key={m.id}>{m.text}</div>;
  if (aim.value) {
    return (
      <div class="status">
        <span><Icon name={aim.value} class="ico inline-ico" /> {aim.value === 'lens' ? 'Tap an empty cell to see its hidden number.' : 'Tap a printed number to lift it into your hand.'}</span>
        <button class="pill-btn" onClick={() => (aim.value = null)}>Cancel</button>
      </div>
    );
  }
  const h = holding.value;
  if (h) {
    const open = legal.value?.size ?? 0;
    const lifting = h.origin >= 0 && selection.value === h.id;
    return (
      <div class="status holding">
        <span>{open
          ? <>Bright squares take the <b>{h.n}</b>. Shaded ones have a {h.n} in their row or column.</>
          : <>No square can take the <b>{h.n}</b> right now. Move one of the ringed {h.n}s first.</>}</span>
        {lifting ? <button class="pill-btn" onClick={() => { placeToken(h.id, -1); selection.value = null; }}>To hand</button> : null}
      </div>
    );
  }
  return (
    <div class="status with-action">
      <span role="status">{roundStatus(s, blocker.value)}</span>
      {canPutBack.value
        ? <button class="pill-btn page-all" onClick={putBack}>Put back</button>
        : <button class="pill-btn page-all" disabled={!s.tokens.some((t) => t.cell >= 0)} onClick={clearPage}>Pick up all</button>}
    </div>
  );
}

/** What the round still needs before it can be inked, in plain words. */
function roundStatus(s: RunState, why: string | null): string {
  const p = placementOf(s);
  if (s.round === s.setup.rounds) return why ? `${why} to fill the garden.` : 'The garden is full. Harvest it.';
  const bonus = `${p.bonus} bonus ${p.bonus === 1 ? 'coin' : 'coins'}`;
  if (why) return `${why}, or all ${p.hand.length} for ${bonus}.`;
  if (p.full) return `Every number is planted: ${bonus} when you water.`;
  return `Ready to water. Keep the ${p.hand[0]} for later, or plant it for ${bonus}.`;
}

/** Numbers in hand grouped by value, smallest first. */
function stacks(hand: readonly Token[]): [number, Token[]][] {
  const by = new Map<number, Token[]>();
  for (const t of hand) by.set(t.n, [...(by.get(t.n) ?? []), t]);
  return [...by].sort((a, b) => a[0] - b[0]);
}

function Hand() {
  const s = run.value!;
  const hand = inHand(s);
  const sel = selection.value;
  const dealing = !!weekTurn.value;
  return (
    <div class="hand" role="toolbar" aria-label="Your numbers to plant">
      <div class="hand-tokens">
        {stacks(hand).map(([n, ts], i) => {
          // Equal numbers share one stack; pressing it takes one of them.
          const t = ts.find((x) => x.id === sel) ?? ts[0]!;
          return (
            <button
              key={n}
              class={`hand-slot${sel === t.id ? ' selected' : ''}${dealing ? ' dealt' : ''}`}
              style={`--i:${i}`}
              data-count={ts.length}
              aria-label={ts.length > 1 ? `Number ${n}, ${ts.length} in your basket` : `Number ${n}`}
              aria-pressed={sel === t.id}
              onPointerDown={(e) => pressItem(e as unknown as PointerEvent, String(t.id))}
            >
              <TokenSvg n={n} size={46} />
              {ts.length > 1 ? <span class="hand-count" aria-hidden="true">×{ts.length}</span> : null}
            </button>
          );
        })}
        {!hand.length ? <span class="hand-empty">Every number is planted. Double-tap one to pick it up.</span> : null}
      </div>
    </div>
  );
}

export const TOOL_ICON: Record<ToolId, IconName> = {
  lens: 'lens', quill: 'quill', gilder: 'gilder', eraser: 'eraser', inkwell: 'inkwell',
};
const TOOL_NAME = TOOL_NAMES;

function Controls() {
  const s = run.value!;
  const final = s.round === s.setup.rounds;
  const tools = s.setup.tools;
  const ink = () => {
    const why = blocker.value;
    if (why) { say(`${why}.`, true); return; }
    selection.value = null; aim.value = null;
    dispatch({ type: 'ink' });
  };
  return (
    <div class={`run-controls${tools.length > 3 ? ' four' : ''}`}>
      {tools.map((tool) => (
        <button
          key={tool}
          class={`btn tool${tool === 'gilder' && s.gilded ? ' toggled' : ''}`}
          aria-label={`${TOOL_NAME[tool]}, ${TOOLS[tool]} coins`}
          onClick={() => { aim.value = null; sheet.value = { kind: 'tool', tool }; }}
        >
          <span class="tool-top"><Icon name={TOOL_ICON[tool]} /><span class="tool-cost"><Icon name="gold" class="ico gold xs" />{TOOLS[tool]}</span></span>
          <span class="tool-name">{TOOL_NAME[tool]}</span>
        </button>
      ))}
      <button class={`btn primary grow${blocker.value ? ' waiting' : ''}`} onClick={ink}>
        <Icon name="ink" />{final ? 'Harvest' : 'Water it'}
      </button>
    </div>
  );
}

export function RoundScreen() {
  useEffect(() => { setHandlers(handlers); return () => setHandlers(null); }, []);
  const s = run.value;
  if (!s) return null;
  return (
    <div class="column run">
      <Hud />
      <Commissions />
      <Board />
      <Status />
      <Hand />
      <Controls />
      <div class="bottom-pad" />
    </div>
  );
}
