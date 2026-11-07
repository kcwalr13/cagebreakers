/**
 * Garden Siege's screens: the field (brambles, defenders, the pests' way, and the wave as it plays),
 * planting, growing and upgrading between waves, the seeds of the four elements, and the season's
 * end.
 */
import { useEffect, useRef } from 'preact/hooks';
import { DEFENDERS, type DefenderId, type Element, ELEMENTS, ELEMENT_IDS, HYBRIDS, PESTS, type PestId, SIEGE, WAVES } from '../../content/siege';
import { ENTRY, EXIT, H, W, centre, colOf, rowOf } from '../../core/siege/field';
import { type Placed, type SiegeState, costOf, growthsOf, maxLevel, refundOf, siegeScore, unlockPrice, walkNow } from '../../core/siege/run';
import { biteOf, mobAt } from '../../core/siege/sim';
import { coachOff, coachSeen, dismissTip } from '../coach';
import { Icon } from '../Icon';
import { ICON_BODIES, type IconName } from '../icons';
import { goBack, screen, sheet } from '../nav';
import { reducedMotion } from '../settings';
import {
  advance, beginWave, canUndo, dragField, finishNow, frame, growSelected, lastWave, paused, playing, pressField, refusedAt, releaseField, selected,
  sellSelected, siege, siegeBest, siegeMessage, speed, startSiege, undo, unlockElement, upgradeSelected,
} from './state';

export const PEST_ICON: Record<PestId, IconName> = { slug: 'slug', snail: 'snail', beetle: 'beetle', moth: 'moth', aphids: 'aphids', aphid: 'aphid', greatSnail: 'greatSnail' };
export const DEF_ICON: Record<DefenderId, IconName> = {
  bramble: 'bramble', frog: 'frog', hedgehog: 'hedgehogWatch', thrush: 'thrush', marigold: 'marigold',
  toad: 'toad', dragonfly: 'dragonfly', salamander: 'salamander', mantis: 'mantis', owl: 'owl', bumblebee: 'bumblebee',
};
const PEST_SIZE: Record<PestId, number> = { slug: 0.62, snail: 0.66, beetle: 0.62, moth: 0.68, aphids: 0.6, aphid: 0.38, greatSnail: 1.05 };
const ELEMENT_CLASS: Record<Element, string> = { water: 'el-water', earth: 'el-earth', air: 'el-air', sun: 'el-sun' };
const elementClass = (k: DefenderId) => (DEFENDERS[k].elements.length ? ELEMENT_CLASS[DEFENDERS[k].elements[0]!] : 'el-none');

// The drawing, in squares of CELL: the hedge with its gap above, the bed below.
const CELL = 40, INSET = 4, TOP = 16, BED = 22;
export const VW = INSET * 2 + W * CELL, VH = INSET + TOP + H * CELL + BED + INSET;
const X = (x: number) => INSET + x * CELL, Y = (y: number) => INSET + TOP + y * CELL;

