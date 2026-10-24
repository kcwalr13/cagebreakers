import { speciesById } from '../content/species';
import { ICON_BODIES, type IconName } from './icons';

function Glyph({ name, x, y, size, class: cls }: { name: IconName; x: number; y: number; size: number; class: string }) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 512 512" class={cls}>
      <g dangerouslySetInnerHTML={{ __html: ICON_BODIES[name] }} />
    </svg>
  );
}

/**
 * A piece on the page, centred on (x, y). A bare number (the M1 toy) is an ink token;
 * a unit adds its Kin's tincture and emblem, its Calling badge and its stars.
 */
export function TokenShape({ n, species, stars = 1, x, y, r, class: cls = '' }: {
  n: number; species?: string; stars?: number; x: number; y: number; r: number; class?: string;
}) {
  if (!species) {
    return (
      <g class={`token ${cls}`}>
        <circle class="tok-bg" cx={x} cy={y} r={r} />
        <circle class="tok-ring" cx={x} cy={y} r={r - 3} />
        <text class="tok-num" x={x} y={y + r * 0.42} font-size={r * 1.22}>{n}</text>
      </g>
    );
  }
  const sp = speciesById(species);
  const er = r * 0.8, br = r * 0.38;
  const pips = stars > 1 ? Array.from({ length: stars }, (_, i) => {
    const a = Math.PI * 0.75 + (i - (stars - 1) / 2) * 0.42;
    return <circle key={i} class="pip" cx={x + Math.cos(a) * (r - 1)} cy={y + Math.sin(a) * (r - 1)} r={r * 0.13} />;
  }) : null;
  return (
    <g class={`token unit kin-${sp.kin} ${cls}`}>
      <circle class="tok-bg" cx={x} cy={y} r={r} />
      <circle class="tok-ring" cx={x} cy={y} r={r - 2.6} />
      <Glyph name={sp.kin} x={x - er / 2} y={y - r * 0.86} size={er} class="tok-emblem" />
      <text class="tok-num" x={x} y={y + r * 0.66} font-size={r * 1.02}>{n}</text>
      <circle class="badge" cx={x + r * 0.76} cy={y + r * 0.76} r={br} />
      <Glyph name={sp.calling} x={x + r * 0.76 - br * 0.64} y={y + r * 0.76 - br * 0.64} size={br * 1.28} class="badge-icon" />
      {pips}
    </g>
  );
}

/** A standalone token, for the tray, the bench, cards and the drag ghost. */
export function TokenSvg({ n, species, stars, size, class: cls = '' }: { n: number; species?: string; stars?: number; size: number; class?: string }) {
  const pad = species ? 3 : 1;
  const r = size / 2 - pad;
  return (
    <svg class="token-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <TokenShape n={n} species={species} stars={stars} x={size / 2} y={size / 2} r={r} class={cls} />
    </svg>
  );
}
