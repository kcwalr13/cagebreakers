/**
 * Night Watch's screens: the misty garden with its clues, the tools, the night as it happens, and
 * the season's end.
 */
import { useEffect, useState } from 'preact/hooks';
import { DEFENDERS, DEFENDER_IDS, type DefenderId, PESTS, type PestId, WATCH } from '../../content/watch';
import {
  CLEAR, TRAIL, UNKNOWN, type WatchState, dewAt, knownAt, markedTrail, markedWhole, pestsOf, reachOf, readout, watchBoard, watchScore,
} from '../../core/watch/run';
import { coachOff, coachSeen, dismissTip } from '../coach';
import { Icon } from '../Icon';
import { ICON_BODIES, type IconName } from '../icons';
import { goBack, screen, sheet } from '../nav';
import { reducedMotion } from '../settings';
import {
  type WatchTool, endPlayback, holding, letThemCome, liftHeld, pestLine, playback, refusedAt, startWatch, tapSquare, tool, watch, watchBest,
  watchMessage,
} from './state';

export const DEFENDER_ICON: Record<DefenderId, IconName> = { frog: 'frog', hedgehog: 'hedgehogWatch', thrush: 'thrush' };
export const PEST_ICON: Record<PestId, IconName> = { slug: 'slug', snail: 'snail' };

// The drawing: squares, the tallies above and to the right, the hedge above and the bed below.
const CELL = 50, INSET = 4, TOP = 26, HEDGE = 20, BED = 34, RIGHT = 30;
const b = watchBoard();
const GX = INSET, GY = INSET + TOP + HEDGE;
const W = INSET * 2 + b.width * CELL + RIGHT, H = GY + b.height * CELL + BED + INSET;
const cx = (c: number) => GX + b.colOf(c) * CELL + CELL / 2;
const cy = (c: number) => GY + b.rowOf(c) * CELL + CELL / 2;

