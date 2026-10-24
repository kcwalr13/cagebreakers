import { useEffect } from 'preact/hooks';
import { NUMBERS } from '../core/grid';
import { Board } from './Board';
import { Icon } from './Icon';
import { LIFT_PX, pressTray } from './input';
import { Sheets } from './Sheets';
import { TokenSvg } from './Token';
import {
  complete, drag, history, message, newPage, page, placed, placedCount, removeAt, sealed, seenIntro,
  selection, sheet, undo,
} from './state';

function Header() {
  const p = page.value;
  return (
    <header class="header">
      <button class="icon-btn" aria-label="Menu" onClick={() => (sheet.value = { kind: 'menu' })}><Icon name="menu" /></button>
      <div class="title">
        <div class="title-page">Page {p.seed}</div>
        <div class="title-sub">{sealed.value.size} of {p.cages.length} cages sealed</div>
      </div>
      <button class="icon-btn" aria-label="Undo" disabled={!history.value.length} onClick={undo}><Icon name="undo" /></button>
      <button class="icon-btn" aria-label="New page" onClick={() => newPage()}><Icon name="newPage" /></button>
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
  if (sel?.kind === 'tray') return <div class="status">Placing {sel.n}s. Gold cells seal a cage.</div>;
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
          onPointerDown={(e) => pressTray(e as unknown as PointerEvent, n)}
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
    <div class="tray" style="justify-content: flex-start; align-items: center; gap: 14px; padding: 14px 6px;">
      <div style="flex: 1">
        <div style="font-family: Alegreya, serif; font-weight: 800; font-size: 22px">Page sealed</div>
        <div style="color: var(--ink-soft); font-size: 14px">All {p.cages.length} cages, with {placedCount.value} numbers placed.</div>
      </div>
      <button class="btn primary" onClick={() => newPage()}>New page</button>
    </div>
  );
}

function Ghost() {
  const d = drag.value;
  if (!d) return null;
  return (
    <div class="ghost" style={{ transform: `translate(${d.x - 26}px, ${d.y - LIFT_PX - 26}px)` }}>
      <TokenSvg n={d.n} size={52} />
    </div>
  );
}

export function App() {
  // Escape closes sheets and drops whatever is in hand.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { sheet.value = null; selection.value = null; } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div class="app">
      <div class="column">
        <Header />
        <Board />
        <Status />
        <div class="spacer" />
        {complete.value ? <Complete /> : (
          <>
            {!seenIntro.value ? (
              <div class="tray-label">Drag a number onto the page. When a cage's numbers make its red target, it seals in gold.</div>
            ) : null}
            <Tray />
          </>
        )}
        <div class="bottom-pad" />
      </div>
      <Ghost />
      <Sheets />
    </div>
  );
}
