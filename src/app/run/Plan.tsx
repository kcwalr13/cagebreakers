import { useEffect } from 'preact/hooks';
import { RUN } from '../../content/balance';
import { speciesById } from '../../content/species';
import { tallyTraits } from '../../core/clash';
import { onBench, onBoard, sellValue, toSpecs } from '../../core/run';
import { traitName } from '../cards';
import { Icon } from '../Icon';
import type { IconName } from '../icons';
import { type PressHandlers, drag, pressBoard, pressItem, setBoardElement, setHandlers } from '../input';
import { screen, sheet } from '../nav';
import { PageView, type PieceView } from '../PageView';
import { TokenSvg } from '../Token';
import {
  armyCount, armyLimit, benchUnits, dispatch, hints, isLegal, justPlaced, justSealed, message, page, placeOnCell, refused,
  run, scouted, sealed, selection, undo, undoStack, unitAt,
} from './state';

const SHOP_ID = 'run-shop';

function overShop(x: number, y: number) {
  const el = document.getElementById(SHOP_ID);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

const handlers: PressHandlers = {
  lookAt(cell) { const u = unitAt.value[cell]; return u ? { n: u.n, species: u.species, stars: u.stars } : null; },
  lookOf(key) {
    const s = run.value;
    if (!s) return null;
    if (key.startsWith('offer:')) { const o = s.offers[Number(key.slice(6))]; return o && !o.sold ? { n: o.n, species: o.species, stars: 1 } : null; }
    const u = s.units.find((x) => x.uid === key);
    return u ? { n: u.n, species: u.species, stars: u.stars } : null;
  },
  drop(from, cell) {
    if (from.kind === 'item') {
      if (from.key.startsWith('offer:')) placeOnCell({ kind: 'offer', index: Number(from.key.slice(6)) }, cell);
      else placeOnCell({ kind: 'bench', uid: from.key }, cell);
    } else {
      const u = unitAt.value[from.cell];
      if (u) placeOnCell({ kind: 'cell', uid: u.uid }, cell);
    }
    selection.value = null;
  },
  dropOff(from, x, y) {
    const s = run.value;
    if (!s) return;
    const uid = from.kind === 'cell' ? unitAt.value[from.cell]?.uid : from.key.startsWith('offer:') ? undefined : from.key;
    if (uid && overShop(x, y)) {
      const u = s.units.find((v) => v.uid === uid)!;
      dispatch({ type: 'sell', uid });
      showMessage(`Sold ${speciesById(u.species).name} for ${sellValue(u)} gold.`);
    } else if (uid && from.kind === 'cell') dispatch({ type: 'place', uid, cell: -1 });
    selection.value = null;
  },
  tapItem(key) {
    const sel = selection.value;
    if (key.startsWith('offer:')) {
      const index = Number(key.slice(6));
      if (sel?.kind === 'offer' && sel.index === index) { if (dispatch({ type: 'buy', offer: index })) selection.value = null; return; }
      selection.value = { kind: 'offer', index };
      return;
    }
    selection.value = sel && sel.kind !== 'offer' && sel.uid === key ? null : { kind: 'bench', uid: key };
  },
  tapCell(cell) {
    const s = run.value, p = page.value;
    if (!s || !p) return;
    if (s.phase === 'first-claim') { sheet.value = { kind: 'cage', cage: p.cageOf[cell]! }; return; }
    const sel = selection.value;
    const here = unitAt.value[cell];
    if (sel) {
      if (sel.kind !== 'offer' && here?.uid === sel.uid) { selection.value = null; return; }
      if (placeOnCell(sel, cell)) selection.value = null;
      return;
    }
    if (here) { selection.value = { kind: 'cell', uid: here.uid }; return; }
    sheet.value = { kind: 'cage', cage: p.cageOf[cell]! };
  },
  longPress(from) {
    const look = from.kind === 'cell' ? handlers.lookAt(from.cell) : handlers.lookOf(from.key);
    if (look) { selection.value = null; sheet.value = { kind: 'card', species: look.species!, n: look.n, stars: look.stars ?? 1 }; }
  },
};

let messageId = 0;
function showMessage(text: string) { message.value = { text, warn: false, id: ++messageId }; setTimeout(() => { if (message.value?.id === messageId) message.value = null; }, 2600); }

function Hud() {
  const s = run.value!;
  return (
    <header class="header hud-row">
      <button class="icon-btn" aria-label="Back to title" onClick={() => (screen.value = 'title')}><Icon name="back" /></button>
      <span class="hud-stat" aria-label={`${s.life} Life`}><Icon name="life" class="ico life" /><b>{s.life}</b></span>
      <span class="hud-stat" aria-label={`${s.gold} gold`}><Icon name="gold" class="ico gold" /><b>{s.gold}</b></span>
      <span class="hud-stat soft">Clash <b>{s.clash}</b>/{RUN.clashes}</span>
      <span class="hud-stat soft" aria-label={`Army ${armyCount.value} of ${armyLimit.value}`}>Army <b>{armyCount.value}</b>/{armyLimit.value}</span>
      <button class="icon-btn" aria-label="Undo" disabled={!undoStack.value.length} onClick={undo}><Icon name="undo" /></button>
      <button class="icon-btn" aria-label="Menu" onClick={() => (sheet.value = { kind: 'menu' })}><Icon name="menu" /></button>
    </header>
  );
}

function Scout() {
  const o = scouted.value;
  const s = run.value!;
  if (!o) return <div class="scout placeholder"><span class="scout-text"><span class="scout-name">Claim your first cage</span><span class="scout-sub">Any gold-outlined cage is yours for free.</span></span></div>;
  const pieces: (PieceView | null)[] = o.page.stones.map(() => null);
  for (const u of o.units) pieces[u.cell] = { key: u.uid, n: u.n, species: u.species, stars: u.stars };
  return (
    <button class={`scout${o.keeper ? ' keeper' : ''}`} onClick={() => (sheet.value = { kind: 'scout' })} aria-label={`Scout ${o.name}`}>
      <span class="scout-mini"><PageView id="run-scout" page={o.page} pieces={pieces} sealed={new Set()} mirrored label="" pieceRadius={22} /></span>
      <span class="scout-text">
        <span class="scout-name">{o.keeper ? 'Keeper: ' : `Clash ${s.clash}: `}{o.name}</span>
        <span class="scout-sub">{o.plan}</span>
      </span>
      <span class="chev" aria-hidden="true">›</span>
    </button>
  );
}

function Board() {
  const s = run.value!, p = page.value!;
  const d = drag.value;
  const sel = selection.value;
  const pieces: (PieceView | null)[] = unitAt.value.map((u, c) => u ? {
    key: u.uid, n: u.n, species: u.species, stars: u.stars,
    cls: [justPlaced.value === u.uid ? 'stamp' : '', sel && sel.kind !== 'offer' && sel.uid === u.uid ? 'lifted' : '', d?.from.kind === 'cell' && d.from.cell === c ? 'ghosted' : ''].join(' '),
  } : null);
  const dim = new Set(p.cages.filter((c) => !s.claimed.includes(c.id)).map((c) => c.id));
  const outline = s.phase === 'first-claim' ? new Set(p.cages.filter((c) => c.cells.length === 2).map((c) => c.id)) : undefined;
  let hover = null;
  if (d && d.over >= 0) {
    const from = d.from;
    const origin = from.kind === 'cell' ? from.cell : (from.key.startsWith('offer:') ? -1 : s.units.find((u) => u.uid === from.key)?.cell ?? -1);
    const vals = p.stones.map((v, c) => v || (unitAt.value[c]?.n ?? 0));
    if (unitAt.value[d.over] && d.over !== origin) vals[d.over] = 0;
    hover = { cell: d.over, ok: d.over === origin || (!p.stones[d.over] && s.claimed.includes(p.cageOf[d.over]!) && isLegal(p, vals, d.over, d.look.n, origin)) };
  }
  return (
    <div class="board-wrap" onPointerDown={(e) => pressBoard(e as unknown as PointerEvent)}>
      <PageView
        id="run" svgRef={setBoardElement} page={p} pieces={pieces} sealed={sealed.value} flashing={justSealed.value}
        hints={hints.value} hover={hover} refused={refused.value} dimCages={dim} outlineCages={outline}
        label={`Your page: ${s.claimed.length} cages claimed, ${sealed.value.size} sealed`}
      />
    </div>
  );
}

function TraitSummary() {
  const s = run.value!;
  const t = tallyTraits(toSpecs(onBoard(s)));
  const all = [...t.kins, ...t.callings].sort((a, b) => b.level - a.level || b.count - a.count).slice(0, 4);
  if (!all.length) return <div class="status muted-sm">{onBench(s).length ? 'Place units in a cage you hold.' : 'Buy a unit from the shop, then place it in a cage you hold.'}</div>;
  return (
    <div class="status">
      <button class="trait-summary" onClick={() => (sheet.value = { kind: 'traits' })} aria-label="Kins and Callings">
        {all.map((x) => (
          <span key={x.id} class={`ts-item${x.level ? ' on' : ''}`}><Icon name={x.id as IconName} class="ico chip-ico" />{x.count}<span class="ts-name">{traitName(x.id)}</span></span>
        ))}
        <span class="chev" aria-hidden="true">›</span>
      </button>
    </div>
  );
}

function Status() {
  const s = run.value!;
  const m = message.value;
  const sel = selection.value;
  if (m) return <div class={`status${m.warn ? ' warn' : ''}`} role="status" key={m.id}>{m.text}</div>;
  if (s.phase === 'first-claim') return <div class="status">Tap a gold-outlined cage to claim it free. Your army can grow as large as the open cells you hold.</div>;
  if (sel?.kind === 'offer') {
    const o = s.offers[sel.index];
    if (!o || o.sold) return <div class="status" />;
    const sp = speciesById(o.species);
    return (
      <div class="status">
        <span>{sp.name} ({o.n}), {sp.tier} gold. Tap a cell to buy it there.</span>
        <button class="pill-btn" onClick={() => (sheet.value = { kind: 'card', species: o.species, n: o.n, stars: 1 })}><Icon name="info" />Card</button>
        <button class="pill-btn" onClick={() => { if (dispatch({ type: 'buy', offer: sel.index })) selection.value = null; }}>Buy</button>
      </div>
    );
  }
  if (sel) {
    const u = s.units.find((x) => x.uid === sel.uid);
    if (!u) return <div class="status" />;
    return (
      <div class="status">
        <span>{speciesById(u.species).name} ({u.n}).</span>
        <button class="pill-btn" onClick={() => (sheet.value = { kind: 'card', species: u.species, n: u.n, stars: u.stars })}><Icon name="info" />Card</button>
        {u.cell >= 0 ? <button class="pill-btn" onClick={() => { dispatch({ type: 'place', uid: u.uid, cell: -1 }); selection.value = null; }}>Bench</button> : null}
        <button class="pill-btn" onClick={() => { dispatch({ type: 'sell', uid: u.uid }); selection.value = null; }}>Sell {sellValue(u)}</button>
      </div>
    );
  }
  return <TraitSummary />;
}

function Bench() {
  const sel = selection.value;
  const units = benchUnits.value;
  return (
    <div class="bench" role="toolbar" aria-label="Bench">
      {units.map((u) => (
        <button
          key={u.uid}
          class={`bench-slot${sel && sel.kind !== 'offer' && sel.uid === u.uid ? ' selected' : ''}`}
          aria-label={`${speciesById(u.species).name}, number ${u.n}${u.stars > 1 ? `, ${u.stars} stars` : ''}`}
          onPointerDown={(e) => pressItem(e as unknown as PointerEvent, u.uid)}
        >
          <TokenSvg n={u.n} species={u.species} stars={u.stars} size={44} />
        </button>
      ))}
      {Array.from({ length: Math.max(0, RUN.benchSize - units.length) }, (_, i) => <span key={`e${i}`} class="bench-slot empty" />)}
    </div>
  );
}

function Shop() {
  const s = run.value!;
  const sel = selection.value;
  const d = drag.value;
  const selling = !!d && !(d.from.kind === 'item' && d.from.key.startsWith('offer:'));
  return (
    <div id={SHOP_ID} class={`shop${selling ? ' sell-zone' : ''}`} role="toolbar" aria-label="Shop">
      {selling ? <div class="sell-note">Drop here to sell</div> : null}
      {s.offers.map((o, i) => {
        const sp = speciesById(o.species);
        if (o.sold) return <div key={i} class="offer sold" aria-hidden="true">Sold</div>;
        const afford = s.gold >= sp.tier;
        return (
          <button
            key={i}
            class={`offer${sel?.kind === 'offer' && sel.index === i ? ' selected' : ''}${afford ? '' : ' poor'}`}
            aria-label={`Buy ${sp.name}, number ${o.n}, ${sp.tier} gold`}
            onPointerDown={(e) => pressItem(e as unknown as PointerEvent, `offer:${i}`)}
          >
            <TokenSvg n={o.n} species={o.species} size={38} />
            <span class="offer-name">{sp.name}</span>
            <span class="offer-cost"><Icon name="gold" class="ico gold sm" />{sp.tier}</span>
          </button>
        );
      })}
    </div>
  );
}

function Controls() {
  const s = run.value!;
  const ready = s.phase === 'plan';
  return (
    <div class="run-controls">
      <button class="btn" disabled={!ready || s.gold < RUN.rerollCost} onClick={() => dispatch({ type: 'reroll' })} aria-label={`Reroll the shop for ${RUN.rerollCost} gold`}>
        <Icon name="reroll" />{RUN.rerollCost}
      </button>
      <button class={`btn${s.locked ? ' toggled' : ''}`} disabled={!ready} aria-pressed={s.locked} onClick={() => dispatch({ type: 'lock' })} aria-label={s.locked ? 'Unlock the shop' : 'Lock the shop for next clash'}>
        <Icon name="lock" />
      </button>
      <button class="btn primary grow" disabled={!ready || !armyCount.value} onClick={() => { selection.value = null; dispatch({ type: 'clash' }); }}>
        <Icon name="clash" />Clash
      </button>
    </div>
  );
}

export function RunPlan() {
  useEffect(() => { setHandlers(handlers); return () => setHandlers(null); }, []);
  const s = run.value;
  useEffect(() => { if (s?.phase === 'merge') sheet.value = { kind: 'merge' }; }, [s?.phase]);
  if (!s) return null;
  return (
    <div class="column run">
      <Hud />
      <Scout />
      <div class="front"><span>front line</span></div>
      <Board />
      <Status />
      <Bench />
      <Shop />
      <Controls />
      <div class="bottom-pad" />
    </div>
  );
}
