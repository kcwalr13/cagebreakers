/**
 * Garden Siege's screens: the field (hedges, defenders, the pests' route, and the wave as it plays),
 * building and upgrading between waves, picking hybrids, and the season's end.
 */
import { useEffect, useRef } from 'preact/hooks';
import { BASIC, DEFENDERS, type DefenderId, type Element, PESTS, type PestId, SIEGE, WAVES } from '../../content/siege';
import { ENTRY, EXIT, H, W, centre, colOf, rowOf } from '../../core/siege/field';
import { type PieceKind, type SiegeState, costOf, refundOf, siegeScore, walkNow } from '../../core/siege/run';
import { biteOf, mobAt } from '../../core/siege/sim';
import { coachOff, coachSeen, dismissTip } from '../coach';
import { Icon } from '../Icon';
import { ICON_BODIES, type IconName } from '../icons';
import { goBack, screen, sheet } from '../nav';
import { reducedMotion } from '../settings';
import {
  advance, beginWave, finishNow, frame, lastWave, paused, pickHybrid, playing, refusedAt, selected, sellSelected, siege, siegeBest, siegeMessage,
  speed, startSiege, tapField, tool, upgradeSelected,
} from './state';

export const PEST_ICON: Record<PestId, IconName> = { slug: 'slug', snail: 'snail', beetle: 'beetle', moth: 'moth', aphids: 'aphids', aphid: 'aphid', greatSnail: 'greatSnail' };
export const DEF_ICON: Record<DefenderId, IconName> = {
  frog: 'frog', hedgehog: 'hedgehogWatch', thrush: 'thrush', marigold: 'marigold', toad: 'toad', dragonfly: 'dragonfly', bumblebee: 'bumblebee', mantis: 'mantis',
};
const PEST_SIZE: Record<PestId, number> = { slug: 0.62, snail: 0.66, beetle: 0.62, moth: 0.68, aphids: 0.6, aphid: 0.38, greatSnail: 1.05 };
const ELEMENT_CLASS: Record<Element, string> = { water: 'el-water', earth: 'el-earth', air: 'el-air', sun: 'el-sun' };

// The drawing, in squares of CELL: the hedge with its gap above, the bed below.
const CELL = 40, INSET = 4, TOP = 16, BED = 22;
const VW = INSET * 2 + W * CELL, VH = INSET + TOP + H * CELL + BED + INSET;
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