function Glyph({ name, x, y, size, cls }: { name: IconName; x: number; y: number; size: number; cls?: string }) {
  return <g class={cls} transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 512})`} dangerouslySetInnerHTML={{ __html: ICON_BODIES[name] }} />;
}

const BOSS_WAVES = WAVES.map((g, i) => (g.some((x) => x.kind === 'greatSnail') ? i + 1 : 0)).filter(Boolean);

export const pestLine = (kinds: { kind: PestId; count: number }[]) =>
  kinds.map(({ kind, count }) => `${count} ${count === 1 ? PESTS[kind].name.toLowerCase() : PESTS[kind].plural}`).join(', ');

/** A wave's pests, kind by kind. */
export function waveKinds(wave: number): { kind: PestId; count: number }[] {
  const out = new Map<PestId, number>();
  for (const g of WAVES[wave - 1] ?? []) out.set(g.kind, (out.get(g.kind) ?? 0) + g.count);
  return [...out].map(([kind, count]) => ({ kind, count }));
}

/** A bramble: a rounded bush with thorns. */
function Bramble({ x, y, held }: { x: number; y: number; held: boolean }) {
  return (
    <g class={`sg-bramble${held ? ' held' : ''}`}>
      <rect x={x + 3} y={y + 3} width={CELL - 6} height={CELL - 6} rx="10" />
      <path class="sg-thorns" d={`M${x + 9} ${y + 14}l-4-3M${x + 31} ${y + 12}l4-3M${x + 12} ${y + 30}l-4 3M${x + 29} ${y + 29}l4 3M${x + 20} ${y + 8}v-4`} />
      <circle cx={x + 15} cy={y + 17} r="3.2" /><circle cx={x + 25} cy={y + 22} r="3.2" />
    </g>
  );
}

function Field({ s }: { s: SiegeState }) {
  void frame.value;
  const p = playing.value;
  const svg = useRef<SVGSVGElement>(null);
  const down = useRef(false);
  const walk = p ? null : walkNow(s);
  const sel = selected.value === null ? null : s.placed.find((x) => x.id === selected.value) ?? null;
  const flyers = waveKinds(s.wave).some((k) => PESTS[k.kind].flies);
  const refused = refusedAt.value;
  const cellAtPoint = (e: PointerEvent): number | null => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const k = Math.floor((pt.x - INSET) / CELL), r = Math.floor((pt.y - INSET - TOP) / CELL);
    return k >= 0 && k < W && r >= 0 && r < H ? r * W + k : null;
  };
  const onDown = (e: PointerEvent) => {
    const c = cellAtPoint(e);
    if (c === null) return;
    (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
    down.current = true;
    pressField(c);
  };
  const onMove = (e: PointerEvent) => { if (!down.current) return; const c = cellAtPoint(e); if (c !== null) dragField(c); };
  const onUp = () => { if (down.current) { down.current = false; releaseField(); } };
  const towers = new Map((p?.sim.towers ?? []).map((t) => [t.id, t]));
  return (
    <svg ref={svg} class="siege-board" viewBox={`0 0 ${VW} ${VH}`} role="img" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      aria-label={p ? `Wave ${p.sim.wave}: ${p.sim.mobs.length} pests in the garden` : `The garden before wave ${s.wave}: the pests' way is ${walk!.length} squares long`}>
      <rect class="wb-hedge" x={X(0)} y={Y(0) - TOP} width={W * CELL} height={TOP - 3} rx="5" />
      <rect class="wb-gap" x={X(colOf(ENTRY)) + 6} y={Y(0) - TOP - 1} width={CELL - 12} height={TOP} />
      <rect class="wb-bed" x={X(0)} y={Y(H) + 4} width={W * CELL} height={BED - 6} rx="6" />
      <rect class="wb-gate" x={X(colOf(EXIT)) + 8} y={Y(H) + 1} width={CELL - 16} height={7} rx="3" />
      <rect class="sg-lawn" x={X(0)} y={Y(0)} width={W * CELL} height={H * CELL} />
      {Array.from({ length: W - 1 }, (_, k) => <path key={`v${k}`} class="sg-grid" d={`M${X(k + 1)} ${Y(0)}V${Y(H)}`} />)}
      {Array.from({ length: H - 1 }, (_, r) => <path key={`h${r}`} class="sg-grid" d={`M${X(0)} ${Y(r + 1)}H${X(W)}`} />)}

      {walk ? <path class="sg-route" d={`M${X(colOf(ENTRY) + 0.5)} ${Y(-0.4)}${walk.map((c) => `L${X(centre(c).x)} ${Y(centre(c).y)}`).join('')}L${X(colOf(EXIT) + 0.5)} ${Y(H + 0.4)}`} /> : null}
      {walk && flyers ? <path class="sg-flight" d={`M${X(colOf(ENTRY) + 0.5)} ${Y(-0.4)}L${X(colOf(EXIT) + 0.5)} ${Y(H + 0.4)}`} /> : null}

      {sel ? <circle class="sg-reach" cx={X(centre(sel.cell).x)} cy={Y(centre(sel.cell).y)} r={DEFENDERS[sel.kind].levels[sel.level]!.range * CELL} /> : null}

      {s.placed.map((pc) => {
        const x = X(colOf(pc.cell)), y = Y(rowOf(pc.cell));
        if (pc.kind === 'bramble') return <Bramble key={pc.id} x={x} y={y} held={sel?.id === pc.id} />;
        const hybrid = DEFENDERS[pc.kind].tier === 2;
        return (
          <g key={pc.id} class={`sg-def ${elementClass(pc.kind)}${hybrid ? ' hybrid' : ''}${sel?.id === pc.id ? ' held' : ''}`}>
            <circle class="sg-def-ring" cx={x + CELL / 2} cy={y + CELL / 2} r={CELL / 2 - 3} />
            {hybrid ? <circle class={`sg-def-ring2 ${ELEMENT_CLASS[DEFENDERS[pc.kind].elements[1]!]}`} cx={x + CELL / 2} cy={y + CELL / 2} r={CELL / 2 - 6.5} /> : null}
            <Glyph name={DEF_ICON[pc.kind]} x={x + CELL / 2} y={y + CELL / 2 - 1} size={hybrid ? 21 : 24} cls="sg-def-ico" />
            {Array.from({ length: pc.level + 1 }, (_, i) => <circle key={i} class="sg-pip" cx={x + CELL / 2 + (i - pc.level / 2) * 7} cy={y + CELL - 5} r="2.4" />)}
          </g>
        );
      })}

      {p ? p.strikes.map(({ s: st }, i) => {
        const t = towers.get(st.tower);
        if (!t) return null;
        return st.to.map((to, j) => <path key={`${i}.${j}`} class={`sg-strike ${elementClass(t.kind)}`} d={`M${X(t.at.x)} ${Y(t.at.y)}L${X(to.x)} ${Y(to.y)}`} />);
      }) : null}

      {p ? p.sim.mobs.map((m) => {
        const at = mobAt(p.sim, m), size = PEST_SIZE[m.kind] * CELL;
        return (
          <g key={m.id} class={`sg-pest${PESTS[m.kind].flies ? ' flies' : ''}${m.kind === 'greatSnail' ? ' boss' : ''}`}>
            <Glyph name={PEST_ICON[m.kind]} x={X(at.x)} y={Y(at.y)} size={size} />
            {m.hp < m.max ? <><rect class="sg-hp-bg" x={X(at.x) - size / 2} y={Y(at.y) - size / 2 - 5} width={size} height="3.5" rx="1.5" />
              <rect class="sg-hp" x={X(at.x) - size / 2} y={Y(at.y) - size / 2 - 5} width={size * Math.max(0, m.hp / m.max)} height="3.5" rx="1.5" /></> : null}
          </g>
        );
      }) : null}

      {refused && !p ? <rect key={refused.id} class="wb-refused" x={X(colOf(refused.cell))} y={Y(rowOf(refused.cell))} width={CELL} height={CELL} rx="5" /> : null}
      <rect class="wb-frame" x={X(0)} y={Y(0)} width={W * CELL} height={H * CELL} rx="3" />
    </svg>
  );
}

