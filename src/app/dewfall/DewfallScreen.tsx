/**
 * Dewfall's screens: a puzzle (the misty garden, its clues, the brush, undo and the lantern, and the
 * slug crawling its trail once it's solved), the book of chapters, and how to play.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { CHAPTERS, UNLOCK_AFTER } from '../../content/dewfall';
import { type Dir } from '../../core/dewfall/board';
import { CLEAR, type Clue, type Puzzle, TRAIL, UNKNOWN, colCells, countState, countedBy, puzzleBoard, rowCells } from '../../core/dewfall/clues';
import {
  type Attempt, afterInBook, bookId, chapterOpen, chapterPuzzles, knownAt, parseId, puzzleName, shownMarks, solvedIn, starsIn, takenTrail,
} from '../../core/dewfall/play';
import { coachOff, coachSeen, dismissTip } from '../coach';
import { Icon } from '../Icon';
import { ICON_BODIES, type IconName } from '../icons';
import { backTo, goBack, screen, sheet } from '../nav';
import { reducedMotion } from '../settings';
import {
  attempt, bookTotals, brush, canUndo, celebrating, dewMessage, dewProfile, doDew, lantern, lanternAsked, litNow, openPuzzle, puzzle, replay,
  strokeEnd, strokeMove, strokeStart, undo,
} from './state';

// The drawing: squares, column tallies above the hedge, row tallies down the right, the bed below.
const CELL = 48, INSET = 4, TOP = 26, HEDGE = 18, BED = 22, RIGHT = 30;
const GX = INSET, GY = INSET + TOP + HEDGE;
const sizeOf = (p: Pick<Puzzle, 'width' | 'height'>) => ({ w: INSET * 2 + p.width * CELL + RIGHT, h: GY + p.height * CELL + BED + INSET });

function Glyph({ name, x, y, size, cls }: { name: IconName; x: number; y: number; size: number; cls?: string }) {
  return <g class={cls} transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 512})`} dangerouslySetInnerHTML={{ __html: ICON_BODIES[name] }} />;
}

const ARROW: Record<Dir, [number, number]> = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] };

/** A clue drawn at (x, y), the middle of its square. `st` is whether its count is met or broken. */
export function ClueMark({ clue, x, y, st = '' }: { clue: Clue; x: number; y: number; st?: string }) {
  switch (clue.kind) {
    case 'dew':
      return (
        <g class={`df-dew ${st}`}>
          <path class="df-drop" d={`M${x} ${y - 19}C${x + 4} ${y - 12} ${x + 14} ${y - 3} ${x + 14} ${y + 5}a14 14 0 0 1-28 0C${x - 14} ${y - 3} ${x - 4} ${y - 12} ${x} ${y - 19}Z`} />
          <text class="df-num" x={x} y={y + 11}>{clue.n}</text>
        </g>
      );
    case 'leaf':
      return (
        <g class={`df-leaf ${st}`}>
          <path class="df-leafshape" d={`M${x - 16} ${y + 15}C${x - 17} ${y - 5} ${x - 6} ${y - 16} ${x + 16} ${y - 16}C${x + 17} ${y + 4} ${x + 6} ${y + 15} ${x - 16} ${y + 15}Z`} />
          <path class="df-rib" d={`M${x - 16} ${y + 15}L${x - 9} ${y + 8}`} />
          <text class="df-num" x={x + 1} y={y + 7}>{clue.n}</text>
        </g>
      );
    case 'scarecrow': {
      const [dx, dy] = ARROW[clue.dir];
      const tip = [x + dx * 21, y + dy * 21], back = [x + dx * 14, y + dy * 14];
      const side = [-dy * 6, dx * 6];
      // Looking along a row: the scarecrow behind its number. Up or down: side by side, set back from the arrow.
      const ico = dx ? [x - dx * 10, y] : [x - 9, y - dy * 5];
      const num = dx ? [x + dx * 5, y + 7] : [x + 9, y - dy * 5 + 7];
      return (
        <g class={`df-crow ${st}`}>
          <Glyph name="scarecrow" x={ico[0]!} y={ico[1]!} size={24} cls="df-crow-ico" />
          <text class="df-num small" x={num[0]} y={num[1]}>{clue.n}</text>
          <path class="df-arrow" d={`M${tip[0]} ${tip[1]}L${back[0]! + side[0]!} ${back[1]! + side[1]!}L${back[0]! - side[0]!} ${back[1]! - side[1]!}Z`} />
        </g>
      );
    }
    case 'pebble':
      return <g class="df-pebble"><ellipse cx={x} cy={y + 1} rx="12" ry="10" /><ellipse class="df-pebble-hi" cx={x - 4} cy={y - 3} rx="4" ry="2.6" /></g>;
    case 'acorn':
      return <Glyph name="acorn" x={x} y={y} size={30} cls="df-acorn" />;
    case 'glint':
      return <Glyph name="glint" x={x} y={y} size={26} cls="df-glint" />;
  }
}

