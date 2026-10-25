/**
 * The scriptorium's screens: the map of stations, the shop, the library, and the sheets that
 * begin a station's run (with the satchel) and show a bound page.
 */
import type { ToolId } from '../content/balance';
import { TOOLS } from '../content/balance';
import { ITEMS, type Item, type ItemId } from '../content/meta';
import { STATIONS, type Station, type StationId, stationById } from '../content/stations';
import { describe } from '../core/commission';
import { type LibraryEntry, cantBuy, ownedTools, satchelSize, stationOpen } from '../core/meta';
import { TOOL_NAMES, pageOf } from '../core/run';
import { sealedCages } from '../core/rules';
import { dismissTip, screenTip } from './coach';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { buy, chooseSatchel, profile, stars } from './meta';
import { goBack, screen, sheet } from './nav';
import { PageView, type PieceView } from './PageView';
import { TOOL_ICON } from './run/Round';
import { dailyParts, loadSlot, run, slot, startStation } from './run/state';
import { type ThemeChoice, theme } from './state';

const STATION_ICON: Record<StationId, IconName> = {
  'copy-desk': 'kitchen', cloister: 'rocks', 'bare-vellum': 'fallow', 'counting-house': 'market', 'long-night': 'dry', 'grand-folio': 'season',
  'window-box': 'box', allotment: 'allotment', 'walled-garden': 'walled',
};
const ITEM_ICON: Record<ItemId, IconName> = {
  quill: 'quill', gilder: 'gilder', eraser: 'eraser', inkwell: 'inkwell', 'purse-1': 'purse', 'purse-2': 'purse',
  'bounty-hunter': 'bounty', 'deeper-inkwell': 'inkwell', 'second-strap': 'strap', newsprint: 'palette', neon: 'palette',
};
/** An example of each commission a station brings, for its sheet. */
const BRINGS_EXAMPLE = {
  'corners-min': { kind: 'corners-min', min: 14 },
  'quarter-min': { kind: 'quarter-min', quarter: 'tl', min: 20 },
  'seal-op-count': { kind: 'seal-op-count', op: '×', count: 2 },
} as const;

function Leaf({ n }: { n: number }) {
  return <span class="leaf-count" aria-label={`${n} ${n === 1 ? 'seed' : 'seeds'}`}><Icon name="leaf" class="ico leaf" /><b>{n}</b></span>;
}

function Stars({ n, label }: { n: number; label?: boolean }) {
  return (
    <span class="stars" role="img" aria-label={label === false ? undefined : `${n} of 3 stars`}>
      {[1, 2, 3].map((i) => <Icon key={i} name="star" class={`ico star${i <= n ? ' on' : ''}`} />)}
    </span>
  );
}

function Header({ title, sub }: { title: string; sub?: string }) {
  return (
    <header class="header">
      <button class="icon-btn" aria-label="Back to title" onClick={goBack}><Icon name="back" /></button>
      <div class="title">
        <div class="title-page">{title}</div>
        {sub ? <div class="title-sub">{sub}</div> : null}
      </div>
      <Leaf n={profile.value.leaf} />
    </header>
  );
}

/** A first-visit tip, pinned to the bottom of a scriptorium screen until dismissed. */
function Tip({ id }: { id: 'map' | 'shop' | 'library' }) {
  const text = screenTip(id);
  if (!text) return null;
  return (
    <div class="coach screen-tip" role="note">
      <p>{text}</p>
      <button class="pill-btn" onClick={() => dismissTip(id)}>Got it</button>
    </div>
  );
}

// ---- The map -----------------------------------------------------------------------------------

const ROWS = Math.max(...STATIONS.map((s) => s.at[0])) + 1;

