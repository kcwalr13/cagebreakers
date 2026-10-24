import { useEffect } from 'preact/hooks';
import { speciesById } from '../../content/species';
import { CALLINGS, KINS } from '../../content/traits';
import type { CallingId, KinId } from '../../content/types';
import { isLegal } from '../../core/rules';
import { Icon } from '../Icon';
import type { IconName } from '../icons';
import { type PressHandlers, drag, pressBoard, pressItem, setBoardElement, setHandlers } from '../input';
import { screen, sheet } from '../nav';
import { PageView, type PieceView } from '../PageView';
import { TokenSvg } from '../Token';
import {
  bench, benchUnit, encounter, enemyTraits, enemyPage, hints, history, justPlaced, justSealed, layout, message, placeUnit,
  playerPage, refused, rosterById, sealed, selection, startClash, traits, undo, unitAt, units, values,
} from './state';

const handlers: PressHandlers = {
  lookAt(cell) {
    const uid = unitAt.value[cell];
    if (!uid) return null;
    const u = rosterById.get(uid)!;
    return { n: u.n, species: u.species, stars: u.stars };
  },
  lookOf(uid) {
    const u = rosterById.get(uid);
    return u ? { n: u.n, species: u.species, stars: u.stars } : null;
  },
  drop(from, cell) {
    const uid = from.kind === 'item' ? from.key : unitAt.value[from.cell];
    if (uid) placeUnit(uid, cell);
    selection.value = null;
  },
  dropOff(from) {
    if (from.kind === 'cell') { const uid = unitAt.value[from.cell]; if (uid) benchUnit(uid); }
    selection.value = null;
  },
  tapItem(uid) {
    const sel = selection.value;
    selection.value = sel?.kind === 'bench' && sel.uid === uid ? null : { kind: 'bench', uid };
  },
  tapCell(cell) {
    const sel = selection.value;
    const here = unitAt.value[cell];
    if (sel?.kind === 'bench') { if (placeUnit(sel.uid, cell)) selection.value = null; return; }
    if (sel?.kind === 'cell') {
      if (sel.cell === cell) { selection.value = null; return; }
      const uid = unitAt.value[sel.cell];
      if (uid && placeUnit(uid, cell)) selection.value = null;
      return;
    }
    if (here) { selection.value = { kind: 'cell', cell }; return; }
    sheet.value = { kind: 'cage', cage: playerPage.cageOf[cell]! };
  },
  longPress(from) {
    const uid = from.kind === 'item' ? from.key : unitAt.value[from.cell];
    if (uid) { selection.value = null; sheet.value = { kind: 'unit', uid, side: 'player' }; }
  },
};

function Header() {
  return (
    <header class="header">
      <button class="icon-btn" aria-label="Back" onClick={() => (screen.value = 'title')}><Icon name="back" /></button>
      <div class="title">
        <div class="title-page">{encounter.title}</div>
        <div class="title-sub">{sealed.value.size} sealed, {units.value.length} of {rosterById.size} units placed</div>
      </div>
      <button class="icon-btn" aria-label="Undo" disabled={!history.value.length} onClick={undo}><Icon name="undo" /></button>
      <button class="icon-btn" aria-label="Menu" onClick={() => (sheet.value = { kind: 'menu' })}><Icon name="menu" /></button>
    </header>
  );
}

function Scout() {
  const pieces: (PieceView | null)[] = enemyPage.stones.map(() => null);
  for (const u of encounter.enemy) pieces[u.cell] = { key: u.uid, n: u.n, species: u.species, stars: u.stars };
  return (
    <button class="scout" onClick={() => (sheet.value = { kind: 'enemy' })} aria-label={`Scout ${encounter.enemyName}`}>
      <span class="scout-mini">
        <PageView id="scout" page={enemyPage} pieces={pieces} sealed={new Set()} mirrored label="" pieceRadius={22} />
      </span>
      <span class="scout-text">
        <span class="scout-name">Next: {encounter.enemyName}</span>
        <span class="scout-sub">{encounter.enemyPlan}</span>
      </span>
      <span class="chev" aria-hidden="true">›</span>
    </button>
  );
}