/** A count hidden in mist: two soft wavy lines. */
export function Mist({ x, y }: { x: number; y: number }) {
  return <path class="df-mist" d={`M${x - 9} ${y - 3}q4.5-4 9 0t9 0M${x - 9} ${y + 4}q4.5-4 9 0t9 0`} />;
}

/** Line segments joining neighbouring trail squares, as one path, with the trail's ends running into the hedge gap and the bed. */
function trailPath(p: Puzzle, cells: Iterable<number>, cx: (c: number) => number, cy: (c: number) => number): string {
  const b = puzzleBoard(p);
  const on = new Set(cells);
  let d = '';
  for (const c of on) for (const n of b.orth[c]!) if (n > c && on.has(n)) d += `M${cx(c)} ${cy(c)}L${cx(n)} ${cy(n)}`;
  if (on.has(p.entry)) d += `M${cx(p.entry)} ${GY - HEDGE}L${cx(p.entry)} ${cy(p.entry)}`;
  if (on.has(p.exit)) d += `M${cx(p.exit)} ${cy(p.exit)}L${cx(p.exit)} ${GY + p.height * CELL + BED / 2}`;
  return d;
}

/** The garden: tap or drag to paint squares, tap a tally to fill its settled line. `crawl` is how far along the trail the slug has come. */
function Garden({ p, a, crawl }: { p: Puzzle; a: Attempt; crawl: number | null }) {
  const b = puzzleBoard(p);
  const { w, h } = sizeOf(p);
  const cx = (c: number) => GX + b.colOf(c) * CELL + CELL / 2;
  const cy = (c: number) => GY + b.rowOf(c) * CELL + CELL / 2;
  const svg = useRef<SVGSVGElement>(null);
  const down = useRef(false);
  const shown = shownMarks(p, a);
  const taken = a.solved ? new Set(p.trail) : takenTrail(p, a);
  const open = (c: number) => shown[c] === UNKNOWN;
  const lit = litNow.value;

  const at = (e: PointerEvent): { cell: number } | { row: number } | { col: number } | null => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const k = Math.floor((pt.x - GX) / CELL), r = Math.floor((pt.y - GY) / CELL);
    if (k >= 0 && k < p.width && r >= 0 && r < p.height) return { cell: b.cellAt(r, k) };
    if (k >= 0 && k < p.width && pt.y < GY - HEDGE + 4 && pt.y > 0) return { col: k };
    if (r >= 0 && r < p.height && pt.x >= GX + p.width * CELL && pt.x < w) return { row: r };
    return null;
  };
  const onDown = (e: PointerEvent) => {
    if (a.solved || crawl !== null) return;
    const hit = at(e);
    if (!hit) return;
    if ('cell' in hit) {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      down.current = true;
      strokeStart(hit.cell);
    } else if ('row' in hit) doDew({ type: 'fill', axis: 'rows', index: hit.row });
    else doDew({ type: 'fill', axis: 'cols', index: hit.col });
  };
  const onMove = (e: PointerEvent) => {
    if (!down.current) return;
    const hit = at(e);
    if (hit && 'cell' in hit) strokeMove(hit.cell);
  };
  const onUp = () => { if (down.current) { down.current = false; strokeEnd(); } };

  const slugAt = crawl === null ? -1 : Math.min(p.trail.length - 1, Math.floor(crawl));
  const crawled = crawl === null ? p.trail : p.trail.slice(0, slugAt + 1);
  const name = puzzleName(a.id);
  return (
    <svg ref={svg} class={`dew-board${a.solved ? ' solved' : ''}`} viewBox={`0 0 ${w} ${h}`} role="img"
      aria-label={a.solved ? `${name}, solved: the trail has ${p.trail.length} squares` : `${name}: a garden ${p.width} squares across and ${p.height} down`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <rect class="wb-hedge" x={GX} y={GY - HEDGE} width={p.width * CELL} height={HEDGE - 3} rx="6" />
      <rect class="wb-gap" x={GX + b.colOf(p.entry) * CELL + 8} y={GY - HEDGE - 1} width={CELL - 16} height={HEDGE} />
      <rect class="wb-bed" x={GX} y={GY + p.height * CELL + 4} width={p.width * CELL} height={BED - 6} rx="6" />
      <rect class="wb-gate" x={GX + b.colOf(p.exit) * CELL + 10} y={GY + p.height * CELL + 1} width={CELL - 20} height={7} rx="3" />

      {b.all.map((c) => {
        const x = GX + b.colOf(c) * CELL, y = GY + b.rowOf(c) * CELL;
        const k = knownAt(p, a, c);
        const cls = k !== UNKNOWN ? 'known' : a.marks[c] === TRAIL ? 'marked' : a.marks[c] === CLEAR ? 'cleared' : 'misty';
        return (
          <g key={c}>
            <rect class={`df-sq ${cls}${a.lit.includes(c) ? ' lit' : ''}`} x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx="5" />
            {shown[c] === CLEAR && k === UNKNOWN && !a.lit.includes(c) && !a.solved ? <path class="wb-x" d={`M${x + 19} ${y + 19}l10 10M${x + 29} ${y + 19}l-10 10`} /> : null}
          </g>
        );
      })}

      <path class={`wb-trail${a.solved ? ' real' : ''}`} d={trailPath(p, a.solved ? crawled : taken, cx, cy)} />
      {(a.solved ? crawled : [...taken]).map((c) => (
        <circle key={`t${c}`} class={`wb-dot${knownAt(p, a, c) === TRAIL ? ' known' : ''}`} cx={cx(c)} cy={cy(c)} r={5} />
      ))}

      {p.clues.map((clue) => {
        const counted = countedBy(b, clue);
        const st = counted.length ? countState(counted, (clue as { n: number }).n, taken, open) : '';
        return <ClueMark key={`c${clue.cell}`} clue={clue} x={cx(clue.cell)} y={cy(clue.cell)} st={a.solved ? 'met' : st} />;
      })}

      {p.cols.map((n, k) => (n === null
        ? <Mist key={`ct${k}`} x={GX + k * CELL + CELL / 2} y={INSET + TOP / 2 + 1} />
        : <text key={`ct${k}`} class={`wb-tally ${a.solved ? 'met' : countState(colCells(b, k), n, taken, open)}`} x={GX + k * CELL + CELL / 2} y={INSET + TOP - 6}>{n}</text>))}
      {p.rows.map((n, r) => (n === null
        ? <Mist key={`rt${r}`} x={GX + p.width * CELL + RIGHT / 2 + 2} y={GY + r * CELL + CELL / 2} />
        : <text key={`rt${r}`} class={`wb-tally ${a.solved ? 'met' : countState(rowCells(b, r), n, taken, open)}`} x={GX + p.width * CELL + RIGHT / 2 + 2} y={GY + r * CELL + CELL / 2 + 7}>{n}</text>))}

      {lit && a.lit.includes(lit.cell) && !a.solved ? (
        <circle key={lit.id} class="df-lantern-glow" cx={cx(lit.cell)} cy={cy(lit.cell)} r={CELL / 2} />
      ) : null}
      {slugAt >= 0 ? <Glyph name="slug" x={cx(p.trail[slugAt]!)} y={cy(p.trail[slugAt]!)} size={32} cls="df-slug" /> : null}
      <rect class="wb-frame" x={GX} y={GY} width={p.width * CELL} height={p.height * CELL} rx="4" />
    </svg>
  );
}