function Hud({ s }: { s: SiegeState }) {
  const p = playing.value;
  const eatenNow = p ? Math.min(p.before.seedlings, p.sim.eaten) : 0;
  const coinsNow = p ? p.before.coins + p.sim.earned : s.coins;
  const seedlings = (p ? p.before.seedlings : s.seedlings) - eatenNow;
  return (
    <header class="header hud-row">
      <button class="icon-btn" aria-label="Back to title" onClick={goBack}><Icon name="back" /></button>
      <span class="hud-round"><Icon name="siege" class="ico inline-ico" /> Wave <b>{p ? p.sim.wave : s.wave}</b> of {WAVES.length}</span>
      <span class="hud-stat" aria-label={`${seedlings} seedlings`}><Icon name="seedling" class="ico seedling" /><b>{seedlings}</b></span>
      <span class="hud-stat" aria-label={`${coinsNow} coins`}><Icon name="gold" class="ico gold" /><b>{coinsNow}</b></span>
      <button class="icon-btn" aria-label="How to play Garden Siege" onClick={() => (sheet.value = { kind: 'siege-help' })}><Icon name="help" /></button>
    </header>
  );
}

/** The next wave's pests, or how the wave is going. */
function WaveBar({ s }: { s: SiegeState }) {
  void frame.value;
  const p = playing.value;
  if (p) {
    const coming = p.sim.queue.length - p.sim.next;
    return (
      <div class="sg-wavebar" role="status">
        <span><b>{p.sim.stopped}</b> stopped · <b>{p.sim.mobs.length}</b> in the garden{coming ? <> · <b>{coming}</b> to come</> : null}</span>
        {p.sim.eaten ? <span class="warn">{Math.min(p.before.seedlings, p.sim.eaten)} eaten</span> : null}
      </div>
    );
  }
  const kinds = waveKinds(s.wave);
  return (
    <div class="sg-wavebar" aria-label={`Wave ${s.wave}: ${pestLine(kinds)}`}>
      <span class="sg-next">Next:</span>
      {kinds.map(({ kind, count }) => (
        <span key={kind} class={`sg-chip${PESTS[kind].flies ? ' flies' : ''}${PESTS[kind].armour ? ' armour' : ''}`} title={PESTS[kind].text}>
          <Icon name={PEST_ICON[kind]} class="ico" />{count}
        </span>
      ))}
      {kinds.some((k) => PESTS[k.kind].flies) ? <span class="sg-note">flies</span> : null}
      {kinds.some((k) => PESTS[k.kind].armour >= 2) ? <span class="sg-note">armour</span> : null}
      {kinds.some((k) => k.kind === 'greatSnail') ? <span class="sg-note warn">boss</span> : null}
    </div>
  );
}

