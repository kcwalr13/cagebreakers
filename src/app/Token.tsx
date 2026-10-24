import { speciesById } from '../content/species';
import type { RelicId } from '../content/types';
import { ICON_BODIES, type IconName } from './icons';

function Glyph({ name, x, y, size, class: cls }: { name: IconName; x: number; y: number; size: number; class: string }) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 512 512" class={cls}>
      <g dangerouslySetInnerHTML={{ __html: ICON_BODIES[name] }} />
    </svg>
  );
}

function Pips({ stars, x, y, r }: { stars: number; x: number; y: number; r: number }) {
  if (stars <= 1) return null;
  return (
    <>
      {Array.from({ length: stars }, (_, i) => {
        const a = Math.PI * 0.75 + (i - (stars - 1) / 2) * 0.42;
        return <circle key={i} class="pip" cx={x + Math.cos(a) * (r - 1)} cy={y + Math.sin(a) * (r - 1)} r={r * 0.13} />;
      })}
    </>
  );
}

function Badge({ icon, x, y, r, cls }: { icon: IconName; x: number; y: number; r: number; cls: string }) {
  return (
    <>
      <circle class={cls} cx={x} cy={y} r={r} />
      <Glyph name={icon} x={x - r * 0.64} y={y - r * 0.64} size={r * 1.28} class={`${cls}-icon`} />
    </>
  );
}

export interface TokenProps {
  n: number;
  species?: string;
  stars?: number;
  relic?: RelicId;
  /** For a Blank in a sealed cage: the number it stands for. */
  shown?: number;
  x: number;
  y: number;
  r: number;
  class?: string;
}

/**
 * A piece on the page, centred on (x, y). A bare number (the M1 toy) is an ink token;
 * a unit adds its Kin's tincture and emblem, its Calling badge, its stars and any relic.
 * Misprints are printed wrong: the Blank is unprinted vellum, the Smudge's numeral runs.
 */
export function TokenShape({ n, species, stars = 1, relic, shown, x, y, r, class: cls = '' }: TokenProps) {
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
  const kin = sp.kin ?? `misprint mis-${sp.misprint}`;
  return (
    <g class={`token unit kin-${kin} ${cls}`}>
      <circle class="tok-bg" cx={x} cy={y} r={r} />
      <circle class="tok-ring" cx={x} cy={y} r={r - 2.6} />
      {sp.misprint === 'smudge' ? <circle class="tok-misreg" cx={x + r * 0.08} cy={y - r * 0.06} r={r - 2.6} /> : null}
      {sp.kin ? <Glyph name={sp.kin} x={x - er / 2} y={y - r * 0.86} size={er} class="tok-emblem" />
        : sp.misprint === 'smudge' ? <Glyph name="smudge" x={x - er / 2} y={y - r * 0.86} size={er} class="tok-emblem" /> : null}
      {sp.misprint === 'blank'
        ? (shown ? <text class="tok-num ghost" x={x} y={y + r * 0.42} font-size={r * 1.1}>{shown}</text> : <line class="tok-blank" x1={x - r * 0.35} x2={x + r * 0.35} y1={y + r * 0.28} y2={y + r * 0.28} />)
        : sp.misprint === 'smudge'
          ? <>
            <text class="tok-num run" x={x + r * 0.09} y={y + r * 0.72} font-size={r * 1.02}>{n}</text>
            <text class="tok-num" x={x} y={y + r * 0.66} font-size={r * 1.02}>{n}</text>
          </>
          : <text class="tok-num" x={x} y={y + r * 0.66} font-size={r * 1.02}>{n}</text>}
      <Badge icon={sp.calling} x={x + r * 0.76} y={y + r * 0.76} r={br} cls="badge" />
      {relic ? <Badge icon={relic} x={x + r * 0.76} y={y - r * 0.76} r={br} cls="relic" /> : null}
      <Pips stars={stars} x={x} y={y} r={r} />
    </g>
  );
}

/** The Domino: one body across two cells, a number on each half. */
export function DominoShape({ n, n2, species, stars = 1, relic, x1, y1, x2, y2, r, class: cls = '' }: {
  n: number; n2: number; species: string; stars?: number; relic?: RelicId; x1: number; y1: number; x2: number; y2: number; r: number; class?: string;
}) {
  const sp = speciesById(species);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const flat = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
  const br = r * 0.38;
  return (
    <g class={`token unit domino kin-misprint mis-domino ${cls}`}>
      <rect class="tok-bg" x={mx - len / 2 - r} y={my - r} width={len + 2 * r} height={2 * r} rx={r} transform={`rotate(${angle} ${mx} ${my})`} />
      <rect class="tok-ring" x={mx - len / 2 - r + 2.6} y={my - r + 2.6} width={len + 2 * r - 5.2} height={2 * r - 5.2} rx={r - 2.6} transform={`rotate(${angle} ${mx} ${my})`} />
      <line class="tok-divider" x1={mx} y1={my - r * 0.7} x2={mx} y2={my + r * 0.7} transform={`rotate(${angle} ${mx} ${my})`} />
      <text class="tok-num" x={x1} y={y1 + r * 0.4} font-size={r * 1.12}>{n}</text>
      <text class="tok-num" x={x2} y={y2 + r * 0.4} font-size={r * 1.12}>{n2}</text>
      {/* Badges sit on the long edges at the join: below and above when lying flat, right and left when standing. */}
      <Badge icon={sp.calling} x={mx + (flat ? 0 : r * 0.8)} y={my + (flat ? r * 0.8 : 0)} r={br} cls="badge" />
      {relic ? <Badge icon={relic} x={mx - (flat ? 0 : r * 0.8)} y={my - (flat ? r * 0.8 : 0)} r={br} cls="relic" /> : null}
      <Pips stars={stars} x={x1} y={y1} r={r} />
    </g>
  );
}

/** A standalone token, for the tray, the bench, cards and the drag ghost. */
export function TokenSvg({ n, n2, species, stars, relic, size, class: cls = '' }: {
  n: number; n2?: number; species?: string; stars?: number; relic?: RelicId; size: number; class?: string;
}) {
  const pad = species ? 3 : 1;
  if (species && speciesById(species).misprint === 'domino') {
    const r = size * 0.26;
    return (
      <svg class="token-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <DominoShape n={n} n2={n2 ?? n} species={species} stars={stars} relic={relic} x1={size / 2 - r} y1={size / 2} x2={size / 2 + r} y2={size / 2} r={r} class={cls} />
      </svg>
    );
  }
  const r = size / 2 - pad;
  return (
    <svg class="token-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <TokenShape n={n} species={species} stars={stars} relic={relic} x={size / 2} y={size / 2} r={r} class={cls} />
    </svg>
  );
}