/** Stars for a puzzle: one for solving it, one more for solving it without the lantern. */
function Stars({ n, of = 2 }: { n: number; of?: number }) {
  return (
    <span class="df-stars" aria-label={`${n} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => <Icon key={i} name="star" class={`ico star${i < n ? ' on' : ''}`} />)}
    </span>
  );
}

const crawlMs = 95;

function Solved({ p, a }: { p: Puzzle; a: Attempt }) {
  const prof = dewProfile.value;
  const next = afterInBook(prof, a.id);
  const ref = parseId(a.id);
  const stars = prof.stars[a.id] ?? 0;
  return (
    <section class="df-solved" aria-label="Solved">
      <h2>Solved <Stars n={a.lit.length ? 1 : 2} /></h2>
      <p>{a.lit.length ? `With the lantern's help: ${a.lit.length} ${a.lit.length === 1 ? 'square' : 'squares'} lit.${stars === 2 ? ' Your best is still two stars.' : ' Solve it without the lantern for the second star.'}`
        : `The slug's trail: ${p.trail.length} squares from the gap in the hedge to the bed.`}</p>
      <div class="row-btns">
        {next ? <button class="btn primary grow" aria-label={`Next: ${puzzleName(next)}`} onClick={() => openPuzzle(next)}>Next puzzle</button> : null}
        {ref?.kind === 'book'
          ? <button class={`btn ${next ? '' : 'primary '}grow`} onClick={() => { backTo.value = null; screen.value = 'dewbook'; }}>The book</button>
          : <button class="btn primary grow" onClick={() => { backTo.value = null; screen.value = 'title'; }}>Back to the title</button>}
      </div>
      <button class="btn wide quiet" onClick={() => replay(a.id)}>Play it again</button>
    </section>
  );
}

