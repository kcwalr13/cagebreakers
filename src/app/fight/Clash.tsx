import { useEffect, useRef, useState } from 'preact/hooks';
import { BEATS_PER_SECOND } from '../../content/balance';
import { type ClashEvent, type ClashResult, ENEMY, PLAYER, type Team } from '../../core/clash';
import { CELLS } from '../../core/grid';
import { Icon } from '../Icon';
import { BOARD_PX, CELL_PX } from '../input';
import { sheet } from '../nav';
import type { Page } from '../../core/page';
import { PageView, type PieceView, cellX, drawnY, piecesOf } from '../PageView';
import { backToPlan, enemyPage as fightEnemyPage, playerPage as fightPlayerPage, result } from './state';

const GAP = 34;
const VIEW_H = BOARD_PX * 2 + GAP;
const yOffset = (team: Team) => (team === ENEMY ? 0 : BOARD_PX + GAP);

interface FState { hp: number; maxHp: number; shield: number; alive: boolean; fortUntil: number; stunUntil: number; diedAt: number }
type Effect =
  | { kind: 'shot'; from: string; to: string; start: number; dur: number; ability: boolean; team: Team }
  | { kind: 'float'; uid: string; text: string; cls: string; start: number; dur: number; slot: number; amount?: number }
  | { kind: 'pulse'; uid: string; start: number; dur: number }
  | { kind: 'crack'; team: Team; cage: number; start: number; dur: number }
  | { kind: 'banner'; text: string; start: number; dur: number };

interface Model {
  beat: number;
  idx: number;
  playing: boolean;
  speed: number;
  done: boolean;
  fs: Map<string, FState>;
  sealed: [Set<number>, Set<number>];
  effects: Effect[];
  floatSlot: Map<string, number>;
}

function freshModel(r: ClashResult): Model {
  return {
    beat: 0, idx: 0, playing: true, speed: 1, done: false,
    fs: new Map(r.fighters.map((f) => [f.uid, { hp: f.hp, maxHp: f.maxHp, shield: f.shield, alive: true, fortUntil: -1, stunUntil: -1, diedAt: -1 }])),
    sealed: [new Set(r.sealedAtStart[0]), new Set(r.sealedAtStart[1])],
    effects: [], floatSlot: new Map(),
  };
}

/** Applies one event to the playback model, spawning the effects that show it. */
function apply(m: Model, e: ClashEvent, now: number, teamOf: (uid: string) => Team) {
  const slow = (ms: number) => ms / Math.min(m.speed, 2);
  const float = (uid: string, text: string, cls: string, amount?: number) => {
    // Hits on the same unit within a quarter second read as one number, not a pile.
    if (amount !== undefined) {
      const recent = m.effects.find((e) => e.kind === 'float' && e.uid === uid && e.cls === cls && e.amount !== undefined && now - e.start < 250);
      if (recent && recent.kind === 'float') { recent.amount! += amount; recent.text = `${recent.amount}`; return; }
    }
    const slot = ((m.floatSlot.get(uid) ?? 0) + 1) % 3;
    m.floatSlot.set(uid, slot);
    m.effects.push({ kind: 'float', uid, text, cls, start: now, dur: slow(900), slot, amount });
  };
  switch (e.type) {
    case 'attack': m.effects.push({ kind: 'shot', from: e.src, to: e.dst, start: now, dur: slow(200), ability: false, team: teamOf(e.src) }); break;
    case 'cast':
      m.effects.push({ kind: 'pulse', uid: e.src, start: now, dur: slow(600) });
      for (const t of e.targets) if (t !== e.src) m.effects.push({ kind: 'shot', from: e.src, to: t, start: now, dur: slow(260), ability: true, team: teamOf(e.src) });
      break;
    case 'damage': {
      const f = m.fs.get(e.dst)!; f.hp = e.hp; f.shield = e.shield;
      if (e.amount >= 1 && e.kind !== 'overtime' && e.kind !== 'poison') float(e.dst, `${e.amount}`, e.kind === 'ability' ? 'dmg big' : e.kind === 'thorn' ? 'dmg thorn' : 'dmg', e.amount);
      else if (e.kind === 'poison' && e.amount >= 1 && e.t % 10 === 0) float(e.dst, `${e.amount}`, 'dmg poison');
      break;
    }
    case 'heal': { const f = m.fs.get(e.dst)!; f.hp = e.hp; if (e.amount >= 1) float(e.dst, `+${e.amount}`, 'heal'); break; }
    case 'shield': { const f = m.fs.get(e.dst)!; f.shield = e.shield; float(e.dst, `+${e.amount}`, 'shield'); break; }
    case 'stats': { const f = m.fs.get(e.uid)!; f.maxHp = e.maxHp; f.hp = e.hp; break; }
    case 'evade': float(e.dst, 'evade', 'evade'); break;
    case 'fortify': m.fs.get(e.dst)!.fortUntil = e.until; break;
    case 'stun': m.fs.get(e.dst)!.stunUntil = e.until; float(e.dst, 'stunned', 'evade'); break;
    case 'buff': float(e.dst, e.kind === 'mark' ? 'marked' : e.kind === 'rally' ? 'rallied' : e.kind === 'frenzy' ? 'frenzy' : 'bristling', e.kind === 'mark' ? 'evade' : 'shield'); break;
    case 'death': { const f = m.fs.get(e.uid)!; f.alive = false; f.hp = 0; f.shield = 0; f.diedAt = now; break; }
    case 'shatter':
      m.sealed[e.team].delete(e.cage);
      m.effects.push({ kind: 'crack', team: e.team, cage: e.cage, start: now, dur: slow(800) });
      break;
    case 'reseal': m.sealed[e.team].add(e.cage); break;
    case 'overtime': m.effects.push({ kind: 'banner', text: 'Overtime: the ink runs', start: now, dur: 1600 }); break;
    case 'end': m.done = true; break;
  }
}

