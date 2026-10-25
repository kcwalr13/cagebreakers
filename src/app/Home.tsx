/**
 * The home garden: the squares you build on, the seed packets your finished gardens left, and
 * the sheet for each square. Every rule comes from src/core/home.ts through src/core/meta.ts.
 */
import { signal } from '@preact/signals';
import { GROWTH, HOME, HOME_ITEMS, type HomeItemId, type PlantId, SPECIES, homeItem } from '../content/home';
import { BLOOM_STAGE, cantBuyHome, inBloom, stageOf, weeksToNext } from '../core/home';
import { Icon } from './Icon';
import { ItemPreview, PacketArt, PlantArt, TileArt } from './HomeArt';
import { buyAndLayHome, layInHome, moveInHome, pickUpInHome, plantInHome, profile } from './meta';
import { sheet } from './nav';
import { Header, Tip } from './Scriptorium';
import { play } from './sound';

/** What you're holding in the home garden: a seed packet, something from the shed, or a square being moved. */
export type HomeHand = { kind: 'packet'; species: PlantId } | { kind: 'stock'; item: HomeItemId } | { kind: 'move'; from: number } | null;
export const homeHand = signal<HomeHand>(null);
const homeNote = signal<{ text: string; warn: boolean } | null>(null);

function say(text: string | null, ok: string) {
  homeNote.value = text ? { text: `${text}.`, warn: true } : { text: ok, warn: false };
  if (!text) play('place');
}

function tileName(at: number): string {
  const t = profile.value.home.tiles[at];
  if (!t) return 'Grass';
  if (t.plant) return SPECIES[t.plant.species].name;
  return homeItem(t.item).name;
}

/** A tap on a square: finish what's in hand there, or open the square's sheet. */
function tapTile(at: number) {
  const h = homeHand.value;
  if (!h) { sheet.value = { kind: 'home-tile', at }; return; }
  if (h.kind === 'packet') say(plantInHome(at, h.species), `${SPECIES[h.species].name} planted.`);
  else if (h.kind === 'stock') say(layInHome(at, h.item), `${homeItem(h.item).name} laid.`);
  else if (h.from !== at) say(moveInHome(h.from, at), 'Moved.');
  homeHand.value = null;
}

function Square({ at }: { at: number }) {
  const p = profile.value;
  const t = p.home.tiles[at];
  const h = homeHand.value;
  const target = h && (h.kind === 'packet' ? t && homeItem(t.item).kind === 'bed' && !t.plant
    : h.kind === 'stock' ? !t : h.from !== at && (!t || (p.home.tiles[h.from]?.plant && homeItem(t.item).kind === 'bed' && !t.plant)));
  const stage = t?.plant ? stageOf(t.plant, p.stats.weeks) : -1;
  const label = t?.plant ? `${SPECIES[t.plant.species].name}, ${GROWTH.names[stage]!.toLowerCase()}` : tileName(at);
  return (
    <button class={`home-tile${target ? ' target' : ''}${h?.kind === 'move' && h.from === at ? ' moving' : ''}${stage === BLOOM_STAGE ? ' blooming' : ''}`} aria-label={label} onClick={() => tapTile(at)}>
      <svg viewBox="0 0 60 60" aria-hidden="true">
        {t ? <TileArt item={t.item} /> : <g class="tuft"><path d={`M${12 + (at * 7) % 30} ${24 + (at * 11) % 24}q1-4 3-6M${15 + (at * 7) % 30} ${24 + (at * 11) % 24}q0-4 1-7M${18 + (at * 7) % 30} ${24 + (at * 11) % 24}q-1-3 1-5`} /></g>}
        {t?.plant ? <g transform="translate(0 -2)"><PlantArt species={t.plant.species} stage={stage} /></g> : null}
      </svg>
    </button>
  );
}

export function HomeScreen() {
  const p = profile.value;
  const h = homeHand.value;
  const home = p.home;
  const growing = home.tiles.filter((t) => t?.plant).length;
  const blooming = inBloom(home, p.stats.weeks);
  const stock = (Object.entries(home.stock) as [HomeItemId, number][]).filter(([, n]) => n > 0);
  const packets = [...new Set(home.tray)];
  const note = homeNote.value;
  const holding = h?.kind === 'packet' ? `Tap an empty bed to plant the ${SPECIES[h.species].name.toLowerCase()}.`
    : h?.kind === 'stock' ? `Tap a grass square to lay the ${homeItem(h.item).name.toLowerCase()}.`
      : h?.kind === 'move' ? `Tap where the ${tileName(h.from).toLowerCase()} goes.` : null;
  return (
    <div class="column home-screen">
      <Header title="Home Garden" sub={`${growing} ${growing === 1 ? 'plant' : 'plants'} growing, ${blooming} in bloom`} />
      <div class="scroll">
        <div class="home-grid" style={{ gridTemplateColumns: `repeat(${HOME.cols}, 1fr)` }} role="group" aria-label="Your home garden">
          {home.tiles.map((_, at) => <Square key={at} at={at} />)}
        </div>
      </div>
      <div class={`status home-status${note?.warn ? ' warn' : ''}`} role="status">
        <span>{holding ?? note?.text ?? `Plants grow with every week you water, in any garden: ${p.stats.weeks} so far.`}</span>
        {h ? <button class="pill-btn" onClick={() => (homeHand.value = null)}>Cancel</button> : null}
      </div>
      <div class="home-tray">
        {packets.length || stock.length ? (
          <div class="packets" role="group" aria-label="Seed packets to plant, and things to lay">
            {packets.map((sp) => {
              const n = home.tray.filter((x) => x === sp).length;
              return (
                <button key={sp} class="packet-btn" aria-pressed={h?.kind === 'packet' && h.species === sp} aria-label={`${SPECIES[sp].name} seeds${n > 1 ? `, ${n}` : ''}`}
                  onClick={() => (homeHand.value = h?.kind === 'packet' && h.species === sp ? null : { kind: 'packet', species: sp })}>
                  <PacketArt species={sp} />
                  <span>{SPECIES[sp].name}{n > 1 ? ` ×${n}` : ''}</span>
                </button>
              );
            })}
            {stock.map(([id, n]) => (
              <button key={id} class="packet-btn shed" aria-pressed={h?.kind === 'stock' && h.item === id} aria-label={`${homeItem(id).name}${n > 1 ? `, ${n}` : ''}`}
                onClick={() => (homeHand.value = h?.kind === 'stock' && h.item === id ? null : { kind: 'stock', item: id })}>
                <ItemPreview item={id} />
                <span>{homeItem(id).name}{n > 1 ? ` ×${n}` : ''}</span>
              </button>
            ))}
          </div>
        ) : <p class="muted-sm">Finish a garden and it leaves you a seed packet of its flower to plant here.</p>}
      </div>
      <Tip id="home" />
      <div class="bottom-pad" />
    </div>
  );
}