function Status({ a }: { a: Attempt }) {
  const m = dewMessage.value;
  if (m) return <div key={m.id} class={`status${m.warn ? ' warn' : ''}`} role="status">{m.text}</div>;
  if (lanternAsked.value) {
    return (
      <div class="status with-action holding" role="status">
        <span>The lantern lights one square. This puzzle then earns one star, not two.</span>
        <button class="pill-btn" onClick={() => lantern(true)}><Icon name="lanternLight" class="ico" />Light</button>
      </div>
    );
  }
  const ref = parseId(a.id);
  const marked = a.marks.some((x) => x !== UNKNOWN);
  if (ref?.kind === 'book' && ref.n === 1 && !marked) return <div class="status intro" role="status">{CHAPTERS[ref.chapter]!.blurb}</div>;
  return <div class="status" role="status">{brush.value === TRAIL ? 'Tap or drag to mark the trail. Tap a count to fill its settled line.' : 'Tap or drag to mark squares the trail misses.'}</div>;
}

function Tools({ a }: { a: Attempt }) {
  const pick = (v: typeof TRAIL | typeof CLEAR) => { brush.value = v; lanternAsked.value = false; };
  return (
    <div class="df-tools" role="toolbar" aria-label="Tools">
      <div class="df-brush" role="group" aria-label="Brush">
        <button class={`btn tool${brush.value === TRAIL ? ' toggled' : ''}`} aria-pressed={brush.value === TRAIL} onClick={() => pick(TRAIL)}>
          <Icon name="trailMark" /><span class="tool-name">Trail</span>
        </button>
        <button class={`btn tool${brush.value === CLEAR ? ' toggled' : ''}`} aria-pressed={brush.value === CLEAR} onClick={() => pick(CLEAR)}>
          <Icon name="close" /><span class="tool-name">Not trail</span>
        </button>
      </div>
      <button class="btn tool" disabled={!canUndo.value} onClick={undo}><Icon name="undo" /><span class="tool-name">Undo</span></button>
      <button class={`btn tool${lanternAsked.value ? ' toggled' : ''}`} aria-label={`Lantern${a.lit.length ? `, ${a.lit.length} lit` : ''}`} onClick={() => lantern()}>
        <Icon name="lanternLight" /><span class="tool-name">Lantern</span>
      </button>
    </div>
  );
}

