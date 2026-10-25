import { useEffect } from 'preact/hooks';
import { TOOLS, type ToolId } from '../../content/balance';
import { cellsOf, describe, readout } from '../../core/commission';
import { type RunState, TOOL_NAMES, bagCount, inHand, placementOf, tokenAt } from '../../core/run';
import { dismissTip, tip } from '../coach';
import { Icon } from '../Icon';
import type { IconName } from '../icons';
import { type PressHandlers, drag, pressBoard, pressItem, setBoardElement, setHandlers } from '../input';
import { screen, sheet } from '../nav';
import { PageView, type PieceView } from '../PageView';
import { TokenSvg } from '../Token';
import {
  blocker, blockers, dispatch, focus, hints, holding, justPlaced, justSealed, legal, aim, message, met, page, placeToken, refused,
  revealed, run, say, sealed, selection, useAim, view,
} from './state';

const handlers: PressHandlers = {
  lookAt(cell) {
    const s = run.value;
    if (!s || aim.value) return null;
    const t = tokenAt(s, cell);
    return t ? { n: t.n, fresh: t.round === s.round } : null;
  },
  lookOf(key) {
    const s = run.value;
    const t = s?.tokens.find((x) => x.id === Number(key));
    return s && t && !aim.value ? { n: t.n, fresh: t.round === s.round } : null;
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
      if (here?.id === sel) { selection.value = null; return; }
      if (placeToken(sel, cell)) selection.value = null;
      return;
    }
    if (here) { selection.value = here.id; return; }
    sheet.value = { kind: 'cage', cage: p.cageOf[cell]! };
  },
};

function Ink({ ink, max }: { ink: number; max: number }) {
  return (
    <span class="hud-ink" role="img" aria-label={`${ink} ${ink === 1 ? 'drop' : 'drops'} of ink`}>
      {Array.from({ length: Math.max(max, ink) }, (_, i) => <Icon key={i} name="ink" class={`ico drop${i < ink ? '' : ' spent'}`} />)}
    </span>
  );
}

function Hud() {
  const s = run.value!;
  const final = s.round === s.setup.rounds;
  return (
    <header class="header hud-row">
      <button class="icon-btn" aria-label="Back to title" onClick={() => (screen.value = 'title')}><Icon name="back" /></button>
      <span class="hud-round">{final ? 'Final round' : <>Round <b>{s.round}</b> of {s.setup.rounds}</>}</span>
      <Ink ink={s.ink} max={s.setup.startInk} />
      <span class="hud-stat" aria-label={`${s.gold} gold`}><Icon name="gold" class="ico gold" /><b>{s.gold}</b></span>
      <button class="icon-btn" aria-label="Menu" onClick={() => (sheet.value = { kind: 'menu' })}><Icon name="menu" /></button>
    </header>
  );
}