function Glyph({ name, x, y, size, cls }: { name: IconName; x: number; y: number; size: number; cls?: string }) {
  return <g class={cls} transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 512})`} dangerouslySetInnerHTML={{ __html: ICON_BODIES[name] }} />;
}

/** Line segments joining neighbouring trail squares, as one path. */
function trailPath(cells: readonly number[], entry: number, exit: number, ends: boolean): string {
  const on = new Set(cells);
  let d = '';
  for (const c of cells) {
    for (const n of b.orth[c]!) if (n > c && on.has(n)) d += `M${cx(c)} ${cy(c)}L${cx(n)} ${cy(n)}`;
  }
  if (ends && on.has(entry)) d += `M${cx(entry)} ${GY - HEDGE}L${cx(entry)} ${cy(entry)}`;
  if (ends && on.has(exit)) d += `M${cx(exit)} ${cy(exit)}L${cx(exit)} ${GY + b.height * CELL + BED / 2}`;
  return d;
}

/** Whether a count clue is met, broken, or still open, given what the player takes for trail. */
function countState(cells: readonly number[], want: number, taken: ReadonlySet<number>, open: (c: number) => boolean): 'met' | 'over' | '' {
  const t = cells.filter((c) => taken.has(c)).length;
  if (t > want) return 'over';
  if (t === want && !cells.some((c) => !taken.has(c) && open(c))) return 'met';
  return '';
}

interface Walker { kind: PestId; cell: number; gone: boolean }

function Garden({ s, night }: { s: WatchState; night?: { trail: number[]; walkers: Walker[]; trampled: Set<number>; bites: Set<number> } }) {
  const { clues } = s.current;
  const known = (c: number) => knownAt(s, c);
  const taken = new Set(markedTrail(s));
  const open = (c: number) => known(c) === null && s.marks[c] === UNKNOWN;
  const held = holding.value === null ? null : s.defenders.find((d) => d.id === holding.value) ?? null;
  const reach = new Set(held ? reachOf(b, held.kind, held.cell) : []);
  const refused = refusedAt.value;
  const rows = Array.from({ length: b.height }, (_, r) => Array.from({ length: b.width }, (_, k) => b.cellAt(r, k)));
  const cols = Array.from({ length: b.width }, (_, k) => Array.from({ length: b.height }, (_, r) => b.cellAt(r, k)));
  const lost = WATCH.seedlings - s.seedlings;
  const label = night ? `The garden at night: the trail has ${night.trail.length} squares` : `The garden under mist, night ${s.night}`;
  return (
    <svg class="watch-board" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {/* The hedge, with its gap, and the bed with its seedlings. */}
      <rect class="wb-hedge" x={GX} y={GY - HEDGE} width={b.width * CELL} height={HEDGE - 3} rx="6" />
      <rect class="wb-gap" x={GX + b.colOf(clues.entry) * CELL + 8} y={GY - HEDGE - 1} width={CELL - 16} height={HEDGE} />
      <rect class="wb-bed" x={GX} y={GY + b.height * CELL + 4} width={b.width * CELL} height={BED - 6} rx="7" />
      <rect class="wb-gate" x={GX + b.colOf(clues.exit) * CELL + 10} y={GY + b.height * CELL + 1} width={CELL - 20} height={8} rx="3" />
      {Array.from({ length: WATCH.seedlings }, (_, i) => {
        const x = GX + (b.width * CELL) * (i + 0.5) / WATCH.seedlings, y = GY + b.height * CELL + BED / 2 + 3;
        return <Glyph key={i} name="seedling" x={x} y={y} size={22} cls={`wb-seedling${i >= WATCH.seedlings - lost ? ' eaten' : ''}`} />;
      })}

      {b.all.map((c) => {
        const x = GX + b.colOf(c) * CELL, y = GY + b.rowOf(c) * CELL;
        const k = night ? (night.trail.includes(c) ? 'trail' : 'clear') : known(c);
        const cls = k === 'trail' ? 'known-trail' : k === 'clear' ? 'known-clear' : 'misty';
        return (
          <g key={c} onClick={() => tapSquare(c)}>
            <rect class={`wb-sq ${cls}${reach.has(c) ? ' reach' : ''}`} x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx="5" />
            {!night && k === null && s.marks[c] === CLEAR ? <path class="wb-x" d={`M${x + 19} ${y + 19}l12 12M${x + 31} ${y + 19}l-12 12`} /> : null}
          </g>
        );
      })}

      {/* The trail: what the player takes for trail, or by night the real one. */}
      {night
        ? <path class="wb-trail real" d={trailPath(night.trail, clues.entry, clues.exit, true)} />
        : <path class="wb-trail" d={trailPath([...taken], clues.entry, clues.exit, true)} />}
      {(night ? night.trail : [...taken]).map((c) => (
        <circle key={`t${c}`} class={`wb-dot${known(c) === 'trail' || night ? ' known' : ''}`} cx={cx(c)} cy={cy(c)} r={known(c) === 'trail' && !night ? 7 : 5.5} />
      ))}

      {!night ? b.all.map((c) => {
        const n = dewAt(s, c);
        if (n === null) return null;
        const st = countState(b.around[c]!, n, taken, open);
        return <text key={`d${c}`} class={`wb-dew ${st}`} x={cx(c)} y={cy(c) + 9} onClick={() => tapSquare(c)}>{n}</text>;
      }) : null}

      {/* Tallies: across the top for columns, down the right for rows. */}
      {clues.cols.map((n, k) => (
        <text key={`c${k}`} class={`wb-tally ${n === null ? 'hidden' : night ? '' : countState(cols[k]!, n, taken, open)}`} x={GX + k * CELL + CELL / 2} y={INSET + TOP - 7}>{n ?? '·'}</text>
      ))}
      {clues.rows.map((n, r) => (
        <text key={`r${r}`} class={`wb-tally ${n === null ? 'hidden' : night ? '' : countState(rows[r]!, n, taken, open)}`} x={GX + b.width * CELL + RIGHT / 2 + 2} y={GY + r * CELL + CELL / 2 + 7}>{n ?? '·'}</text>
      ))}

      {s.defenders.map((d) => {
        const flat = night?.trampled.has(d.id);
        const biting = night?.bites.has(d.id);
        const onMarked = !night && taken.has(d.cell);
        return (
          <g key={`f${d.id}`} class={`wb-def${held?.id === d.id ? ' held' : ''}${flat ? ' trampled' : ''}${biting ? ' biting' : ''}${onMarked ? ' danger' : ''}`} onClick={() => tapSquare(d.cell)}>
            <circle class="wb-def-ring" cx={cx(d.cell)} cy={cy(d.cell)} r={20} />
            <Glyph name={DEFENDER_ICON[d.kind]} x={cx(d.cell)} y={cy(d.cell)} size={30} cls="wb-def-ico" />
          </g>
        );
      })}

      {night?.walkers.map((w, i) => (w.gone || w.cell < 0 ? null : (
        <Glyph key={`p${i}`} name={PEST_ICON[w.kind]} x={cx(w.cell)} y={cy(w.cell)} size={w.kind === 'snail' ? 30 : 28} cls={`wb-pest ${w.kind}`} />
      )))}

      {refused && !night ? (
        <rect key={refused.id} class="wb-refused" x={GX + b.colOf(refused.cell) * CELL} y={GY + b.rowOf(refused.cell) * CELL} width={CELL} height={CELL} rx="5" />
      ) : null}
      <rect class="wb-frame" x={GX} y={GY} width={b.width * CELL} height={b.height * CELL} rx="4" />
    </svg>
  );
}

function Hud({ s }: { s: WatchState }) {
  const shown = playback.value?.before ?? s;
  return (
    <header class="header hud-row">
      <button class="icon-btn" aria-label="Back to title" onClick={goBack}><Icon name="back" /></button>
      <span class="hud-round"><Icon name="night" class="ico inline-ico" /> Night <b>{shown.night}</b> of {WATCH.nights}</span>
      <span class="hud-stat" aria-label={`${s.seedlings} seedlings`}><Icon name="seedling" class="ico seedling" /><b>{s.seedlings}</b></span>
      <span class="hud-stat" aria-label={`${s.coins} ${s.coins === 1 ? 'coin' : 'coins'}`}><Icon name="gold" class="ico gold" /><b>{s.coins}</b></span>
      <button class="icon-btn" aria-label="How to play Night Watch" onClick={() => (sheet.value = { kind: 'watch-help' })}><Icon name="help" /></button>
    </header>
  );
}

/** Tonight's pests, and how they'd fare on the trail as marked. */
function Tonight({ s }: { s: WatchState }) {
  const rows = readout(s);
  const whole = markedWhole(s);
  return (
    <section class="tonight" aria-label="Tonight">
      <div class="tonight-head">
        <span>Tonight: <b>{pestLine(pestsOf(s.night))}</b></span>
        <span class="tonight-note">{whole ? 'on the trail you marked' : 'mark the whole trail to be sure'}</span>
      </div>
      <ul class="tonight-pests">
        {rows.map((r) => {
          const ok = r.harm >= r.hp;
          return (
            <li key={r.kind} class={`pest-row${ok ? ' stopped' : ''}`}>
              <Icon name={PEST_ICON[r.kind]} class="ico pest-ico" />
              <span class="pest-name">{r.count} × {PESTS[r.kind].name}</span>
              <span class="harm-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (100 * r.harm) / r.hp)}%` }} /></span>
              <span class="harm-num" aria-label={`${r.harm} harm of ${r.hp} needed`}>{r.harm}/{r.hp}</span>
              {ok ? <Icon name="check" class="ico ok" /> : <span class="ico-pad" />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const TOOL_HINT: Record<WatchTool, string> = {
  mark: 'Tap a misty square to mark it: once for trail, again for clear.',
  frog: '', hedgehog: '', thrush: '',
  lantern: `Tap a misty square to light it and see what it holds (${WATCH.lantern} coins).`,
};

function Status({ s }: { s: WatchState }) {
  const m = watchMessage.value;
  const held = holding.value === null ? null : s.defenders.find((d) => d.id === holding.value);
  if (m) return <div key={m.id} class={`status${m.warn ? ' warn' : ''}`} role="status">{m.text}</div>;
  if (held) {
    const d = DEFENDERS[held.kind];
    const fresh = held.night === s.night;
    return (
      <div class="status with-action holding" role="status">
        <span><b>{d.name}</b>: {d.text.toLowerCase().replace(/\.$/, '')}. Tap a square to move it{!fresh && WATCH.move ? ` (${WATCH.move} coin)` : ''}.</span>
        {fresh ? <button class="pill-btn" onClick={liftHeld}>Take back +{d.cost}</button> : <button class="pill-btn" onClick={() => (holding.value = null)}>Done</button>}
      </div>
    );
  }
  const t = tool.value;
  const text = t === 'mark' || t === 'lantern' ? TOOL_HINT[t] : `${DEFENDERS[t].text} Tap a square to plant one (${DEFENDERS[t].cost} coins).`;
  return <div class="status" role="status">{text}</div>;
}

function Tools({ s }: { s: WatchState }) {
  const pick = (t: WatchTool) => { holding.value = null; tool.value = tool.value === t ? 'mark' : t; };
  return (
    <div class="watch-tools" role="toolbar" aria-label="Tools">
      <button class={`btn tool${tool.value === 'mark' ? ' toggled' : ''}`} aria-pressed={tool.value === 'mark'} onClick={() => pick('mark')}>
        <Icon name="trailMark" /><span class="tool-name">Mark</span><span class="tool-cost">free</span>
      </button>
      {DEFENDER_IDS.map((id) => (
        <button key={id} class={`btn tool${tool.value === id ? ' toggled' : ''}`} aria-pressed={tool.value === id} disabled={s.coins < DEFENDERS[id].cost && tool.value !== id}
          aria-label={`${DEFENDERS[id].name}, ${DEFENDERS[id].cost} coins`} onClick={() => pick(id)}>
          <Icon name={DEFENDER_ICON[id]} /><span class="tool-name">{DEFENDERS[id].name}</span><span class="tool-cost"><Icon name="gold" class="ico xs gold" />{DEFENDERS[id].cost}</span>
        </button>
      ))}
      <button class={`btn tool${tool.value === 'lantern' ? ' toggled' : ''}`} aria-pressed={tool.value === 'lantern'} disabled={s.coins < WATCH.lantern && tool.value !== 'lantern'}
        aria-label={`Lantern, ${WATCH.lantern} coins`} onClick={() => pick('lantern')}>
        <Icon name="lanternLight" /><span class="tool-name">Lantern</span><span class="tool-cost"><Icon name="gold" class="ico xs gold" />{WATCH.lantern}</span>
      </button>
    </div>
  );
}

const STEP_MS = 230, GAP_MS = 900;

/** The night as it happens: the mist lifts, the pests come one after another along the real trail. */
function Night() {
  const pb = playback.value!;
  const { before, record } = pb;
  const reduced = reducedMotion.value;
  const total = (record.walks.length - 1) * GAP_MS + (record.trail.length + 2) * STEP_MS;
  const [t, setT] = useState(reduced ? total : 0);
  useEffect(() => {
    if (reduced) return;
    const t0 = performance.now();
    let raf = 0;
    // A tap skips to the morning; time only ever moves forward from there.
    const tick = () => { const now = performance.now() - t0; setT((was) => Math.max(was, now)); if (now < total) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pb.id]);
  const done = t >= total;
  const on = new Set(record.trail);
  const trampled = new Set(before.defenders.filter((d) => on.has(d.cell)).map((d) => d.id));
  const bites = new Set<number>();
  const walkers: Walker[] = record.walks.map((w, i) => {
    const step = Math.floor((t - i * GAP_MS) / STEP_MS);
    if (step < 0) return { kind: w.kind, cell: -1, gone: false };
    const gone = (w.stoppedAt !== null && step > w.stoppedAt) || step >= record.trail.length;
    const cell = record.trail[Math.min(step, record.trail.length - 1)]!;
    if (!gone) for (const d of before.defenders) if (!trampled.has(d.id) && reachOf(b, d.kind, d.cell).includes(cell)) bites.add(d.id);
    return { kind: w.kind, cell, gone };
  });
  const stopped = record.walks.filter((w) => w.stoppedAt !== null).length;
  const shownState: WatchState = { ...before, seedlings: done ? before.seedlings - record.lost : before.seedlings };
  const last = watch.value!.phase !== 'plan';
  return (
    <>
      <div class="board-wrap watch-wrap" onClick={() => !done && setT(total)}>
        <Garden s={shownState} night={{ trail: record.trail, walkers, trampled, bites }} />
      </div>
      {done ? (
        <section class="morning" aria-label="Morning">
          <h2>{record.lost ? `${record.lost} ${record.lost === 1 ? 'seedling' : 'seedlings'} eaten` : 'Every seedling safe'}</h2>
          <p>
            {stopped === record.walks.length ? `All ${record.walks.length} pests stopped on the trail.`
              : `${stopped} of ${record.walks.length} pests stopped; ${record.walks.length - stopped} reached the bed.`}
            {record.trampled.length ? ` Trodden down on the trail: ${record.trampled.map((k) => DEFENDERS[k].name.toLowerCase()).join(', ')}.` : ''}
            {` +${record.coins} coins in the morning.`}
          </p>
          <button class="btn primary wide" onClick={endPlayback}>{last ? 'How the season went' : `On to night ${before.night + 1}`}</button>
        </section>
      ) : (
        <div class="status">The mist lifts. Tap to see the morning.</div>
      )}
    </>
  );
}

function SeasonEnd({ s }: { s: WatchState }) {
  const score = watchScore(s);
  const won = s.phase === 'done';
  return (
    <div class="column watch-end">
      <header class="header">
        <button class="icon-btn" aria-label="Back to title" onClick={goBack}><Icon name="back" /></button>
        <div class="title"><div class="title-page">Night Watch</div></div>
      </header>
      <div class={`summary-verdict${won ? '' : ' lost'}`}>
        <h1>{won ? 'The season is over' : 'The seedlings are gone'}</h1>
        <p>{won ? `${s.seedlings} of ${WATCH.seedlings} seedlings made it through ${WATCH.nights} nights.` : `The pests ate the last seedling on night ${s.records.length}.`}</p>
      </div>
      <div class="watch-score">
        <span><Icon name="seedling" class="ico seedling" /> {s.seedlings} × {WATCH.seedlingPoints} = <b>{score.seedlings}</b></span>
        <span><Icon name="gold" class="ico gold" /> {score.coins} coins kept</span>
        <span class="watch-total">Score <b>{score.total}</b>{watchBest.value ? ` · best ${watchBest.value}` : ''}</span>
      </div>
      <table class="records" aria-label="Night by night">
        <thead><tr><th>Night</th><th>Pests</th><th>Stopped</th><th>Eaten</th></tr></thead>
        <tbody>
          {s.records.map((r) => {
            const stopped = r.walks.filter((w) => w.stoppedAt !== null).length;
            return <tr key={r.night}><td>{r.night}</td><td>{r.walks.length}</td><td>{stopped}</td><td class={r.lost ? 'miss' : 'soft'}>{r.lost || '–'}</td></tr>;
          })}
        </tbody>
      </table>
      <div class="spacer" />
      <div class="row-btns">
        <button class="btn primary wide" onClick={() => startWatch()}>A new season</button>
        <button class="btn wide" onClick={() => (screen.value = 'title')}>Back to the title</button>
      </div>
      <div class="bottom-pad" />
    </div>
  );
}

export function WatchScreen() {
  // The first time in, the rules open by themselves.
  useEffect(() => {
    if (coachOff.value || coachSeen.value.includes('watch-intro')) return;
    dismissTip('watch-intro');
    sheet.value = { kind: 'watch-help' };
  }, []);
  const s = watch.value;
  if (!s) { startWatch(); return null; }
  if (s.phase !== 'plan' && !playback.value) return <SeasonEnd s={s} />;
  if (playback.value) {
    return (
      <div class="column run watch">
        <Hud s={s} />
        <Night />
        <div class="bottom-pad" />
      </div>
    );
  }
  return (
    <div class="column run watch">
      <Hud s={s} />
      <Tonight s={s} />
      <div class="board-wrap watch-wrap"><Garden s={s} /></div>
      <Status s={s} />
      <Tools s={s} />
      <div class="run-controls">
        <button class="btn primary grow" onClick={letThemCome}><Icon name="night" /> Let them come</button>
      </div>
      <div class="bottom-pad" />
    </div>
  );
}

/** How Night Watch is played, for the help sheet. */
export function WatchHelp() {
  return (
    <>
      <div class="sheet-head"><h2><Icon name="night" class="ico inline-ico big" /> Night Watch</h2>
        <button class="icon-btn" onClick={() => (sheet.value = null)} aria-label="Close"><Icon name="close" /></button></div>
      <p>Every night the mist comes down, and pests creep in through the gap in the hedge along a hidden trail to your seedling bed. The trail runs from square to square, never doubling back beside itself.</p>
      <p><b>Read the clues.</b> The numbers above the garden and down its right side count the trail's squares in each column and row (a dot means that count is hidden). A lit square is never trail; its number counts the trail squares among the eight around it. Tap a misty square to mark it as trail, tap again to mark it clear. A count turns pale when your marks meet it, and red when they break it.</p>
      <p><b>Plant defenders</b> with your coins, off the trail: one planted on it is trodden down. A frog snaps at the eight squares around it, a hedgehog bites hard on the four beside it, a thrush swoops two squares along its row and column. A pest is harmed on every square of their reach it crosses, and stopped once the harm reaches its strength. Above the garden you can see how tonight's pests would fare on the trail you marked.</p>
      <p><b>Let them come.</b> Any pest that reaches the bed eats a seedling. Your defenders stay from night to night, and you can tap one to move it. The lantern lights a misty square to show what it holds, for {WATCH.lantern} coins. Each morning brings {WATCH.morning} coins. Keep seedlings safe for {WATCH.nights} nights: each one left is worth {WATCH.seedlingPoints} points, and every coin kept is worth one.</p>
    </>
  );
}