/** One line on what a defender does at its level. */
function statLine(kind: DefenderId, level: number): string {
  const d = DEFENDERS[kind], lv = d.levels[level]!;
  const who = lv.targets === 99 ? 'all in reach' : lv.targets ? `${lv.targets} at once` : 'one';
  return `${lv.damage} harm to ${who} every ${lv.every} s${lv.splash ? ', splashing' : ''}${lv.slow ? ', slowing' : ''}${d.pierce ? ', through armour' : ''}${d.air === 'no' ? '' : d.air === 'double' ? ', double on flyers' : ', reaches flyers'}.`;
}

/** Buttons to grow the piece in hand: open ones by price, locked ones naming the element they need. */
function GrowButtons({ s, p }: { s: SiegeState; p: Placed }) {
  return (
    <>
      {growthsOf(s, p).map((g) => g.open ? (
        <button key={g.into} class={`btn tool grow ${elementClass(g.into)}`} disabled={s.coins < costOf(g.into)} aria-label={`Grow into ${DEFENDERS[g.into].name}, ${costOf(g.into)} coins`}
          onClick={() => growSelected(g.into)}>
          <Icon name={DEF_ICON[g.into]} /><span class="tool-name">{DEFENDERS[g.into].name}</span>
          <span class="tool-cost"><Icon name="gold" class="ico xs gold" />{costOf(g.into)}</span>
        </button>
      ) : (
        <button key={g.into} class="btn tool grow locked" aria-label={`${DEFENDERS[g.into].name}: unlock ${ELEMENTS[g.needs[0]!].name.toLowerCase()} first`}
          onClick={() => (sheet.value = { kind: 'siege-seeds' })}>
          <Icon name={DEF_ICON[g.into]} /><span class="tool-name">{DEFENDERS[g.into].name}</span>
          <span class="tool-cost"><Icon name="lock" class="ico xs" />{ELEMENTS[g.needs[0]!].name}</span>
        </button>
      ))}
    </>
  );
}