function usePlayback(r: ClashResult) {
  const model = useRef<Model>(freshModel(r));
  const [, setTick] = useState(0);
  const teamOf = useRef((uid: string) => r.fighters.find((f) => f.uid === uid)?.team ?? PLAYER).current;

  useEffect(() => {
    model.current = freshModel(r);
    let raf = 0, last = performance.now(), lastPaint = 0;
    const frame = (now: number) => {
      const m = model.current;
      const dt = Math.min(100, now - last);
      last = now;
      if (m.playing && !m.done) {
        m.beat += (dt / 1000) * BEATS_PER_SECOND * m.speed;
        while (m.idx < r.events.length && r.events[m.idx]!.t <= m.beat) apply(m, r.events[m.idx++]!, now, teamOf);
      }
      m.effects = m.effects.filter((e) => now - e.start < e.dur);
      // Paint at most 30 times a second: smooth enough, and kind to the battery.
      if (now - lastPaint >= 33) { lastPaint = now; setTick((x) => x + 1); }
      if (!m.done || m.effects.length) raf = requestAnimationFrame(frame);
      else setTick((x) => x + 1);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [r]);

  const controls = {
    toggle: () => { model.current.playing = !model.current.playing; setTick((x) => x + 1); },
    faster: () => { const m = model.current; m.speed = m.speed >= 4 ? 1 : m.speed * 2; setTick((x) => x + 1); },
    skip: () => {
      const m = model.current, now = performance.now();
      while (m.idx < r.events.length) apply(m, r.events[m.idx++]!, now, teamOf);
      m.beat = r.beats; m.effects = m.effects.filter((e) => e.kind === 'crack');
      setTick((x) => x + 1);
    },
    restart: () => { model.current = freshModel(r); setTick((x) => x + 1); },
  };
  return { m: model.current, controls };
}

export function ClashScreen() {
  const r = result.value;
  if (!r) return null;
  return (
    <ClashView
      r={r} key={r.events.length + r.beats} playerPage={fightPlayerPage} enemyPage={fightEnemyPage}
      onBack={backToPlan} backLabel="Rearrange" onResult={() => (sheet.value = { kind: 'result' })}
    />
  );
}

export interface ClashViewProps {
  r: ClashResult;
  playerPage: Page;
  enemyPage: Page;
  onBack: () => void;
  backLabel: string;
  onResult: () => void;
  subtitle?: string;
}

export function ClashView({ r, playerPage, enemyPage, onBack, backLabel, onResult, subtitle }: ClashViewProps) {
  const { m, controls } = usePlayback(r);
  const now = performance.now();
  const byUid = new Map(r.fighters.map((f) => [f.uid, f]));
  const pos = (uid: string) => {
    const f = byUid.get(uid)!;
    const at = (c: number) => ({ x: cellX(c) + CELL_PX / 2 + 2, y: drawnY(c, f.team === ENEMY) + CELL_PX / 2 + 4 + yOffset(f.team) });
    const a = at(f.cell);
    if (f.cell2 === undefined) return a;
    const b = at(f.cell2);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const [shownResult, setShownResult] = useState(false);
  useEffect(() => {
    if (m.done && !shownResult) {
      const id = setTimeout(() => { setShownResult(true); onResult(); }, 700);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [m.done, shownResult]);

  const pieces = (team: Team): (PieceView | null)[] => piecesOf(r.fighters.filter((f) => f.team === team), (uid) => {
    const s = m.fs.get(uid)!;
    return s.alive ? (s.stunUntil >= m.beat ? 'stunned' : '') : 'fallen';
  });
  const seconds = (Math.min(m.beat, r.beats) / BEATS_PER_SECOND).toFixed(1);
  const alive = (team: Team) => r.fighters.filter((f) => f.team === team && m.fs.get(f.uid)!.alive).length;

  return (
    <div class="column clash">
      <header class="header">
        <button class="icon-btn" aria-label={backLabel} onClick={onBack}><Icon name="back" /></button>
        <div class="title">
          <div class="title-page">{subtitle ?? 'Clash'}</div>
          <div class="title-sub">{seconds} s, {alive(PLAYER)} against {alive(ENEMY)} standing</div>
        </div>
        <button class="icon-btn" aria-label="Menu" onClick={() => (sheet.value = { kind: 'menu' })}><Icon name="menu" /></button>
      </header>

      <div class="clash-wrap">
        <svg class="clash-svg" viewBox={`0 0 ${BOARD_PX} ${VIEW_H}`} role="img" aria-label={`Clash at ${seconds} seconds`}>
          <svg x="0" y={yOffset(ENEMY)} width={BOARD_PX} height={BOARD_PX} viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`}>
            <PageView id="clash-e" page={enemyPage} pieces={pieces(ENEMY)} sealed={m.sealed[ENEMY]} mirrored label="Their page" />
          </svg>
          <g class="midline">
            <line x1="4" x2={BOARD_PX - 4} y1={BOARD_PX + GAP / 2} y2={BOARD_PX + GAP / 2} />
            <text x={BOARD_PX / 2} y={BOARD_PX + GAP / 2 + 4}>front lines</text>
          </g>
          <svg x="0" y={yOffset(PLAYER)} width={BOARD_PX} height={BOARD_PX} viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`}>
            <PageView id="clash-p" page={playerPage} pieces={pieces(PLAYER)} sealed={m.sealed[PLAYER]} label="Your page" />
          </svg>

          {r.fighters.map((f) => {
            const s = m.fs.get(f.uid)!;
            const p = pos(f.uid);
            if (!s.alive) {
              const age = s.diedAt > 0 ? Math.min(1, (now - s.diedAt) / 400) : 1;
              return <circle key={f.uid} class="blot" cx={p.x} cy={p.y} r={10 + 12 * age} opacity={0.55 * age} />;
            }
            const w = 40, hpFrac = Math.max(0, s.hp / s.maxHp), shFrac = Math.min(1 - hpFrac, s.shield / s.maxHp);
            return (
              <g key={f.uid} class={`hp ${f.team === PLAYER ? 'mine' : 'theirs'}`}>
                {s.fortUntil >= m.beat ? <circle class="fortified" cx={p.x} cy={p.y} r={24.5} /> : null}
                <rect class="hp-back" x={p.x - w / 2} y={p.y + 23} width={w} height={5} rx="2" />
                <rect class="hp-fill" x={p.x - w / 2} y={p.y + 23} width={w * hpFrac} height={5} rx="2" />
                {shFrac > 0 ? <rect class="hp-shield" x={p.x - w / 2 + w * hpFrac} y={p.y + 23} width={w * shFrac} height={5} rx="2" /> : null}
              </g>
            );
          })}

          {m.effects.map((e, i) => {
            const k = Math.min(1, (now - e.start) / e.dur);
            if (e.kind === 'shot') {
              const a = pos(e.from), b = pos(e.to);
              const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
              return <circle key={i} class={`shot ${e.ability ? 'ability' : ''} ${e.team === PLAYER ? 'mine' : 'theirs'}`} cx={x} cy={y} r={e.ability ? 6 : 3.5} />;
            }
            if (e.kind === 'float') {
              const p = pos(e.uid);
              return <text key={i} class={`float ${e.cls}`} x={p.x + (e.slot - 1) * 10} y={p.y - 26 - e.slot * 10 - 18 * k} opacity={1 - k * k}>{e.text}</text>;
            }
            if (e.kind === 'pulse') {
              const p = pos(e.uid);
              return <circle key={i} class="pulse" cx={p.x} cy={p.y} r={22 + 18 * k} opacity={1 - k} />;
            }
            if (e.kind === 'crack') {
              const page = e.team === PLAYER ? playerPage : enemyPage;
              const cage = page.cages[e.cage]!;
              return (
                <g key={i} class="crack" opacity={1 - k}>
                  {cage.cells.map((c) => {
                    const x = cellX(c), y = drawnY(c, e.team === ENEMY) + yOffset(e.team);
                    return <g key={c}><rect x={x} y={y} width={CELL_PX} height={CELL_PX} class="crack-flash" /><path class="crack-line" d={`M${x + 8} ${y + 10}L${x + 28} ${y + 30}L${x + 22} ${y + 44}M${x + 28} ${y + 30}L${x + 50} ${y + 26}`} /></g>;
                  })}
                </g>
              );
            }
            return (
              <text key={i} class="banner" x={BOARD_PX / 2} y={BOARD_PX + GAP / 2 + 5} opacity={k < 0.85 ? 1 : (1 - k) / 0.15}>{e.text}</text>
            );
          })}
        </svg>
      </div>

      <div class="clash-controls">
        {m.done ? (
          <>
            <button class="btn" onClick={() => { controls.restart(); setShownResult(false); }}><Icon name="undo" />Watch again</button>
            <button class="btn primary" onClick={onResult}>See why</button>
          </>
        ) : (
          <>
            <button class="btn" onClick={controls.toggle} aria-label={m.playing ? 'Pause' : 'Play'}><Icon name={m.playing ? 'pause' : 'play'} /></button>
            <button class="btn" onClick={controls.faster} aria-label={`Speed ${m.speed}×`}><Icon name="fast" />{m.speed}×</button>
            <button class="btn" onClick={controls.skip}><Icon name="skip" />Skip</button>
          </>
        )}
      </div>
    </div>
  );
}
