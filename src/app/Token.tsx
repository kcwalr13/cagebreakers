export interface TokenProps {
  n: number;
  x: number;
  y: number;
  r: number;
  /** Dealt this round: pencilled (outlined) until the round is inked. */
  fresh?: boolean;
  class?: string;
}

/** A number on the page: a round token centred on (x, y), solid once inked, outlined while pencilled. */
export function TokenShape({ n, x, y, r, fresh, class: cls = '' }: TokenProps) {
  return (
    <g class={`token${fresh ? ' fresh' : ''} ${cls}`}>
      <circle class="tok-bg" cx={x} cy={y} r={r} />
      <circle class="tok-ring" cx={x} cy={y} r={r - 3} />
      <text class="tok-num" x={x} y={y + r * 0.42} font-size={r * 1.22}>{n}</text>
    </g>
  );
}

/** A standalone token, for the hand, the tray and the drag ghost. */
export function TokenSvg({ n, size, fresh, class: cls = '' }: { n: number; size: number; fresh?: boolean; class?: string }) {
  const r = size / 2 - 1;
  return (
    <svg class="token-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <TokenShape n={n} x={size / 2} y={size / 2} r={r} fresh={fresh} class={cls} />
    </svg>
  );
}
