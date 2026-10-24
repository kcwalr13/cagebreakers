import { useEffect } from 'preact/hooks';
import { RUN } from '../../content/balance';
import { ITEMS } from '../../content/items';
import { speciesById } from '../../content/species';
import { tallyTraits } from '../../core/clash';
import { numberLabel, pieceKind } from '../../core/pieces';
import { isClaimed, onBench, onBoard, sellValue, toSpecs, values } from '../../core/run';
import { traitName } from '../cards';
import { Icon } from '../Icon';
import type { IconName } from '../icons';
import { type PressHandlers, drag, pressBoard, pressItem, setBoardElement, setHandlers } from '../input';
import { screen, sheet } from '../nav';
import { PageView, piecesOf } from '../PageView';
import { TokenSvg } from '../Token';
import {
  armyCount, armyLimit, benchUnits, blankShown, dispatch, dominoLanding, hints, holding, isLegal, itemMode, justPlaced, justSealed,
  message, page, placeOnCell, refused, revealed, run, scouted, sealed, selection, toolTargets, undo, undoStack, unitAt, useOn,
} from './state';

const SHOP_ID = 'run-shop';

function overShop(x: number, y: number) {
  const el = document.getElementById(SHOP_ID);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

const look = (u: { n: number; n2?: number; species: string; stars?: number; relic?: import('../../content/types').RelicId }) =>
  ({ n: u.n, n2: u.n2, species: u.species, stars: u.stars ?? 1, relic: u.relic });

const handlers: PressHandlers = {
  lookAt(cell) { if (itemMode.value) return null; const u = unitAt.value[cell]; return u ? look(u) : null; },
  lookOf(key) {
    const s = run.value;
    if (!s || itemMode.value) return null;
    if (key.startsWith('offer:')) { const o = s.offers[Number(key.slice(6))]; return o && !o.sold ? look(o) : null; }
    const u = s.units.find((x) => x.uid === key);
    return u ? look(u) : null;
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
    if (itemMode.value) { if (!key.startsWith('offer:')) useOn({ uid: key }); return; }
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
    const here = unitAt.value[cell];
    if (itemMode.value) { useOn({ uid: here?.uid, cell }); return; }
    const sel = selection.value;
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
    if (look) { selection.value = null; sheet.value = { kind: 'card', species: look.species!, n: look.n, stars: look.stars ?? 1, n2: look.n2, relic: look.relic }; }
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
  const pieces = piecesOf(o.units);
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
  const pieces = piecesOf(onBoard(s), (uid, c) => [
    justPlaced.value === uid ? 'stamp' : '', sel && sel.kind !== 'offer' && sel.uid === uid ? 'lifted' : '',
    d?.from.kind === 'cell' && unitAt.value[d.from.cell]?.uid === uid ? 'ghosted' : '', itemMode.value && !toolTargets.value?.has(c) ? 'muted' : '',
  ].join(' ').trim(), blankShown.value);
  const dim = new Set(p.cages.filter((c) => !s.claimed.includes(c.id)).map((c) => c.id));
  const outline = s.phase === 'first-claim' ? new Set(p.cages.filter((c) => c.cells.length === 2).map((c) => c.id)) : undefined;
  let hover = null, hover2: number | undefined;
  const h = holding.value;
  if (d && d.over >= 0 && h) {
    const kind = pieceKind(h.species);
    const occupant = unitAt.value[d.over];
    let ok: boolean;
    if (h.origin.includes(d.over) && kind !== 'domino') ok = true;
    else if (occupant && occupant.uid !== h.uid) {
      const vals = values(s); vals[d.over] = 0;
      ok = kind !== 'domino' && pieceKind(occupant.species) !== 'domino' && isClaimed(s, d.over)
        && (kind !== 'number' || isLegal(p, vals, d.over, h.n, h.origin[0] ?? -1));
    } else {
      const hint = kind === 'domino' ? (dominoLanding.value[d.over]! >= 0 ? 'open' : null) : hints.value[d.over];
      ok = !!hint && hint !== 'blocked';
    }
    hover = { cell: d.over, ok };
    if (kind === 'domino') hover2 = dominoLanding.value[d.over];
  }
  return (
    <div class="board-wrap" onPointerDown={(e) => pressBoard(e as unknown as PointerEvent)}>
      <PageView
        id="run" svgRef={setBoardElement} page={p} pieces={pieces} sealed={sealed.value} flashing={justSealed.value}
        hints={itemMode.value ? undefined : hints.value} hover={hover} hover2={hover2} refused={refused.value} dimCages={dim} outlineCages={outline}
        revealed={revealed.value} targets={toolTargets.value}
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
  const im = itemMode.value;
  if (im) {
    const name = ITEMS[im.item].name;
    const ask = ITEMS[im.item].family === 'relic' ? `Tap a unit to carry the ${name}.`
      : im.item === 'chisel' || im.item === 'flip' ? `Tap a unit to ${im.item === 'chisel' ? 'chisel' : 'flip'}.`
        : im.item === 'eraser' ? 'Tap a stone to erase it.'
          : im.item === 'inkpot' ? 'Tap a ringed cage to switch it between + and ×.'
            : 'Tap a ringed cell to see its hidden number.';
    return (
      <div class="status">
        <span><Icon name={im.item as IconName} class="ico inline-ico" /> {ask}</span>
        <button class="pill-btn" onClick={() => (itemMode.value = null)}>Cancel</button>
      </div>
    );
  }
  if (s.phase === 'pick') return <div class="status"><span>Choose an item to begin the chapter.</span><button class="pill-btn" onClick={() => (sheet.value = { kind: 'pick' })}>Choose</button></div>;
  if (s.phase === 'merge') return <div class="status"><span>Three copies are ready to combine.</span><button class="pill-btn" onClick={() => (sheet.value = { kind: 'merge' })}>Combine</button></div>;
  if (s.phase === 'first-claim') return <div class="status">Tap a gold-outlined cage to claim it free. Your army can grow as large as the open cells you hold.</div>;
  if (sel?.kind === 'offer') {
    const o = s.offers[sel.index];
    if (!o || o.sold) return <div class="status" />;
    const sp = speciesById(o.species);
    return (
      <div class="status">
        <span>{sp.name} ({numberLabel(o)}), {sp.tier} gold. Tap a cell to buy it there.</span>
        <button class="pill-btn" onClick={() => (sheet.value = { kind: 'card', species: o.species, n: o.n, n2: o.n2, stars: 1 })}><Icon name="info" />Card</button>
        <button class="pill-btn" onClick={() => { if (dispatch({ type: 'buy', offer: sel.index })) selection.value = null; }}>Buy</button>
      </div>
    );
  }
  if (sel) {
    const u = s.units.find((x) => x.uid === sel.uid);
    if (!u) return <div class="status" />;
    return (
      <div class="status">
        <span>{speciesById(u.species).name} ({numberLabel(u)}){u.relic ? `, ${ITEMS[u.relic].name}` : ''}.</span>
        <button class="pill-btn" onClick={() => (sheet.value = { kind: 'card', species: u.species, n: u.n, n2: u.n2, stars: u.stars, relic: u.relic })}><Icon name="info" />Card</button>
        {u.cell >= 0 && pieceKind(u.species) === 'domino' ? <button class="pill-btn" onClick={() => dispatch({ type: 'turn', uid: u.uid })}><Icon name="turn" />Turn</button> : null}
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
          aria-label={`${speciesById(u.species).name}, ${pieceKind(u.species) === 'number' ? 'number ' : ''}${numberLabel(u)}${u.stars > 1 ? `, ${u.stars} stars` : ''}`}
          onPointerDown={(e) => pressItem(e as unknown as PointerEvent, u.uid)}
        >
          <TokenSvg n={u.n} n2={u.n2} species={u.species} stars={u.stars} relic={u.relic} size={44} />
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
            aria-label={`Buy ${sp.name}, ${pieceKind(o.species) === 'number' ? 'number ' : ''}${numberLabel(o)}, ${sp.tier} gold`}
            onPointerDown={(e) => pressItem(e as unknown as PointerEvent, `offer:${i}`)}
          >
            <TokenSvg n={o.n} n2={o.n2} species={o.species} size={38} />
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
      <button class="btn" disabled={!ready} onClick={() => { itemMode.value = null; sheet.value = { kind: 'satchel' }; }} aria-label={`Satchel, ${s.satchel.length} ${s.satchel.length === 1 ? 'item' : 'items'}`}>
        <Icon name="satchel" />{s.satchel.length}
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
  useEffect(() => {
    if (s?.phase === 'merge') sheet.value = { kind: 'merge' };
    if (s?.phase === 'pick') sheet.value = { kind: 'pick' };
  }, [s?.phase, s?.pickCount]);
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