function Commissions() {
  const s = run.value!, p = page.value!, v = view.value!;
  return (
    <ol class="commissions" aria-label="This round's commissions">
      {s.posted.map((c, i) => {
        const ok = met.value[i];
        const on = focus.value === i;
        return (
          <li key={i}>
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
                  ? (s.blotter ? <><Icon name="blotter" class="ico sm" />Blotted</> : <><Icon name="ink" class="ico sm ink" />Required</>)
                  : <><Icon name="gold" class="ico sm gold" />{c.gold}</>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** A tip from the teaching rounds, laid over the bottom of the page until dismissed. */
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
      key: `t${t.id}`, n: t.n, fresh: t.round === s.round,
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
      <PageView
        id="run" svgRef={setBoardElement} page={p} pieces={pieces} sealed={sealed.value} flashing={justSealed.value}
        hints={aim.value ? undefined : hints.value} blockers={aim.value ? undefined : blockers.value} hover={hover} refused={refused.value}
        revealed={revealed.value} targets={aimTargets} marked={marked}
        label={`Your page: ${s.tokens.filter((t) => t.cell >= 0).length} numbers placed, ${sealed.value.size} of ${p.cages.length} cages sealed`}
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
          ? <>Bright cells take the <b>{h.n}</b>. Shaded ones have a {h.n} in their row or column.</>
          : <>No cell can take the <b>{h.n}</b> right now. Move one of the ringed {h.n}s first.</>}</span>
        {lifting ? <button class="pill-btn" onClick={() => { placeToken(h.id, -1); selection.value = null; }}>To hand</button> : null}
      </div>
    );
  }
  const meter = placementOf(s).bonus > 0;
  return (
    <div class={`status${meter ? ' with-meter' : ''}`} role="status">
      <span>{roundStatus(s, blocker.value)}</span>
      {meter ? <DealMeter /> : null}
    </div>
  );
}

const listOf = (ns: readonly number[]) => (ns.length < 2 ? `${ns[0]}` : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`);

/** What the round still needs before it can be inked, in plain words. */
function roundStatus(s: RunState, why: string | null): string {
  const p = placementOf(s);
  if (s.round === s.setup.rounds) return why ? `${why} to fill the page.` : 'The page is full. Finish the run.';
  if (p.strays.length) return `${why}.${p.placed > p.need ? ` Only ${p.need} of your ${p.dealt} new ones must stay.` : ''}`;
  if (why) return `${why}.`;
  if (p.full || !p.bonus) return 'Ready to ink, with every new number placed.';
  const spare = inHand(s).filter((t) => t.round === s.round).map((t) => t.n).sort((a, b) => a - b);
  return `Ready to ink. Your spare ${listOf(spare)} ${spare.length === 1 ? 'goes' : 'go'} back for later.`;
}

/** New numbers placed this round: the first ones are needed, the rest earn the full-hand bonus. */
function DealMeter() {
  const s = run.value!;
  const p = placementOf(s);
  const explain = () => say(`Place at least ${p.need} of your ${p.dealt} new numbers to ink. Place all ${p.dealt} and the round pays ${p.bonus} more gold. Any you keep go back for a later round.`, false, 5000);
  return (
    <button
      class={`deal-meter${p.full ? ' full' : ''}`}
      aria-label={`${p.placed} of ${p.dealt} new numbers placed. Placing all ${p.dealt} pays ${p.bonus} more gold.`}
      onClick={explain}
    >
      <span class="dm-pips" aria-hidden="true">
        {Array.from({ length: p.dealt }, (_, i) => (
          <i key={i} class={[i < p.placed ? 'on' : '', i >= p.need ? 'extra' : '', i === p.need ? 'gap' : ''].join(' ').trim()} />
        ))}
      </span>
      <span class="dm-bonus" aria-hidden="true"><Icon name="gold" class="ico gold xs" />+{p.bonus}</span>
    </button>
  );
}

function Hand() {
  const s = run.value!;
  const hand = inHand(s);
  const sel = selection.value;
  const toCome = bagCount(s.bag);
  return (
    <div class="hand" role="toolbar" aria-label="Your numbers">
      <div class="hand-tokens">
        {hand.map((t) => {
          const fresh = t.round === s.round;
          return (
            <button
              key={t.id}
              class={`hand-slot${sel === t.id ? ' selected' : ''}${fresh ? '' : ' stray'}`}
              aria-label={fresh ? `New number ${t.n}` : `Inked number ${t.n}: it must go back on the page`}
              aria-pressed={sel === t.id}
              onPointerDown={(e) => pressItem(e as unknown as PointerEvent, String(t.id))}
            >
              <TokenSvg n={t.n} size={46} fresh={fresh} />
            </button>
          );
        })}
        {!hand.length ? <span class="hand-empty">All your numbers are on the page.</span> : null}
      </div>
      {s.round < s.setup.rounds ? (
        <span class="hand-bag" aria-label={`${toCome} more numbers to come in later rounds`}>{toCome}<small>to come</small></span>
      ) : null}
    </div>
  );
}

export const TOOL_ICON: Record<ToolId, IconName> = {
  redraw: 'redraw', lens: 'lens', blotter: 'blotter', quill: 'quill', gilder: 'gilder', eraser: 'eraser', inkwell: 'inkwell',
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
          class={`btn tool${(tool === 'blotter' && s.blotter) || (tool === 'gilder' && s.gilded) ? ' toggled' : ''}`}
          aria-label={`${TOOL_NAME[tool]}, ${TOOLS[tool]} gold`}
          onClick={() => { aim.value = null; sheet.value = { kind: 'tool', tool }; }}
        >
          <span class="tool-top"><Icon name={TOOL_ICON[tool]} /><span class="tool-cost"><Icon name="gold" class="ico gold xs" />{TOOLS[tool]}</span></span>
          <span class="tool-name">{TOOL_NAME[tool]}</span>
        </button>
      ))}
      <button class={`btn primary grow${blocker.value ? ' waiting' : ''}`} onClick={ink}>
        <Icon name="ink" />{final ? 'Finish' : 'Ink it'}
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