export function TraitChips({ side }: { side: 'player' | 'enemy' }) {
  const t = side === 'player' ? traits.value : enemyTraits;
  const all = [...t.kins.map((k) => ({ ...k, kind: 'kin' as const })), ...t.callings.map((c) => ({ ...c, kind: 'calling' as const }))]
    .sort((a, b) => b.level - a.level || b.count - a.count);
  if (!all.length) return <div class="traits empty">Kins and Callings light up here as you place units.</div>;
  return (
    <div class="traits">
      {all.map((x) => {
        const def = x.kind === 'kin' ? KINS[x.id as KinId] : CALLINGS[x.id as CallingId];
        const next = def.thresholds.find((th) => th > x.count) ?? def.thresholds.at(-1)!;
        return (
          <button key={x.id} class={`chip${x.level ? ' on' : ''}`} onClick={() => (sheet.value = { kind: 'trait', id: x.id, side })}>
            <Icon name={x.id as IconName} class="ico chip-ico" />
            <span>{'plural' in def ? def.plural : def.name}</span>
            <span class="chip-count">{x.count}/{x.level === def.thresholds.length ? x.count : next}</span>
          </button>
        );
      })}
    </div>
  );
}

function Board() {
  const d = drag.value;
  const sel = selection.value;
  const pieces: (PieceView | null)[] = unitAt.value.map((uid, c) => {
    if (!uid) return null;
    const u = rosterById.get(uid)!;
    return {
      key: uid, n: u.n, species: u.species, stars: u.stars,
      cls: [justPlaced.value === uid ? 'stamp' : '', sel?.kind === 'cell' && sel.cell === c ? 'lifted' : '', d?.from.kind === 'cell' && d.from.cell === c ? 'ghosted' : ''].join(' '),
    };
  });
  let hover = null;
  if (d && d.over >= 0) {
    const origin = d.from.kind === 'cell' ? d.from.cell : -1;
    const vals = values.value.slice();
    if (unitAt.value[d.over] && d.over !== origin) vals[d.over] = 0;
    hover = { cell: d.over, ok: d.over === origin || (!playerPage.stones[d.over] && isLegal(playerPage, vals, d.over, d.look.n, origin)) };
  }
  return (
    <div class="board-wrap" onPointerDown={(e) => pressBoard(e as unknown as PointerEvent)}>
      <PageView
        id="plan" svgRef={setBoardElement} page={playerPage} pieces={pieces}
        sealed={sealed.value} flashing={justSealed.value} hints={hints.value} hover={hover} refused={refused.value}
        label={`Your page: ${sealed.value.size} cages sealed`}
      />
    </div>
  );
}

function Status() {
  const m = message.value;
  const sel = selection.value;
  if (m) return <div class={`status${m.warn ? ' warn' : ''}`} role="status" key={m.id}>{m.text}</div>;
  if (sel) {
    const uid = sel.kind === 'bench' ? sel.uid : unitAt.value[sel.cell];
    const u = uid ? rosterById.get(uid) : undefined;
    if (!u) return <div class="status" />;
    const sp = speciesById(u.species);
    return (
      <div class="status">
        <span>{sp.name} ({u.n}). {sel.kind === 'bench' ? 'Tap a cell for it.' : 'Tap a cell to move it.'}</span>
        <button class="pill-btn" onClick={() => (sheet.value = { kind: 'unit', uid: u.uid, side: 'player' })}><Icon name="info" />Card</button>
        {sel.kind === 'cell' ? <button class="pill-btn" onClick={() => { benchUnit(u.uid); selection.value = null; }}>Bench</button> : null}
      </div>
    );
  }
  return <div class="status muted-sm">Hold a unit to see its card. Their front row faces yours.</div>;
}

function Bench() {
  const sel = selection.value;
  const waiting = bench.value;
  return (
    <div class="bench" role="toolbar" aria-label="Bench">
      {waiting.map((u) => (
        <button
          key={u.uid}
          class={`bench-slot${sel?.kind === 'bench' && sel.uid === u.uid ? ' selected' : ''}`}
          aria-label={`${speciesById(u.species).name}, number ${u.n}`}
          aria-pressed={sel?.kind === 'bench' && sel.uid === u.uid}
          onPointerDown={(e) => pressItem(e as unknown as PointerEvent, u.uid)}
        >
          <TokenSvg n={u.n} species={u.species} stars={u.stars} size={44} />
        </button>
      ))}
      {Array.from({ length: Math.max(0, rosterById.size - waiting.length) }, (_, i) => <span key={`e${i}`} class="bench-slot empty" />)}
    </div>
  );
}

export function PlanScreen() {
  useEffect(() => { setHandlers(handlers); return () => setHandlers(null); }, []);
  void layout.value;
  return (
    <div class="column fight">
      <Header />
      <Scout />
      <TraitChips side="player" />
      <div class="front"><span>front line</span></div>
      <Board />
      <Status />
      <div class="spacer" />
      <Bench />
      <button class="btn primary clash-btn" onClick={startClash} disabled={!units.value.length}>
        <Icon name="clash" />Clash
      </button>
      <div class="bottom-pad" />
    </div>
  );
}