export function MapScreen() {
  const p = profile.value;
  const centre = (st: Station) => ({ x: (st.at[1] + 0.5) * 100, y: (st.at[0] + 0.5) * 100 });
  return (
    <div class="column map-screen">
      <Header title="The Map" sub={`${stars.value.have} of ${stars.value.of} stars`} />
      <div class="map-scroll">
        <div class="map" style={{ gridTemplateRows: `repeat(${ROWS}, minmax(112px, 1fr))` }}>
          <svg class="map-paths" viewBox={`0 0 300 ${ROWS * 100}`} preserveAspectRatio="none" aria-hidden="true">
            {STATIONS.flatMap((st) => st.after.map((from) => {
              const a = centre(stationById(from)!), b = centre(st);
              const lit = p.filled.includes(from);
              return <line key={`${from}-${st.id}`} class={`map-path${lit ? ' lit' : ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} vector-effect="non-scaling-stroke" />;
            }))}
          </svg>
          {STATIONS.map((st) => {
            const open = stationOpen(p, st);
            const best = p.best[st.id];
            return (
              <button
                key={st.id}
                class={`station${open ? '' : ' locked'}${p.filled.includes(st.id) ? ' filled' : ''}`}
                style={{ gridRow: st.at[0] + 1, gridColumn: st.at[1] + 1 }}
                aria-label={`${st.name}${open ? '' : ', locked'}`}
                onClick={() => (sheet.value = { kind: 'station', station: st.id })}
              >
                <span class="station-medal"><Icon name={open ? STATION_ICON[st.id] : 'lock'} class="ico" /></span>
                <span class="station-name">{st.name}</span>
                {open ? <Stars n={p.stars[st.id] ?? 0} /> : <span class="station-lock">Locked</span>}
                {best ? <span class="station-best">Best {best}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <Tip id="map" />
      <div class="bottom-pad" />
    </div>
  );
}

/** A station: its twist, what it brings, its stars, and the satchel to carry into it. */
export function StationSheet({ id }: { id: StationId }) {
  const st = stationById(id)!;
  const p = profile.value;
  const open = stationOpen(p, st);
  const have = p.stars[st.id] ?? 0;
  const tools = ownedTools(p);
  const size = satchelSize(p);
  const forSale = ITEMS.filter((i) => i.after === st.id);
  const main = slot.value === 'main' ? run.value : loadSlot('main');
  const live = main && main.phase === 'arrange' ? main : null;
  const toggle = (t: ToolId) => {
    const now = p.satchel.includes(t) ? p.satchel.filter((x) => x !== t) : [...p.satchel, t];
    if (now.length <= size) chooseSatchel(now);
  };
  return (
    <>
      <div class="sheet-head"><h2><Icon name={STATION_ICON[st.id]} class="ico inline-ico big" /> {st.name}</h2><button class="icon-btn" aria-label="Close" onClick={() => (sheet.value = null)}><Icon name="close" /></button></div>
      <p>{st.twist}</p>
      {st.brings || forSale.length ? (
        <p class="muted-sm">
          {st.brings ? <>Brings a new request: “{describe(BRINGS_EXAMPLE[st.brings as keyof typeof BRINGS_EXAMPLE] as never, pageOf('ANYPGE'))}”. </> : null}
          {forSale.length ? <>Filling it puts {forSale.map((i) => (i.kind === 'tool' ? i.name : `the ${i.name}`)).join(' and ')} on sale.</> : null}
        </p>
      ) : null}
      <ul class="star-marks">
        <li class={have >= 1 ? 'on' : ''}><Stars n={1} label={false} /> Fill the garden</li>
        <li class={have >= 2 ? 'on' : ''}><Stars n={2} label={false} /> Score {st.stars[0]}</li>
        <li class={have >= 3 ? 'on' : ''}><Stars n={3} label={false} /> Score {st.stars[1]}</li>
      </ul>
      {p.best[st.id] ? <p class="muted-sm">Your best here: {p.best[st.id]} points.</p> : null}
      {open ? (
        <>
          <div class="section-label">Your tool belt: {p.satchel.length} of {size} tools</div>
          <div class="satchel" role="group" aria-label="Tools to carry">
            {tools.map((t) => (
              <button key={t} class="satchel-tool" aria-pressed={p.satchel.includes(t)} onClick={() => toggle(t)} disabled={!p.satchel.includes(t) && p.satchel.length >= size}>
                <Icon name={TOOL_ICON[t]} class="ico" /><span>{TOOL_NAMES[t]}</span><small><Icon name="gold" class="ico gold xs" />{TOOLS[t]}</small>
              </button>
            ))}
          </div>
          {live ? <p class="warn-text">Starting here abandons the garden you're growing, in week {live.round}.</p> : null}
          <div class="row-btns">
            <button class="btn primary wide" onClick={() => { startStation(st.id); sheet.value = null; screen.value = 'run'; }}>Begin</button>
          </div>
        </>
      ) : (
        <p class="warn-text">Opens when you finish {st.after.map((a) => stationById(a)!.name).join(' or ')}.</p>
      )}
    </>
  );
}

// ---- The shop ----------------------------------------------------------------------------------

const STYLE_THEME: Partial<Record<ItemId, ThemeChoice>> = { newsprint: 'newsprint', neon: 'neon' };

function ItemRow({ item }: { item: Item }) {
  const p = profile.value;
  const owned = p.owned.includes(item.id);
  const why = cantBuy(p, item);
  const style = STYLE_THEME[item.id];
  return (
    <div class={`shop-item${owned ? ' owned' : ''}`}>
      <span class="shop-icon"><Icon name={ITEM_ICON[item.id]} class="ico" /></span>
      <span class="shop-text">
        <span class="shop-name">{item.name}</span>
        <span class="muted-sm">{item.text}</span>
        {!owned && why && !why.startsWith('Costs') ? <span class="shop-why">{why}</span> : null}
      </span>
      {owned ? (
        style ? (
          <button class="pill-btn" aria-pressed={theme.value === style} onClick={() => (theme.value = theme.value === style ? 'system' : style)}>{theme.value === style ? 'In use' : 'Use'}</button>
        ) : <span class="shop-owned"><Icon name="check" class="ico" />Yours</span>
      ) : (
        <button class="pill-btn buy" disabled={!!why} aria-label={`Buy ${item.name} for ${item.price} seeds`} onClick={() => buy(item.id)}>
          <Icon name="leaf" class="ico leaf xs" />{item.price}
        </button>
      )}
    </div>
  );
}

export function ShopScreen() {
  const sections: [Item['kind'], string, string][] = [
    ['tool', 'Tools', 'Carry them into a garden on your tool belt; each costs coins when you use it.'],
    ['upgrade', 'Upgrades', 'They stay with you for every garden on the map.'],
    ['style', 'Looks', 'New looks for the whole garden.'],
  ];
  return (
    <div class="column shop-screen">
      <Header title="The Potting Shed" sub="Seeds buy things that stay with you" />
      <div class="scroll">
        {sections.map(([kind, title, note]) => (
          <section key={kind}>
            <div class="section-label">{title}</div>
            <p class="muted-sm">{note}</p>
            {ITEMS.filter((i) => i.kind === kind).map((i) => <ItemRow key={i.id} item={i} />)}
          </section>
        ))}
      </div>
      <Tip id="shop" />
      <div class="bottom-pad" />
    </div>
  );
}

// ---- The library -------------------------------------------------------------------------------

function boardOf(e: LibraryEntry) {
  const base = pageOf(e.seed, e.page);
  const stones = base.stones.slice();
  for (const c of e.erased) stones[c] = 0;
  const page = { ...base, stones };
  const pieces: (PieceView | null)[] = Array.from({ length: e.values.length }, (_, c) => (stones[c] || !e.values[c] ? null : { key: `${c}`, n: e.values[c]! }));
  return { page, pieces, sealed: sealedCages(page, e.values) };
}

const entryTitle = (e: LibraryEntry) => {
  if (e.station) return stationById(e.station)?.name ?? 'A garden';
  if (!e.daily) return 'A garden';
  const { day, size } = dailyParts(e.daily);
  return `${size}×${size} Daily Garden, ${day}`;
};

export function LibraryScreen() {
  const books = profile.value.library;
  return (
    <div class="column library-screen">
      <Header title="The Herbarium" sub={`${books.length} ${books.length === 1 ? 'garden' : 'gardens'} pressed`} />
      <div class="scroll">
        {!books.length ? <p class="muted-sm center">Finish a garden and it's pressed here.</p> : null}
        <div class="shelf">
          {books.map((e) => {
            const { page, pieces, sealed } = boardOf(e);
            return (
              <button key={e.id} class="book" aria-label={`${entryTitle(e)}, ${e.score} points`} onClick={() => (sheet.value = { kind: 'book', id: e.id })}>
                <PageView id={`lib-${e.id}`} page={page} pieces={pieces} sealed={sealed} label="" />
                <span class="book-name">{entryTitle(e)}</span>
                <span class="book-score">{e.score} {e.station ? <Stars n={e.stars} /> : null}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Tip id="library" />
      <div class="bottom-pad" />
    </div>
  );
}

export function BookSheet({ id }: { id: string }) {
  const e = profile.value.library.find((x) => x.id === id);
  if (!e) return null;
  const { page, pieces, sealed } = boardOf(e);
  return (
    <>
      <div class="sheet-head"><h2>{entryTitle(e)}</h2><button class="icon-btn" aria-label="Close" onClick={() => (sheet.value = null)}><Icon name="close" /></button></div>
      <div class="book-big"><PageView id="book" page={page} pieces={pieces} sealed={sealed} label={`${entryTitle(e)}, finished`} /></div>
      <p>{e.score} points{e.station ? `, ${e.stars} of 3 stars` : ''}. Finished {e.when}. Garden code <strong class="code">{e.seed}</strong>.</p>
    </>
  );
}

export { Leaf, Stars };