/** What's in hand and what it can become, or the first element to pick, or a hint. */
function Panel({ s }: { s: SiegeState }) {
  const m = siegeMessage.value;
  if (playing.value) return <div class="sg-panel"><div class="status">{m ? m.text : 'Pause to look closer, or finish the wave at once.'}</div></div>;
  if (!s.elements.length && s.wave === 1) {
    return (
      <section class="sg-panel" aria-label="Pick your first element">
        <div class="sg-panel-line"><b>Pick your first element.</b> It's free; the next ones cost coins.</div>
        <div class="sg-panel-btns">
          {ELEMENT_IDS.map((e) => (
            <button key={e} class={`btn tool grow ${ELEMENT_CLASS[e]}`} onClick={() => unlockElement(e)}>
              <Icon name={DEF_ICON[ELEMENTS[e].defender]} /><span class="tool-name">{ELEMENTS[e].name}</span><span class="tool-cost">{DEFENDERS[ELEMENTS[e].defender].name}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }
  const sel = selected.value === null ? null : s.placed.find((x) => x.id === selected.value) ?? null;
  if (sel) {
    const d = DEFENDERS[sel.kind];
    const top = sel.level >= maxLevel(sel.kind);
    const line = d.tier === 0 ? <><b>Bramble</b>: {d.text} Grow it into:</>
      : <><b>{d.name}</b>{maxLevel(sel.kind) ? ` ${sel.level + 1}` : ''}: {statLine(sel.kind, sel.level)}{d.tier === 1 && top ? ' Grow it into a hybrid:' : ''}</>;
    return (
      <section class="sg-panel" aria-label={d.name}>
        <div class={`sg-panel-line${m?.warn ? ' warn' : ''}`}>{m ? m.text : line}</div>
        <div class="sg-panel-btns">
          {d.tier === 0 || (d.tier === 1 && top) ? <GrowButtons s={s} p={sel} /> : null}
          {!top ? (
            <button class="btn tool" disabled={s.coins < costOf(sel.kind, sel.level + 1)} aria-label={`Upgrade, ${costOf(sel.kind, sel.level + 1)} coins`} onClick={upgradeSelected}>
              <Icon name="upgrade" /><span class="tool-name">Upgrade</span><span class="tool-cost"><Icon name="gold" class="ico xs gold" />{costOf(sel.kind, sel.level + 1)}</span>
            </button>
          ) : null}
          <button class="btn tool" aria-label={`${d.tier === 0 ? 'Dig up' : 'Sell'}${refundOf(sel) ? ` for ${refundOf(sel)} coins` : ''}`} onClick={sellSelected}>
            <Icon name="remove" /><span class="tool-name">{d.tier === 0 ? 'Dig up' : 'Sell'}</span>{refundOf(sel) ? <span class="tool-cost">+{refundOf(sel)}</span> : null}
          </button>
        </div>
      </section>
    );
  }
  const last = lastWave.value;
  const text = m ? m.text
    : last ? `Wave ${last.wave}: ${last.eaten ? `${last.eaten} ${last.eaten === 1 ? 'seedling' : 'seedlings'} eaten` : 'every seedling safe'}. +${last.earned + last.bonus + last.interest} coins${last.interest ? ` (${last.interest} interest)` : ''}.`
      : `Tap or drag on the garden to plant brambles (${costOf('bramble')} coin each). Tap a bramble to grow it into a defender.`;
  return <div class="sg-panel"><div class={`status${m?.warn || (!m && last?.eaten) ? ' warn' : ''}`} role="status">{text}</div></div>;
}

function Controls({ s }: { s: SiegeState }) {
  const p = playing.value;
  if (!p) {
    const price = unlockPrice(s);
    return (
      <div class="run-controls">
        <button class="btn tool" aria-label={`Seeds: elements${price !== null ? `, the next costs ${price}` : ''}`} onClick={() => (sheet.value = { kind: 'siege-seeds' })}>
          <Icon name="packet" /><span class="tool-name">Seeds</span>
        </button>
        <button class="btn tool" disabled={!canUndo.value} onClick={undo}><Icon name="undo" /><span class="tool-name">Undo</span></button>
        <button class="btn primary grow" onClick={beginWave}><Icon name="play" /> Let them come</button>
      </div>
    );
  }
  return (
    <div class="run-controls sg-speed" role="group" aria-label="Speed">
      <button class={`btn${paused.value ? ' toggled' : ''}`} aria-label={paused.value ? 'Play' : 'Pause'} onClick={() => (paused.value = !paused.value)}>
        <Icon name={paused.value ? 'play' : 'pause'} />
      </button>
      {([1, 2, 4] as const).map((x) => (
        <button key={x} class={`btn${speed.value === x && !paused.value ? ' toggled' : ''}`} aria-pressed={speed.value === x} onClick={() => { speed.value = x; paused.value = false; }}>{x}×</button>
      ))}
      <button class="btn grow" onClick={finishNow}><Icon name="fast" /> Finish</button>
    </div>
  );
}

function SeasonEnd({ s }: { s: SiegeState }) {
  const score = siegeScore(s);
  const won = s.phase === 'won';
  return (
    <div class="column siege-end">
      <header class="header">
        <button class="icon-btn" aria-label="Back to title" onClick={goBack}><Icon name="back" /></button>
        <div class="title"><div class="title-page">Garden Siege</div></div>
      </header>
      <div class={`summary-verdict${won ? '' : ' lost'}`}>
        <h1>{won ? 'The garden held' : 'The seedlings are gone'}</h1>
        <p>{won ? `${s.seedlings} of ${SIEGE.seedlings} seedlings made it through ${WAVES.length} waves.` : `The pests ate the last seedling in wave ${s.records.length}.`}</p>
      </div>
      <div class="watch-score">
        <span><Icon name="seedling" class="ico seedling" /> {Math.max(0, s.seedlings)} × {SIEGE.seedlingPoints} = <b>{score.seedlings}</b></span>
        <span><Icon name="gold" class="ico gold" /> {score.coins} coins kept</span>
        <span class="watch-total">Score <b>{score.total}</b>{siegeBest.value ? ` · best ${siegeBest.value}` : ''}</span>
      </div>
      <table class="records" aria-label="Wave by wave">
        <thead><tr><th>Wave</th><th>Stopped</th><th>Eaten</th><th>Coins</th></tr></thead>
        <tbody>
          {s.records.map((r) => (
            <tr key={r.wave}><td>{r.wave}</td><td>{r.stopped}</td><td class={r.eaten ? 'miss' : 'soft'}>{r.eaten || '–'}</td><td>+{r.earned + r.bonus + r.interest}</td></tr>
          ))}
        </tbody>
      </table>
      <div class="spacer" />
      <div class="row-btns">
        <button class="btn primary wide" onClick={() => startSiege()}>A new season</button>
        <button class="btn wide" onClick={() => (screen.value = 'title')}>Back to the title</button>
      </div>
      <div class="bottom-pad" />
    </div>
  );
}

/** Steps the wave with the screen's frames while one is playing. */
function useWaveClock() {
  const p = playing.value;
  const reduced = reducedMotion.value;
  useEffect(() => {
    if (!p) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const more = advance(now - last, now);
      last = now;
      if (more) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [p?.id, reduced]);
}

export function SiegeScreen() {
  useEffect(() => {
    if (coachOff.value || coachSeen.value.includes('siege-intro')) return;
    dismissTip('siege-intro');
    sheet.value = { kind: 'siege-help' };
  }, []);
  useWaveClock();
  const s = siege.value;
  if (!s) { startSiege(); return null; }
  if (s.phase !== 'build' && !playing.value) return <SeasonEnd s={s} />;
  return (
    <div class="column run siege">
      <Hud s={s} />
      <WaveBar s={s} />
      <div class="board-wrap siege-wrap"><Field s={s} /></div>
      <Panel s={s} />
      <Controls s={s} />
      <div class="bottom-pad" />
    </div>
  );
}

/** The four elements: unlock them, and see what grows from them. */
export function SiegeSeeds() {
  const s = siege.value;
  if (!s) return null;
  const price = unlockPrice(s);
  return (
    <>
      <div class="sheet-head"><h2><Icon name="packet" class="ico inline-ico big" /> Seeds</h2>
        <button class="icon-btn" onClick={() => (sheet.value = null)} aria-label="Close"><Icon name="close" /></button></div>
      <p>Unlock an element to grow brambles into its defender. {price === null ? 'You have all four.' : s.elements.length ? `Your next element costs ${price} coins.` : 'Your first element is free.'}</p>
      <ul class="sg-seeds">
        {ELEMENT_IDS.map((e) => {
          const d = DEFENDERS[ELEMENTS[e].defender];
          const owned = s.elements.includes(e);
          return (
            <li key={e} class={`sg-seed ${ELEMENT_CLASS[e]}${owned ? ' owned' : ''}`}>
              <Icon name={DEF_ICON[d.id]} class="ico sg-seed-ico" />
              <span class="sg-seed-text"><b>{ELEMENTS[e].name}: {d.name}</b> {d.text}</span>
              {owned ? <span class="sg-owned"><Icon name="check" class="ico" /></span>
                : <button class="pill-btn buy" disabled={price === null || s.coins < price || !!playing.value} onClick={() => unlockElement(e)}>{price ? <><Icon name="gold" class="ico xs gold" />{price}</> : 'Free'}</button>}
            </li>
          );
        })}
      </ul>
      <h3 class="sg-seeds-head">Hybrids</h3>
      <p>Grow a defender at its best into the hybrid of its element and another you've unlocked.</p>
      <ul class="sg-hybrids">
        {HYBRIDS.map((h) => {
          const d = DEFENDERS[h];
          const open = d.elements.every((e) => s.elements.includes(e));
          return (
            <li key={h} class={open ? 'open' : ''}>
              <Icon name={DEF_ICON[h]} class="ico" />
              <span><b>{d.name}</b> ({d.elements.map((e) => ELEMENTS[e].name.toLowerCase()).join(' and ')}): {d.text}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** How Garden Siege is played, for the help sheet. */
export function SiegeHelp() {
  return (
    <>
      <div class="sheet-head"><h2><Icon name="siege" class="ico inline-ico big" /> Garden Siege</h2>
        <button class="icon-btn" onClick={() => (sheet.value = null)} aria-label="Close"><Icon name="close" /></button></div>
      <p>Pests come through the gap in the hedge, wave after wave, and make for the seedling bed. Each one that gets there eats seedlings, one for every layer it still has. Keep {SIEGE.seedlings} seedlings safe through {WAVES.length} waves.</p>
      <p><b>Plant brambles</b> by tapping or dragging on the garden. Pests always take the shortest way left, shown as a dotted line, so brambles make them walk the long way round; a bramble can't close the way. Brambles scratch pests that pass beside them. Pests that fly go straight over everything.</p>
      <p><b>Grow your brambles.</b> Unlock elements in Seeds (the first is free). Tap a bramble to grow it into an element's defender: a frog (water) snaps at walking pests, a hedgehog (earth) bites through armour, a thrush (air) reaches far and harms flyers twice over, a marigold (sun) warms everything in reach. Upgrade a defender twice, then grow it into a hybrid with another element you've unlocked: toad, dragonfly, salamander, mantis, owl or bumblebee.</p>
      <p><b>Pests come in layers.</b> A snail's shell cracks to leave a slug, an aphid swarm breaks into three, and beetles' armour takes {PESTS.beetle.armour} off every hit. Waves {BOSS_WAVES.join(' and ')} bring a Great Snail, which eats {biteOf('greatSnail')} seedlings if it gets through. Coins come from pests stopped, from each wave, and as interest on what you keep. Undo takes back anything since the last wave.</p>
    </>
  );
}
