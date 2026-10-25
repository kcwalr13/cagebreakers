/**
 * Drawings for the home garden: each square's bed, path or ornament, and plants at every stage of
 * growth. Plants are drawn from their species' shape and colours, in a 60 × 60 square.
 */
import type { HomeItemId, Species } from '../content/home';
import { SPECIES, homeItem } from '../content/home';
import type { PlantId } from '../content/home';
import { ICON_BODIES, type IconName } from './icons';

const ORNAMENT_ICON: Partial<Record<HomeItemId, IconName>> = {
  'bird-house': 'birdHouse', frog: 'frog', lantern: 'lantern', scarecrow: 'scarecrow', bench: 'bench', butterflies: 'butterflies',
  sundial: 'sundial', beehive: 'beehive', 'mushroom-house': 'mushroomHouse', 'fruit-tree': 'fruitTree', bonsai: 'bonsai', swing: 'swing',
  well: 'well', fountain: 'fountain', bridge: 'bridge',
};

/** A petal ring: `n` petals of a shape around the centre. */
function Petals({ sp, r, cx, cy, scale = 1 }: { sp: Species; r: number; cx: number; cy: number; scale?: number }) {
  const out = [];
  for (let i = 0; i < sp.petals; i++) {
    const a = (360 / sp.petals) * i;
    const t = `rotate(${a} ${cx} ${cy})`;
    if (sp.shape === 'round') out.push(<ellipse key={i} cx={cx} cy={cy - r * 0.62 * scale} rx={r * 0.42 * scale} ry={r * 0.5 * scale} transform={t} />);
    else if (sp.shape === 'pointed') out.push(<ellipse key={i} cx={cx} cy={cy - r * 0.6 * scale} rx={r * 0.2 * scale} ry={r * 0.55 * scale} transform={t} />);
    else if (sp.shape === 'star') out.push(<path key={i} d={`M${cx} ${cy}L${cx - r * 0.32 * scale} ${cy - r * 0.55 * scale}L${cx} ${cy - r * 1.08 * scale}L${cx + r * 0.32 * scale} ${cy - r * 0.55 * scale}Z`} transform={t} />);
    else out.push(<circle key={i} cx={cx} cy={cy - r * 0.55 * scale} r={r * 0.42 * scale} transform={t} />);
  }
  return <g fill={sp.colour} stroke="rgba(0,0,0,.18)" stroke-width=".6">{out}</g>;
}

function Leaves({ cx, base, h, n }: { cx: number; base: number; h: number; n: number }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = base - h * (0.25 + 0.5 * (i / Math.max(1, n - 1)));
    const side = i % 2 ? 1 : -1;
    out.push(<path key={i} d={`M${cx} ${y}c${side * 4} -6 ${side * 11} -6 ${side * 13} -2c${-side * 4} 5 ${-side * 9} 5 ${-side * 13} 2z`} />);
  }
  return <g class="pl-leaf">{out}</g>;
}

/** A plant in a 60 × 60 square, at a stage from 0 (just planted) to 4 (in bloom). */
export function PlantArt({ species, stage }: { species: PlantId; stage: number }) {
  const sp = SPECIES[species];
  const cx = 30, base = 50;
  if (stage === 0) {
    return <g class="plant"><ellipse class="pl-soil" cx={cx} cy={base - 2} rx="9" ry="3.5" /><ellipse class="pl-seed" cx={cx} cy={base - 4} rx="2.6" ry="1.8" /></g>;
  }
  if (stage === 1) {
    return (
      <g class="plant">
        <path class="pl-stem" d={`M${cx} ${base}v-9`} />
        <path class="pl-leaf" d={`M${cx} ${base - 9}c-3-5-9-6-11-3c3 4 8 4 11 3zM${cx} ${base - 9}c3-5 9-6 11-3c-3 4-8 4-11 3z`} />
      </g>
    );
  }
  if (sp.shape === 'frond') {
    // A fern unrolls fronds instead of flowering.
    const fronds = Math.min(stage + 1, 5);
    return (
      <g class="plant">
        {Array.from({ length: fronds }, (_, i) => {
          const a = -60 + (120 / Math.max(1, fronds - 1)) * i;
          return <path key={i} class="pl-frond" style={{ fill: sp.colour }} transform={`rotate(${fronds === 1 ? 0 : a} ${cx} ${base})`} d={`M${cx} ${base}c-3-10-2-22 0-${14 + stage * 4}c2 8 3 16 0 ${14 + stage * 4}z`} />;
        })}
      </g>
    );
  }
  const h = stage === 2 ? 20 : stage === 3 ? 26 : 30;
  const head = base - h;
  return (
    <g class="plant">
      <path class="pl-stem" d={`M${cx} ${base}V${head + 2}`} />
      <Leaves cx={cx} base={base} h={h} n={stage === 2 ? 2 : 4} />
      {stage === 3 ? (
        <ellipse cx={cx} cy={head} rx="4" ry="6" fill={sp.colour} stroke="rgba(0,0,0,.2)" stroke-width=".6" />
      ) : stage >= 4 ? (
        sp.shape === 'spike' ? (
          <g fill={sp.colour} stroke="rgba(0,0,0,.15)" stroke-width=".5">
            {Array.from({ length: sp.petals }, (_, i) => <ellipse key={i} cx={cx + (i % 2 ? 3 : -3)} cy={head + 8 - i * 3.2} rx="3.4" ry="2.6" />)}
          </g>
        ) : sp.shape === 'cup' ? (
          <path d={`M${cx - 9} ${head - 6}c0 9 4 13 9 13s9-4 9-13l-4.5 4-4.5-6-4.5 6z`} fill={sp.colour} stroke="rgba(0,0,0,.2)" stroke-width=".7" />
        ) : sp.shape === 'layered' ? (
          <g>
            <Petals sp={sp} r={13} cx={cx} cy={head} />
            <Petals sp={{ ...sp, colour: sp.heart, petals: Math.max(4, sp.petals - 2) }} r={8} cx={cx} cy={head} />
            <circle cx={cx} cy={head} r="2.6" fill={sp.heart} />
          </g>
        ) : (
          <g>
            <Petals sp={sp} r={13} cx={cx} cy={head} />
            <circle cx={cx} cy={head} r={sp.shape === 'pointed' ? 4.4 : 3.6} fill={sp.heart} />
          </g>
        )
      ) : null}
    </g>
  );
}

