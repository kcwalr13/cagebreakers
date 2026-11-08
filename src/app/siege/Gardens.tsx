/**
 * Garden Siege's gardens: a card for each, with a small drawing of its ground, what makes it
 * different, and the best season played in it. Picking one starts a season there.
 */
import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { WAVES } from '../../content/siege';
import { MAPS, type MapDef } from '../../content/siege-maps';
import { HEX_RADIUS, fieldOf } from '../../core/siege/field';
import { Icon } from '../Icon';
import { goBack, screen } from '../nav';
import { holePairs } from './SiegeScreen';
import { siege, siegeBests, startSiege } from './state';

/** A small drawing of a garden's ground: tiles U units across, the hedge's gaps above, the gates below. */
const U = 10;
const minis = new Map<string, VNode>();
function Mini({ m }: { m: MapDef }) {
  const known = minis.get(m.id);
  if (known) return known;
  const f = fieldOf(m);
  const top = 4, w = f.size.x * U + 2, h = top + f.size.y * U + 4;
  const pairs = holePairs(f);
  const tile = (c: number) => {
    const p = f.mids[c]!, x = 1 + p.x * U, y = top + p.y * U;
    if (f.shape === 'square') return `M${x - U / 2} ${y - U / 2}h${U}v${U}h${-U}Z`;
    const r = HEX_RADIUS * U;
    return Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return `${i ? 'L' : 'M'}${(x + r * Math.cos(a)).toFixed(1)} ${(y + r * Math.sin(a)).toFixed(1)}`; }).join('') + 'Z';
  };
  const of = (t: string) => Array.from({ length: f.cells }, (_, c) => c).filter((c) => f.terrain[c] === t);
  const v = (
    <svg class="sg-mini" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <rect class="wb-hedge" x="1" y="0" width={f.size.x * U} height={top - 1} rx="1" />
      {f.entries.map((e) => <rect key={e} class="wb-gap" x={1 + f.mids[e]!.x * U - 3.5} y="-0.5" width="7" height={top} />)}
      <path class="sg-lawn" d={Array.from({ length: f.cells }, (_, c) => tile(c)).join('')} />
      <path class="sg-mini-rich" d={of('rich').map(tile).join('')} />
      <path class="sg-mini-mud" d={of('mud').map(tile).join('')} />
      <path class="sg-mini-pond" d={of('pond').map(tile).join('')} />
      <path class="sg-mini-rock" d={of('rock').map(tile).join('')} />
      {of('hole').map((c) => <circle key={c} class={`sg-mini-hole p${pairs.get(c) ?? 1}`} cx={1 + f.mids[c]!.x * U} cy={top + f.mids[c]!.y * U} r="3.6" />)}
      <rect class="wb-bed" x="1" y={top + f.size.y * U + 1} width={f.size.x * U} height="3" rx="1" />
      {f.exits.map((x) => <rect key={`x${x}`} class="wb-gate" x={1 + f.mids[x]!.x * U - 3} y={top + f.size.y * U + 0.5} width="6" height="2" />)}
    </svg>
  );
  minis.set(m.id, v);
  return v;
}

/** What sets a garden apart, in a few words. */
function factsOf(m: MapDef): string {
  const f = fieldOf(m);
  const has = (t: string) => f.terrain.includes(t as never);
  const bits = [`${m.shape === 'hex' ? 'Hexagons' : 'Squares'}, ${f.w}×${f.h}`];
  if (f.entries.length > 1) bits.push(`${f.entries.length} gaps`);
  if (f.exits.length > 1) bits.push(`${f.exits.length} gates`);
  const ground = [has('rock') && 'rock', has('pond') && 'ponds', has('mud') && 'mud', has('rich') && 'rich soil', has('hole') && 'rabbit holes'].filter(Boolean);
  if (ground.length) bits.push(ground.join(', '));
  return bits.join(' · ');
}

export function SiegeGardens() {
  const s = siege.value;
  const live = s && s.phase === 'build' && (s.wave > 1 || s.placed.length || s.elements.length) ? s : null;
  const [sure, setSure] = useState<string | null>(null);
  const bests = siegeBests.value;
  const pick = (m: MapDef) => {
    if (live && sure !== m.id) { setSure(m.id); return; }
    startSiege(undefined, m.id);
    screen.value = 'siege';
  };
  return (
    <div class="column siege-gardens">
      <header class="header">
        <button class="icon-btn" aria-label="Back to title" onClick={goBack}><Icon name="back" /></button>
        <div class="title"><div class="title-page">Choose a garden</div></div>
      </header>
      <p class="sg-gardens-lead">Every garden brings the same {WAVES.length} waves, and each plays its own way.{live ? ' Picking one leaves the season you have going.' : ''}</p>
      <ul class="sg-gardens">
        {MAPS.map((m) => (
          <li key={m.id}>
            <button class={`sg-garden${sure === m.id ? ' warn' : ''}${live?.map === m.id ? ' current' : ''}`} onClick={() => pick(m)}
              aria-label={`${m.name}: ${m.blurb}${bests[m.id] ? ` Best season ${bests[m.id]}.` : ''}`}>
              <Mini m={m} />
              <span class="sg-garden-text">
                <span class="sg-garden-name">{sure === m.id ? `Leave your season and start in ${m.name.replace(/^The /, 'the ')}?` : m.name}</span>
                <span class="sg-garden-blurb">{sure === m.id ? `Tap again to start. Your season ${live!.map === m.id ? 'here' : `in ${MAPS.find((x) => x.id === live!.map)?.name ?? 'the garden'}`} is at wave ${live!.wave}.` : m.blurb}</span>
                <span class="sg-garden-facts">{factsOf(m)}{bests[m.id] ? <> · <Icon name="trophy" class="ico xs" /> {bests[m.id]}</> : null}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div class="bottom-pad" />
    </div>
  );
}