function Hud({ a }: { a: Attempt }) {
  const [sure, setSure] = useState(false);
  useEffect(() => { if (!sure) return; const t = setTimeout(() => setSure(false), 3000); return () => clearTimeout(t); }, [sure]);
  const best = dewProfile.value.stars[a.id] ?? 0;
  return (
    <header class="header hud-row">
      <button class="icon-btn" aria-label="Back" onClick={goBack}><Icon name="back" /></button>
      <span class="hud-round"><Icon name="dewfall" class="ico inline-ico" /> <b>{puzzleName(a.id).replace('Daily Dewfall, ', 'Daily, ')}</b></span>
      {best ? <Stars n={best} /> : null}
      <button class={`icon-btn${sure ? ' warn' : ''}`} aria-label={sure ? 'Tap again to take every mark away' : 'Start over'} disabled={a.solved}
        onClick={() => { if (!sure) { setSure(true); return; } setSure(false); doDew({ type: 'reset' }); }}>
        <Icon name="remove" />
      </button>
      <button class="icon-btn" aria-label="How to play Dewfall" onClick={() => (sheet.value = { kind: 'dew-help' })}><Icon name="help" /></button>
    </header>
  );
}

export function DewfallScreen() {
  // The first time in, the rules open by themselves.
  useEffect(() => {
    if (coachOff.value || coachSeen.value.includes('dew-intro')) return;
    dismissTip('dew-intro');
    sheet.value = { kind: 'dew-help' };
  }, []);
  const p = puzzle.value, a = attempt.value;
  const party = celebrating.value;
  const reduced = reducedMotion.value;
  const [crawl, setCrawl] = useState<number | null>(null);
  useEffect(() => {
    if (!party || !p || reduced) { setCrawl(null); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - t0) / crawlMs;
      if (t >= p.trail.length) { setCrawl(null); return; }
      setCrawl(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [party?.at]);
  if (!p || !a) { screen.value = 'title'; return null; }
  return (
    <div class="column run dewfall">
      <Hud a={a} />
      <div class="board-wrap dew-wrap" style={{ '--aspect': `${sizeOf(p).w / sizeOf(p).h}` }} onClick={() => crawl !== null && setCrawl(null)}>
        <Garden p={p} a={a} crawl={crawl} />
      </div>
      {a.solved ? (crawl === null ? <Solved p={p} a={a} /> : <div class="status">The slug's trail, from the hedge to the bed.</div>) : (
        <>
          <Status a={a} />
          <Tools a={a} />
        </>
      )}
      <div class="bottom-pad" />
    </div>
  );
}

/** The book: its chapters, each opening once enough of the one before is solved. */
export function DewBookScreen() {
  const prof = dewProfile.value;
  const totals = bookTotals.value;
  return (
    <div class="column dew-book">
      <header class="header">
        <button class="icon-btn" aria-label="Back to title" onClick={goBack}><Icon name="back" /></button>
        <div class="title"><div class="title-page">The Dewfall book</div></div>
        <span class="hud-stat" aria-label={`${totals.stars} stars`}><Icon name="star" class="ico star on" /><b>{totals.stars}</b></span>
      </header>
      <p class="df-book-note">{totals.solved} of {totals.of} puzzles solved. Two stars for each one solved without the lantern.</p>
      <div class="df-chapters">
        {CHAPTERS.map((ch, i) => {
          const isOpen = chapterOpen(prof, i);
          const solved = solvedIn(prof, i);
          return (
            <section key={ch.id} class={`df-chapter${isOpen ? '' : ' locked'}`} aria-label={ch.name}>
              <div class="df-ch-head">
                <h2>{isOpen ? null : <Icon name="lock" class="ico inline-ico" />}{ch.name}</h2>
                <span class="df-ch-count">{isOpen ? `${solved} of ${ch.count}` : ''}{isOpen && starsIn(prof, i) ? <> · <Icon name="star" class="ico xs star on" />{starsIn(prof, i)}</> : null}</span>
              </div>
              <p class="df-ch-blurb">{isOpen ? ch.blurb : `Opens when ${UNLOCK_AFTER} puzzles in ${CHAPTERS[i - 1]!.name} are solved (${solvedIn(prof, i - 1)} so far).`}</p>
              {isOpen ? (
                <div class="df-puzzles">
                  {Array.from({ length: ch.count }, (_, k) => {
                    const id = bookId(i, k + 1);
                    const s = prof.stars[id] ?? 0;
                    return (
                      <button key={id} class={`df-pz${s ? ' done' : ''}`} aria-label={`${ch.name} ${k + 1}${s ? `, solved, ${s} ${s === 1 ? 'star' : 'stars'}` : ''}`}
                        onClick={() => { chapterPuzzles(i); openPuzzle(id); backTo.value = 'dewbook'; }}>
                        <span class="df-pz-n">{k + 1}</span>
                        <span class="df-pz-stars" aria-hidden="true">{s ? <Stars n={s} /> : ' '}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      <div class="bottom-pad" />
    </div>
  );
}

/** A clue as it looks in the garden, for the help sheet. */
function Sample({ clue, trail = false }: { clue: Clue; trail?: boolean }) {
  return (
    <svg class="df-sample" viewBox="0 0 48 48" aria-hidden="true">
      <rect class="df-sq known" x="1" y="1" width="46" height="46" rx="5" />
      {trail ? <path class="wb-trail real" d={clue.kind === 'acorn' ? 'M24 0L24 24L48 24' : 'M24 0L24 48'} /> : null}
      <ClueMark clue={clue} x={24} y={24} />
    </svg>
  );
}

/** How Dewfall is played, for the help sheet. */
export function DewHelp() {
  return (
    <>
      <div class="sheet-head"><h2><Icon name="dewfall" class="ico inline-ico big" /> Dewfall</h2>
        <button class="icon-btn" onClick={() => (sheet.value = null)} aria-label="Close"><Icon name="close" /></button></div>
      <p>A slug crossed the garden in the night, in through the gap in the hedge and down to the bed. Find its trail. It goes from square to square, never beside itself: two trail squares side by side are always steps of the trail. It may touch itself at a corner. There is only ever one trail that fits.</p>
      <p><b>The counts</b> above and down the right say how many trail squares each column and row holds. Mist (<svg class="df-mist-inline" viewBox="0 0 22 14" aria-hidden="true"><Mist x={11} y={7} /></svg>) hides a count. Tap a count to fill the rest of its line once it's settled.</p>
      <ul class="df-help-clues">
        <li><Sample clue={{ kind: 'dew', cell: 0, n: 3 }} /><span><b>Dew</b> is never on the trail. It counts the trail squares among the eight around it.</span></li>
        <li><Sample clue={{ kind: 'leaf', cell: 0, n: 2 }} /><span><b>A leaf</b> is never on the trail. It counts the trail squares among the four beside it.</span></li>
        <li><Sample clue={{ kind: 'scarecrow', cell: 0, dir: 1, n: 2 }} /><span><b>A scarecrow</b> is never on the trail. It counts the trail squares it can see the way it faces, all the way to the edge.</span></li>
        <li><Sample clue={{ kind: 'pebble', cell: 0 }} trail /><span><b>A pebble</b> is on the trail, which runs straight over it.</span></li>
        <li><Sample clue={{ kind: 'acorn', cell: 0 }} trail /><span><b>An acorn</b> is on the trail, which turns on it.</span></li>
        <li><Sample clue={{ kind: 'glint', cell: 0 }} trail /><span><b>A glint</b> is a square known to be on the trail.</span></li>
      </ul>
      <p><b>Mark squares</b> by tapping or dragging: with <b>Trail</b> for the trail, with <b>Not trail</b> for squares it misses. Tap a marked square again to clear it. A clue turns pale when your marks meet it, and red when they break it. The <b>lantern</b> lights one square: one you marked wrong if there is one, else one the clues decide next. A puzzle solved without it earns two stars, with it one.</p>
    </>
  );
}