function Field({ s }: { s: SiegeState }) {
  void frame.value;
  const p = playing.value;
  const svg = useRef<SVGSVGElement>(null);
  const walk = p ? null : walkNow(s);
  const sel = selected.value === null ? null : s.placed.find((x) => x.id === selected.value) ?? null;
  const selDef = sel && sel.kind !== 'hedge' ? DEFENDERS[sel.kind] : null;
  const flyers = waveKinds(s.wave).some((k) => PESTS[k.kind].flies);
  const refused = refusedAt.value;
  const onDown = (e: PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const k = Math.floor((pt.x - INSET) / CELL), r = Math.floor((pt.y - INSET - TOP) / CELL);
    if (k >= 0 && k < W && r >= 0 && r < H) tapField(r * W + k);
  };
  const towers = new Map((p?.sim.towers ?? []).map((t) => [t.id, t]));
  return (
    <svg ref={svg} class="siege-board" viewBox={`0 0 ${VW} ${VH}`} role="img" onPointerDown={onDown}
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

      {sel && selDef ? (
        <circle class="sg-reach" cx={X(centre(sel.cell).x)} cy={Y(centre(sel.cell).y)} r={selDef.levels[sel.level]!.range * CELL} />
      ) : null}

      {s.placed.map((pc) => {
        const x = X(colOf(pc.cell)), y = Y(rowOf(pc.cell));
        if (pc.kind === 'hedge') {
          return (
            <g key={pc.id} class={`sg-hedge${sel?.id === pc.id ? ' held' : ''}`}>
              <rect x={x + 2} y={y + 2} width={CELL - 4} height={CELL - 4} rx="9" />
              <circle cx={x + 13} cy={y + 15} r="5" /><circle cx={x + 26} cy={y + 13} r="4.5" /><circle cx={x + 20} cy={y + 26} r="5.5" />
            </g>
          );
        }
        const def = DEFENDERS[pc.kind];
        return (
          <g key={pc.id} class={`sg-def ${ELEMENT_CLASS[def.elements[0]!]}${sel?.id === pc.id ? ' held' : ''}`}>
            <circle class="sg-def-ring" cx={x + CELL / 2} cy={y + CELL / 2} r={CELL / 2 - 3} />
            <Glyph name={DEF_ICON[pc.kind]} x={x + CELL / 2} y={y + CELL / 2 - 1} size={24} cls="sg-def-ico" />
            {Array.from({ length: pc.level + 1 }, (_, i) => <circle key={i} class="sg-pip" cx={x + CELL / 2 + (i - pc.level / 2) * 7} cy={y + CELL - 6} r="2.4" />)}
          </g>
        );
      })}

      {p ? p.strikes.map(({ s: st }, i) => {
        const t = towers.get(st.tower);
        if (!t) return null;
        return st.to.map((to, j) => <path key={`${i}.${j}`} class={`sg-strike ${ELEMENT_CLASS[DEFENDERS[t.kind].elements[0]!]}`} d={`M${X(t.at.x)} ${Y(t.at.y)}L${X(to.x)} ${Y(to.y)}`} />);
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
  return (
    <header class="header hud-row">
      <button class="icon-btn" aria-label="Back to title" onClick={goBack}><Icon name="back" /></button>
      <span class="hud-round"><Icon name="siege" class="ico inline-ico" /> Wave <b>{p ? p.sim.wave : s.wave}</b> of {WAVES.length}</span>
      <span class="hud-stat" aria-label={`${s.seedlings - eatenNow} seedlings`}><Icon name="seedling" class="ico seedling" /><b>{(p ? p.before.seedlings : s.seedlings) - eatenNow}</b></span>
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

function Status({ s }: { s: SiegeState }) {
  const m = siegeMessage.value;
  if (m) return <div key={m.id} class={`status${m.warn ? ' warn' : ''}`} role="status">{m.text}</div>;
  if (playing.value) return <div class="status" role="status">Pause to look closer, or finish the wave at once.</div>;
  const sel = selected.value === null ? null : s.placed.find((x) => x.id === selected.value) ?? null;
  if (sel) {
    if (sel.kind === 'hedge') {
      return (
        <div class="status with-action holding" role="status">
          <span><b>Hedge</b>: pests walk around it.</span>
          <button class="pill-btn" onClick={sellSelected}>Dig up{refundOf(sel) ? ` +${refundOf(sel)}` : ''}</button>
        </div>
      );
    }
    const def = DEFENDERS[sel.kind], lv = def.levels[sel.level]!, up = def.levels[sel.level + 1];
    return (
      <div class="status with-action holding" role="status">
        <span><b>{def.name}</b> {sel.level + 1}: {lv.damage} harm{lv.targets === 99 ? ' to all in reach' : lv.targets ? ` to ${lv.targets}` : ''}{lv.splash ? ', splashing' : ''}{lv.slow ? ', slows' : ''}, every {lv.every} s.</span>
        <span class="sg-sel-btns">
          {up ? <button class="pill-btn buy" disabled={s.coins < up.cost} onClick={upgradeSelected}><Icon name="upgrade" class="ico" />{up.cost}</button> : null}
          <button class="pill-btn" onClick={sellSelected}>Sell +{refundOf(sel)}</button>
        </span>
      </div>
    );
  }
  const last = lastWave.value;
  if (last) {
    return <div class={`status${last.eaten ? ' warn' : ''}`} role="status">Wave {last.wave}: {last.eaten ? `${last.eaten} ${last.eaten === 1 ? 'seedling' : 'seedlings'} eaten` : 'every seedling safe'}. +{last.earned + last.bonus + last.interest} coins{last.interest ? ` (${last.interest} interest)` : ''}.</div>;
  }
  const t = tool.value;
  if (t === 'hedge') return <div class="status" role="status">Hedges turn the pests' way. Tap squares to plant them ({SIEGE.hedge} coin each); they can't close it.</div>;
  if (t) return <div class="status" role="status"><span><b>{DEFENDERS[t].name}</b>: {DEFENDERS[t].text} Tap a square ({DEFENDERS[t].levels[0].cost} coins).</span></div>;
  return <div class="status" role="status">Pick a hedge or a defender, then tap a square. Tap a planted one to upgrade or sell it.</div>;
}

/** What can be planted. While a wave plays it stays in place, greyed, so the field doesn't jump. */
function Tools({ s, locked = false }: { s: SiegeState; locked?: boolean }) {
  const kinds: PieceKind[] = ['hedge', ...BASIC, ...s.unlocked];
  const pick = (k: PieceKind) => { selected.value = null; tool.value = tool.value === k ? null : k; };
  return (
    <div class={`sg-tools${kinds.length > 6 ? ' two-rows' : ''}`} role="toolbar" aria-label="Plant">
      {kinds.map((k) => {
        const cost = costOf(k);
        const name = k === 'hedge' ? 'Hedge' : DEFENDERS[k].name;
        return (
          <button key={k} class={`btn tool${tool.value === k ? ' toggled' : ''}`} aria-pressed={tool.value === k} disabled={locked || (s.coins < cost && tool.value !== k)}
            aria-label={`${name}, ${cost} ${cost === 1 ? 'coin' : 'coins'}`} onClick={() => pick(k)}>
            {k === 'hedge' ? <Icon name="hedgeBush" /> : <Icon name={DEF_ICON[k]} />}
            <span class="tool-name">{name}</span><span class="tool-cost"><Icon name="gold" class="ico xs gold" />{cost}</span>
          </button>
        );
      })}
    </div>
  );
}

function Controls() {
  const p = playing.value;
  if (!p) return <div class="run-controls"><button class="btn primary grow" onClick={beginWave}><Icon name="play" /> Let them come</button></div>;
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

/** Every few waves: pick one of two hybrids. */
function Pick({ s }: { s: SiegeState }) {
  return (
    <section class="sg-pick" aria-label="Pick a hybrid">
      <h2>Pick a hybrid</h2>
      <p>It joins your defenders for the rest of the season.</p>
      <div class="sg-pick-cards">
        {s.offer.map((k) => {
          const d = DEFENDERS[k];
          return (
            <button key={k} class="menu-card sg-hybrid" onClick={() => pickHybrid(k)}>
              <span class="mc-title"><Icon name={DEF_ICON[k]} class="ico inline-ico big" /> {d.name}</span>
              <span class="mc-sub">{d.elements.join(' and ')}. {d.text} {d.levels[0].cost} coins.</span>
            </button>
          );
        })}
      </div>
    </section>
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
  if ((s.phase === 'won' || s.phase === 'lost') && !playing.value) return <SeasonEnd s={s} />;
  return (
    <div class="column run siege">
      <Hud s={s} />
      <WaveBar s={s} />
      <div class="board-wrap siege-wrap"><Field s={s} /></div>
      {s.phase === 'pick' && !playing.value ? <Pick s={s} /> : (
        <>
          <Status s={s} />
          <Tools s={s} locked={!!playing.value} />
          <Controls />
        </>
      )}
      <div class="bottom-pad" />
    </div>
  );
}

/** How Garden Siege is played, for the help sheet. */
export function SiegeHelp() {
  return (
    <>
      <div class="sheet-head"><h2><Icon name="siege" class="ico inline-ico big" /> Garden Siege</h2>
        <button class="icon-btn" onClick={() => (sheet.value = null)} aria-label="Close"><Icon name="close" /></button></div>
      <p>Pests come through the gap in the hedge, wave after wave, and make for the seedling bed. Each one that gets there eats seedlings, one for every layer it still has. Keep {SIEGE.seedlings} seedlings safe through {WAVES.length} waves.</p>
      <p><b>Plant hedges</b> to make the pests walk the long way round: they always take the shortest way left, shown as a dotted line. A hedge can't close the way. Pests that fly go straight over everything.</p>
      <p><b>Plant defenders</b> beside the way. A frog snaps at pests that walk. A hedgehog bites through armour. A thrush reaches far, and harms pests that fly twice over. A marigold warms everything in reach at once. Tap one to see its reach, upgrade it twice, or sell it back for most of its price. Defenders block the way like hedges.</p>
      <p><b>Pests come in layers.</b> A snail's shell cracks to leave a slug, an aphid swarm breaks into three, and beetles' armour takes {PESTS.beetle.armour} off every hit. Every five waves you pick a hybrid of two elements: toad, dragonfly, bumblebee or mantis. Coins come from pests stopped, from each wave and as interest on what you keep. Waves {BOSS_WAVES.join(' and ')} bring a Great Snail.</p>
      <p>A pest that reaches the bed eats {biteOf('slug')} seedling if it's a slug, {biteOf('snail')} if it's a snail, and a Great Snail eats {biteOf('greatSnail')}.</p>
    </>
  );
}