function Close() {
  return <button class="icon-btn" aria-label="Close" onClick={() => (sheet.value = null)}><Icon name="close" /></button>;
}

/** One square of the home garden: what's there and what can be done with it. */
export function HomeTileSheet({ at }: { at: number }) {
  const p = profile.value;
  const t = p.home.tiles[at];
  const close = () => { sheet.value = null; };
  const act = (why: string | null, ok: string) => { say(why, ok); if (!why) close(); };
  if (!t) {
    const buildable = HOME_ITEMS.filter((i) => !cantBuyHome(p.home, i.id, Infinity));
    return (
      <>
        <div class="sheet-head"><h2>Build here</h2><Close /></div>
        <div class="home-buy">
          {buildable.map((i) => {
            const why = cantBuyHome(p.home, i.id, p.leaf);
            return (
              <button key={i.id} class="home-buy-item" disabled={!!why} aria-label={`${i.name} for ${i.price} seeds`}
                onClick={() => act(buyAndLayHome(at, i.id), `${i.name} laid.`)}>
                <ItemPreview item={i.id} />
                <span class="hb-name">{i.name}</span>
                <span class="hb-price"><Icon name="leaf" class="ico leaf xs" />{i.price}</span>
              </button>
            );
          })}
        </div>
        <p class="muted-sm">You have {p.leaf} seeds. Things you buy in the Potting Shed wait in the shed until you lay them.</p>
      </>
    );
  }
  const item = homeItem(t.item);
  if (t.plant) {
    const sp = SPECIES[t.plant.species];
    const stage = stageOf(t.plant, p.stats.weeks);
    const next = weeksToNext(t.plant, p.stats.weeks);
    return (
      <>
        <div class="sheet-head"><h2>{sp.name}</h2><Close /></div>
        <div class="plant-big"><svg viewBox="0 0 60 60" aria-hidden="true"><TileArt item={t.item} /><PlantArt species={t.plant.species} stage={stage} /></svg></div>
        <p>{GROWTH.names[stage]}. {next ? `${next} more ${next === 1 ? 'week' : 'weeks'} of watering, in any garden, until it's ${GROWTH.names[stage + 1]!.toLowerCase()}.` : 'It stays in bloom.'}</p>
        <div class="row-btns">
          <button class="btn" onClick={() => { homeHand.value = { kind: 'move', from: at }; close(); }}><Icon name="move" />Move it</button>
          <button class="btn" onClick={() => act(pickUpInHome(at), `${sp.name} back in its packet.`)}><Icon name="packet" />Back to its packet</button>
        </div>
        <p class="muted-sm">Moved to another bed, it keeps growing. Put back in its packet, it starts again from seed.</p>
      </>
    );
  }
  const packets = [...new Set(p.home.tray)];
  return (
    <>
      <div class="sheet-head"><h2>{item.name}</h2><Close /></div>
      {item.kind === 'bed' ? (
        packets.length ? (
          <>
            <p>An empty bed. Plant a seed packet:</p>
            <div class="packets" role="group" aria-label="Seed packets">
              {packets.map((sp) => (
                <button key={sp} class="packet-btn" aria-label={`Plant ${SPECIES[sp].name}`} onClick={() => act(plantInHome(at, sp), `${SPECIES[sp].name} planted.`)}>
                  <PacketArt species={sp} /><span>{SPECIES[sp].name}</span>
                </button>
              ))}
            </div>
          </>
        ) : <p>An empty bed. Finish a garden for a seed packet to plant here.</p>
      ) : <p>{item.text}</p>}
      <div class="row-btns">
        <button class="btn" onClick={() => { homeHand.value = { kind: 'move', from: at }; close(); }}><Icon name="move" />Move it</button>
        <button class="btn" onClick={() => act(pickUpInHome(at), `${item.name} put in the shed.`)}><Icon name="remove" />Put it in the shed</button>
      </div>
    </>
  );
}
