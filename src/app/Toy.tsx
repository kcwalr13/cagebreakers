import { useEffect } from 'preact/hooks';
import { NUMBERS } from '../core/grid';
import { Board } from './Board';
import { Icon } from './Icon';
import { type PressHandlers, pressItem, setHandlers } from './input';
import { TokenSvg } from './Token';
import {
  complete, history, message, newPage, page, place, placed, placedCount, removeAt, say, sealed, seenIntro,
  selection, sheet, undo,
} from './state';
import { goBack, screen } from './nav';

/** Touch handling for the page toy: numbers from the tray, numbers already on the page. */
const toyHandlers: PressHandlers = {
  lookAt: (cell) => (placed.value[cell] ? { n: placed.value[cell]! } : null),
  lookOf: (key) => ({ n: Number(key) }),
  drop(from, cell) {
    if (from.kind === 'item') place(cell, Number(from.key));
    else { const n = placed.value[from.cell]; if (n) place(cell, n, from.cell); selection.value = null; }
  },
  dropOff(from) {
    if (from.kind === 'cell' && placed.value[from.cell]) {
      const n = placed.value[from.cell];
      removeAt(from.cell);
      say(`Picked up the ${n}.`);
    }
  },
  tapItem(key) {
    const n = Number(key), sel = selection.value;
    selection.value = sel?.kind === 'tray' && sel.n === n ? null : { kind: 'tray', n };
  },
  tapCell(cell) {
    const sel = selection.value;
    if (sel?.kind === 'tray') { place(cell, sel.n); return; }
    if (sel?.kind === 'cell') {
      if (sel.cell === cell) { selection.value = null; return; }
      const n = placed.value[sel.cell] ?? 0;
      if (n && place(cell, n, sel.cell)) selection.value = null;
      return;
    }
    if (placed.value[cell]) { selection.value = { kind: 'cell', cell }; return; }
    sheet.value = { kind: 'cage', cage: page.value.cageOf[cell]! };
  },
};

function Header() {
  const p = page.value;
  return (
    <header class="header">
      <button class="icon-btn" aria-label="Back" onClick={goBack}><Icon name="back" /></button>
      <div class="title">
        <div class="title-page">Garden {p.seed}</div>
        <div class="title-sub">{sealed.value.size} of {p.cages.length} cages sealed</div>
      </div>
      <button class="icon-btn" aria-label="Undo" disabled={!history.value.length} onClick={undo}><Icon name="undo" /></button>
      <button class="icon-btn" aria-label="New page" onClick={() => newPage()}><Icon name="newPage" /></button>
      <button class="icon-btn" aria-label="Menu" onClick={() => (sheet.value = { kind: 'menu' })}><Icon name="menu" /></button>
    </header>
  );
}

function Status() {
  const m = message.value;
  const sel = selection.value;
  if (m) return <div class={`status${m.warn ? ' warn' : ''}`} role="status" key={m.id}>{m.text}</div>;
  if (sel?.kind === 'cell') {
    const n = placed.value[sel.cell];
    return (
      <div class="status">
        <span>Moving the {n}. Tap a cell for it.</span>
        <button class="pill-btn" onClick={() => { removeAt(sel.cell); selection.value = null; }}>
          <Icon name="remove" class="ico" />Remove
        </button>
      </div>
    );
  }
  if (sel?.kind === 'tray') return <div class="status">Planting {sel.n}s. Bright squares take it; flowering ones make a plot bloom.</div>;
  return <div class="status" role="status" />;
}

function Tray() {
  const sel = selection.value;
  return (
    <div class="tray" role="toolbar" aria-label="Numbers">
      {NUMBERS.map((n) => (
        <button
          key={n}
          class={`tray-slot${sel?.kind === 'tray' && sel.n === n ? ' selected' : ''}`}
          aria-label={`Number ${n}`}
          aria-pressed={sel?.kind === 'tray' && sel.n === n}
          onPointerDown={(e) => pressItem(e as unknown as PointerEvent, String(n))}
        >
          <TokenSvg n={n} size={48} />
        </button>
      ))}
    </div>
  );
}

function Complete() {
  const p = page.value;
  return (
    <div class="tray done-row">
      <div style="flex: 1">
        <div class="done-title">Every plot in bloom</div>
        <div class="muted-sm">All {p.cages.length} plots, with {placedCount.value} numbers planted.</div>
      </div>
      <button class="btn primary" onClick={() => newPage()}>New garden</button>
    </div>
  );
}

export function ToyScreen() {
  useEffect(() => { setHandlers(toyHandlers); return () => setHandlers(null); }, []);
  return (
    <div class="column toy">
      <Header />
      <Board />
      <Status />
      {complete.value ? <Complete /> : (
        <>
          {!seenIntro.value ? (
            <div class="tray-label">Drag a number into the garden. When a plot's numbers make its target, it blooms.</div>
          ) : null}
          <Tray />
        </>
      )}
      <div class="bottom-pad" />
    </div>
  );
}