/** What's laid on a square, without its plant. */
export function TileArt({ item }: { item: HomeItemId }) {
  const kind = homeItem(item).kind;
  if (kind === 'bed') {
    return <g class="bed"><rect class="bed-frame" x="5" y="9" width="50" height="46" rx="6" /><rect class="bed-soil" x="10" y="14" width="40" height="36" rx="3" /></g>;
  }
  if (item === 'stepping-stones') return <g class="path-stones"><ellipse cx="19" cy="20" rx="11" ry="8" /><ellipse cx="41" cy="31" rx="12" ry="8.5" /><ellipse cx="22" cy="45" rx="10" ry="7.5" /></g>;
  if (item === 'gravel') {
    return (
      <g class="path-gravel">
        <rect x="2" y="2" width="56" height="56" rx="4" />
        {[[12, 12], [30, 9], [47, 15], [20, 26], [39, 28], [10, 41], [28, 44], [48, 43], [17, 53], [38, 54]].map(([x, y]) => <circle key={`${x}-${y}`} class="grain" cx={x} cy={y} r="1.6" />)}
      </g>
    );
  }
  if (item === 'brick-path') {
    return (
      <g class="path-brick">
        <rect x="2" y="2" width="56" height="56" rx="3" />
        <path d="M2 16h56M2 30h56M2 44h56M22 2v14M44 2v14M12 16v14M34 16v14M54 16v14M22 30v14M44 30v14M12 44v14M34 44v14" />
      </g>
    );
  }
  if (item === 'lawn-edge') {
    return (
      <g class="path-clover">
        {[[14, 16], [40, 12], [27, 30], [12, 44], [46, 40], [32, 50]].map(([x, y]) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}><circle cx="-2.4" cy="-1.5" r="2.6" /><circle cx="2.4" cy="-1.5" r="2.6" /><circle cx="0" cy="2.4" r="2.6" /></g>
        ))}
      </g>
    );
  }
  return (
    <g class="ornament">
      <ellipse class="orn-shadow" cx="30" cy="52" rx="17" ry="4" />
      <g class="orn-ico" transform="translate(9 6) scale(0.08203125)" dangerouslySetInnerHTML={{ __html: ICON_BODIES[ORNAMENT_ICON[item] ?? 'gift'] }} />
    </g>
  );
}

/** A thing for the home garden on its own, as the shop and the summary show it. */
export function ItemPreview({ item }: { item: HomeItemId }) {
  return <svg class="home-preview" viewBox="0 0 60 60" aria-hidden="true"><rect class="lawn" width="60" height="60" rx="10" /><TileArt item={item} /></svg>;
}

/** A seed packet, with a picture of the flower it grows. */
export function PacketArt({ species }: { species: PlantId }) {
  return (
    <svg class="packet" viewBox="0 0 60 60" aria-hidden="true">
      <rect class="packet-paper" x="10" y="4" width="40" height="52" rx="4" />
      <path class="packet-fold" d="M10 14h40" />
      <g transform="translate(0 4) scale(1)"><PlantArt species={species} stage={4} /></g>
    </svg>
  );
}
